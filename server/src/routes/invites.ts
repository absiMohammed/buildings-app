import { Router } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { inviteSchema } from '../validators/auth.js';
import { createInvite } from '../services/auth.service.js';
import { InviteToken } from '../models/InviteToken.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { Forbidden, BadRequest } from '../utils/errors.js';
import type { Role } from '../../../shared/types.js';

export const router = Router();

// Returns the count of users in a unit that are either active or invited
// (i.e. "real" occupants, excluding suspended) by role. Pending invites that
// have not been accepted yet are also counted so a slot isn't double-booked
// while waiting for the user to redeem the link.
async function unitOccupants(unitId: Types.ObjectId, role: Role): Promise<number> {
  return User.countDocuments({
    memberships: { $elemMatch: { unitIds: unitId, role } },
    status: { $in: ['active', 'invited'] },
  });
}

router.post(
  '/',
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const {
      email,
      phone,
      firstName,
      lastName,
      role,
      unitId: unitIdSingle,
      unitIds: unitIdsBody,
      buildingId: bodyBuildingId,
      isBuildingAdmin: bodyIsBuildingAdmin,
    } = req.body as {
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      role: Exclude<Role, 'admin'>;
      unitId?: string | null;
      unitIds?: string[];
      buildingId?: string;
      isBuildingAdmin?: boolean;
    };
    // One membership may cover several units; occupancy/owner guards below use
    // the primary (first) unit, and all units are persisted on the membership.
    const unitIdList = unitIdsBody && unitIdsBody.length ? unitIdsBody : unitIdSingle ? [unitIdSingle] : [];
    const unitId = unitIdList[0] ?? null;

    // Rule 1: admin role is never assigned via invite; only promotion of an
    // existing owner (PATCH /users/:id/role) can produce a new admin. The
    // validator already rejects role=admin, so this is defense-in-depth.
    if ((role as string) === 'admin') {
      throw Forbidden('Admin role is granted by promotion, not by invite.');
    }

    // A unit is optional in two cases: (a) 'independent' staff (guard/cleaner)
    // never belong to an apartment, and (b) the system admin appointing the
    // building admin BEFORE any units exist. Every other invite needs a unit.
    const adminAppointingBuildingAdmin =
      (me.role === 'admin' || !!me.isBuildingAdmin) && role === 'owner' && !!bodyIsBuildingAdmin;
    const unitOptional = role === 'independent' || adminAppointingBuildingAdmin;
    if (!unitId && !unitOptional) {
      throw BadRequest('unitId is required');
    }
    const unit = unitId ? await Unit.findById(unitId) : null;
    if (unitId && !unit) throw BadRequest('Unit not found');
    const unitObjectId = (unit?._id as Types.ObjectId | undefined) ?? null;

    // Resolve the target building. System admins (building-agnostic) must
    // pass buildingId in the body; if they also passed a unit, the unit
    // must belong to that building. For owner/renter the building is
    // implicitly `me.buildingId` and the unit must belong to it.
    let targetBuildingId: Types.ObjectId;
    if (me.role === 'admin') {
      if (!bodyBuildingId) throw BadRequest('buildingId is required for system admin invites');
      if (unit && unit.buildingId.toString() !== bodyBuildingId)
        throw BadRequest('Unit does not belong to the provided building');
      targetBuildingId = new Types.ObjectId(bodyBuildingId);
    } else {
      if (!me.buildingId) throw Forbidden('You have no building context');
      if (unit && unit.buildingId.toString() !== me.buildingId)
        throw Forbidden('Unit does not belong to your building');
      targetBuildingId = new Types.ObjectId(me.buildingId);
    }

    // Inviter access control. The system admin can create ANY building role
    // in the target building (owner/renter/dependent/independent) and may flag
    // the membership as a building admin; a building may have several admins.
    if (me.role === 'admin') {
      // No role restriction — unit/occupancy rules below still apply.
    } else if (me.isBuildingAdmin) {
      // Building admin manages their whole building: any role, any unit.
      // (Building scoping was already enforced above; their own role in the
      // building — owner, renter, … — is irrelevant to this power.)
    } else if (me.role === 'owner') {
      // Owner invites always have a unit (route guard above), but TS can't
      // narrow through the conditional so we re-assert here.
      if (!unit) throw BadRequest('unitId is required');
      if (unit.ownerId?.toString() !== me.sub)
        throw Forbidden('You can only invite into your own unit.');
      if (role === 'owner') throw Forbidden('Owners cannot invite another owner.');
    } else if (me.role === 'renter') {
      if (me.unitId !== unitId)
        throw Forbidden('You can only invite into your own unit.');
      if (role !== 'dependent')
        throw Forbidden('Renters can only invite dependents.');
    } else {
      throw Forbidden('You cannot invite users.');
    }

    // Owner/tenant per-unit uniqueness is enforced centrally in createInvite
    // (it checks every requested unit, not just the primary one).

    // Rule 4-7: dependent policy. Always unit-scoped — dependents must live
    // in a specific unit, so admin's no-unit path never reaches here (admin
    // can only invite owners anyway).
    let linkedOwnerId: Types.ObjectId | null = null;
    if (role === 'dependent') {
      if (!unitObjectId) throw BadRequest('Dependents require a unit');
      const hasRenter = (await unitOccupants(unitObjectId, 'renter')) > 0;
      if (me.role === 'admin' || me.isBuildingAdmin) {
        // Rule 4: admin has no quota. Link dependents to the renter (if any)
        // or to the owner so the invite still has a sensible parent ref.
        if (hasRenter) {
          const renter = await User.findOne({
            memberships: { $elemMatch: { unitIds: unitObjectId, role: 'renter' } },
            status: { $in: ['active', 'invited'] },
          });
          linkedOwnerId = (renter?._id as Types.ObjectId | undefined) ?? null;
        } else {
          linkedOwnerId = unit?.ownerId ?? null;
        }
      } else if (me.role === 'owner') {
        // Rule 6: owner can add dependents only if there is no renter.
        if (hasRenter) {
          throw Forbidden('A renter is present — they are responsible for inviting dependents.');
        }
        // Rule 5: enforce per-owner maxDependents quota.
        await enforceDependentQuota(me.sub, unitObjectId);
        linkedOwnerId = new Types.ObjectId(me.sub);
      } else if (me.role === 'renter') {
        // Rule 5 + 7: renter manages dependents while present.
        await enforceDependentQuota(me.sub, unitObjectId);
        linkedOwnerId = new Types.ObjectId(me.sub);
      }
    }

    // The system admin or an existing building admin may set the
    // building-admin flag (a building can have several admins), and it can
    // apply to any building-scoped role, not owners alone.
    const isBuildingAdmin = (me.role === 'admin' || !!me.isBuildingAdmin) && !!bodyIsBuildingAdmin;

    const result = await createInvite({
      email,
      phone,
      firstName,
      lastName,
      role,
      buildingId: targetBuildingId,
      unitIds: unitIdList,
      linkedOwnerId,
      invitedBy: new Types.ObjectId(me.sub),
      isBuildingAdmin,
    });
    res.status(201).json(result);
  })
);

async function enforceDependentQuota(
  inviterId: string,
  unitId: Types.ObjectId
): Promise<void> {
  const inviter = await User.findById(inviterId);
  if (!inviter) throw Forbidden();
  const cap = inviter.settings?.maxDependents;
  // null/undefined = no quota set; default to 0 so admin must explicitly
  // grant dependents to non-admin users.
  const allowed = typeof cap === 'number' ? cap : 0;
  const existing = await User.countDocuments({
    memberships: { $elemMatch: { unitIds: unitId, role: 'dependent', linkedOwnerId: inviter._id } },
    status: { $in: ['active', 'invited'] },
  });
  if (existing >= allowed) {
    throw Forbidden(
      `Dependent limit reached (${existing}/${allowed}). Ask the admin to raise your cap.`
    );
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const filter: Record<string, unknown> = { buildingId: me.buildingId, usedAt: null };
    if (me.role !== 'admin') filter.invitedBy = me.sub;
    const invites = await InviteToken.find(filter).sort({ createdAt: -1 });
    res.json({ invites });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const id = req.params.id;
    const invite = await InviteToken.findById(id);
    if (!invite) {
      res.status(204).end();
      return;
    }
    if (
      me.role !== 'admin' &&
      invite.invitedBy?.toString() !== me.sub
    ) {
      throw Forbidden();
    }
    await invite.deleteOne();
    res.status(204).end();
  })
);
