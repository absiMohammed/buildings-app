import { Types } from 'mongoose';
import { User, type UserDoc, membershipFor, membershipsForBuilding, primaryMembership } from '../models/User.js';
import { InviteToken } from '../models/InviteToken.js';
import { Unit } from '../models/Unit.js';
import { Building } from '../models/Building.js';
import {
  TRIAL_DAYS,
  assertPlanAllowsNewUser,
  assertPlanAllowsNewDependent,
} from './plans.service.js';
import {
  hashPassword,
  verifyPassword,
  sha256,
  randomToken,
} from '../utils/hash.js';
import {
  signAccessToken,
  signRefreshToken,
  type AccessTokenPayload,
} from '../utils/jwt.js';
import { BadRequest, Conflict, NotFound, Unauthorized, Forbidden } from '../utils/errors.js';
import { sendOnboarding, buildOnboardingMessage, waMeLink } from './whatsapp.service.js';
import type { BuildingRole } from '../../../shared/types.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function normalizePhone(v: string): string {
  // Keep leading '+' and digits only.
  const trimmed = v.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

// Build the access-token payload for a user scoped to ONE active membership
// (or the system-admin context). `activeBuildingId` selects which membership
// is active; defaults to the first when omitted.
export function tokenPayload(user: UserDoc, activeBuildingId?: string | null): AccessTokenPayload {
  const sub = user._id.toString();
  if (user.systemRole === 'admin') {
    return { sub, role: 'admin', buildingId: null, unitId: null, isBuildingAdmin: false };
  }
  const bid = activeBuildingId ?? user.memberships[0]?.buildingId;
  const m = primaryMembership(user, bid);
  if (!m) throw Forbidden('This account is not attached to any building.');
  // A user can hold several units in one building across memberships
  // (owner of 1A, tenant of 2B). Unit-scoped routes filter by the union.
  const unitIds = membershipsForBuilding(user, bid).flatMap((mm) =>
    (mm.unitIds ?? []).map((u) => String(u)),
  );
  return {
    sub,
    role: m.role,
    buildingId: String(m.buildingId),
    unitId: m.unitIds?.[0] ? String(m.unitIds[0]) : null,
    unitIds,
    isBuildingAdmin: !!m.isBuildingAdmin,
  };
}

/** Re-mint an access token for a different building the user belongs to. */
export async function switchActiveBuilding(userId: string, buildingId: string) {
  const user = await User.findById(userId);
  if (!user) throw Unauthorized('Account not found');
  if (user.systemRole === 'admin') throw BadRequest('System admin has no building context');
  if (!membershipFor(user, buildingId)) throw Forbidden('You do not belong to this building.');
  return { user, accessToken: signAccessToken(tokenPayload(user, buildingId)) };
}

export async function loginWithPassword(identifier: string, password: string) {
  const trimmed = identifier.trim();
  const user = looksLikeEmail(trimmed)
    ? await User.findOne({ email: trimmed.toLowerCase() })
    : await User.findOne({ phone: normalizePhone(trimmed) });
  if (!user || !user.passwordHash) throw Unauthorized('Invalid credentials');
  if (user.status !== 'active') throw Forbidden('Account not active');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw Unauthorized('Invalid credentials');

  const accessToken = signAccessToken(tokenPayload(user));
  const refreshRaw = randomToken(48);
  const refreshHash = sha256(refreshRaw);
  user.refreshTokenHash = refreshHash;
  user.lastLoginAt = new Date();
  await user.save();

  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: refreshHash });
  return { user, accessToken, refreshToken };
}

export async function refresh(userId: string, jti: string) {
  const user = await User.findById(userId);
  if (!user) throw Unauthorized('Invalid refresh');
  if (user.refreshTokenHash !== jti) throw Unauthorized('Refresh token revoked');

  // Rotate the refresh token on every use: mint a new secret, persist its
  // hash (invalidating the presented token), and hand back the new pair.
  // A replay of the old token now fails the hash check above → revoked.
  const accessToken = signAccessToken(tokenPayload(user));
  const refreshRaw = randomToken(48);
  user.refreshTokenHash = sha256(refreshRaw);
  await user.save();
  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: user.refreshTokenHash });
  return { accessToken, refreshToken };
}

export async function logout(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

// Self-service password change. Verifies the current password, sets the new
// one, clears the must-change flag, and rotates all sessions so any other
// device holding the old credentials is forced to re-authenticate.
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  activeBuildingId?: string | null,
): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await User.findById(userId);
  if (!user || !user.passwordHash) throw Unauthorized('Invalid credentials');
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw Unauthorized('Current password is incorrect');
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  // Revoke OTHER live sessions but keep THIS one alive: set the cutoff a few
  // seconds in the past so the token we mint below (iat ≈ now) still passes,
  // while any older access token is rejected. Then hand back a fresh pair so
  // the caller isn't logged out by their own password change.
  user.sessionsRevokedAt = new Date(Date.now() - 10_000);
  const refreshRaw = randomToken(48);
  user.refreshTokenHash = sha256(refreshRaw);
  await user.save();
  const accessToken = signAccessToken(tokenPayload(user, activeBuildingId));
  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: user.refreshTokenHash });
  return { accessToken, refreshToken };
}

// Revokes ALL live sessions for a user, not just the calling one. Bumps
// `sessionsRevokedAt` so any in-flight access tokens (which are otherwise
// valid up to the JWT TTL) are rejected by the auth middleware, and clears
// the refresh token hash so the refresh flow can't mint new ones.
export async function logoutAll(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    refreshTokenHash: null,
    sessionsRevokedAt: new Date(),
  });
}

interface CreateInviteArgs {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  role: BuildingRole;
  buildingId: Types.ObjectId | string;
  /** One or more units the user occupies in this building. */
  unitIds?: (Types.ObjectId | string)[];
  /** Compat: a single unit; folded into `unitIds`. */
  unitId?: Types.ObjectId | string | null;
  linkedOwnerId?: Types.ObjectId | string | null;
  invitedBy: Types.ObjectId | string;
  /** Flag this membership as the building admin. */
  isBuildingAdmin?: boolean;
}

export interface CreateInviteResult {
  /** Always true — the user is created/updated and ready to log in. */
  sent: true;
  channel: 'email' | 'sms';
  /** Initial password to share — only present when a NEW user was created.
   *  Adding a membership to an existing user returns no password. */
  defaultPassword?: string;
  /** True when this added a building to an already-existing phone. */
  addedMembership?: boolean;
  /** wa.me click-to-send link with the onboarding message pre-filled (new users). */
  whatsappUrl?: string;
}

/**
 * The notification stack (email/SMS) isn't wired up, so we skip the
 * pending-invite flow entirely: the new user is created as `active` with
 * a known default password (`password`). The admin shares those creds out
 * of band. The user can change the password later from their profile.
 *
 * The name `createInvite` is kept for backwards compat with the existing
 * mobile/web POST /invites callers, even though no invite token is
 * actually created.
 */
export async function createInvite(args: CreateInviteArgs): Promise<CreateInviteResult> {
  const phone = args.phone ? normalizePhone(args.phone) : null;
  if (!phone) throw BadRequest('phone is required');
  // Subscription tiers cap the building's member count; trial is unlimited.
  await assertPlanAllowsNewUser(String(args.buildingId));
  // Dependents are additionally capped PER UNIT by the plan tier (basic:
  // none, pro: 1, premium: unlimited).
  if (args.role === 'dependent') {
    for (const uid of args.unitIds ?? []) {
      await assertPlanAllowsNewDependent(String(args.buildingId), String(uid));
    }
    if (args.unitId) {
      await assertPlanAllowsNewDependent(String(args.buildingId), String(args.unitId));
    }
  }
  const email = args.email?.toLowerCase().trim() || null;

  // Gather the requested units. 'independent' (guard/staff) and building-admin
  // appointments before units exist may have none.
  const unitIds = [
    ...(args.unitIds ?? []),
    ...(args.unitId ? [args.unitId] : []),
  ].map((u) => new Types.ObjectId(String(u)));
  const appointingBuildingAdmin = !!args.isBuildingAdmin;
  const unitOptional = appointingBuildingAdmin || args.role === 'independent';
  if (!unitOptional && unitIds.length === 0) {
    throw BadRequest('At least one unit is required for this role.');
  }
  for (const uid of unitIds) {
    const unit = await Unit.findOne({ _id: uid, buildingId: args.buildingId });
    if (!unit) throw NotFound('Unit not found in this building');
  }

  const membership = {
    buildingId: new Types.ObjectId(String(args.buildingId)),
    role: args.role,
    unitIds,
    isBuildingAdmin: !!args.isBuildingAdmin,
    linkedOwnerId: args.linkedOwnerId ? new Types.ObjectId(String(args.linkedOwnerId)) : null,
  };

  // Keep Unit ownership/occupancy in sync so unit rosters + owner-scoped
  // checks work: mark the user an occupant of each unit, and set ownerId for
  // owner memberships.
  async function syncUnits(userId: Types.ObjectId): Promise<void> {
    if (!unitIds.length) return;
    await Unit.updateMany({ _id: { $in: unitIds } }, { $addToSet: { occupants: userId } });
    if (args.role === 'owner') {
      await Unit.updateMany({ _id: { $in: unitIds } }, { $set: { ownerId: userId } });
    }
  }

  // Phone is the global identity: if it already exists, ADD (or merge) a
  // membership for this building instead of creating a duplicate account.
  const existing = await User.findOne({ phone });

  // Unit occupancy caps: at most ONE owner and ONE tenant per unit; followers
  // (dependents) are unlimited. Checked per requested unit, excluding the user
  // being created/edited. Independent staff hold no unit, so they're exempt.
  if ((args.role === 'owner' || args.role === 'renter') && unitIds.length) {
    for (const uid of unitIds) {
      const holder = await User.findOne({
        ...(existing ? { _id: { $ne: existing._id } } : {}),
        memberships: { $elemMatch: { unitIds: uid, role: args.role } },
        status: { $in: ['active', 'invited'] },
      }).lean();
      if (holder) {
        throw Conflict(
          args.role === 'owner' ? 'This unit already has an owner.' : 'This unit already has a tenant.',
        );
      }
    }
  }

  if (existing) {
    if (existing.systemRole === 'admin') throw Conflict('That number belongs to the system admin.');

    // A user can hold different roles on different units of a building, but
    // never two roles on the SAME unit. Reject if a requested unit is already
    // held under a different role for this user in this building.
    for (const uid of unitIds) {
      const clash = membershipsForBuilding(existing, args.buildingId).find(
        (m) => m.role !== args.role && m.unitIds.some((x) => String(x) === String(uid)),
      );
      if (clash) throw Conflict('This user already has a different role on that unit.');
    }

    // Memberships are keyed by (building, role): merge units into the matching
    // role, or add a new membership for a new role in the same building.
    const current = membershipFor(existing, args.buildingId, args.role);
    if (current) {
      const seen = new Set(current.unitIds.map((u) => String(u)));
      for (const uid of unitIds) if (!seen.has(String(uid))) current.unitIds.push(uid);
      if (membership.linkedOwnerId) current.linkedOwnerId = membership.linkedOwnerId;
    } else {
      existing.memberships.push(membership);
    }
    // Building-admin is a building-level flag — apply it to every membership
    // the user holds in this building so it stays consistent.
    if (args.isBuildingAdmin) {
      for (const m of membershipsForBuilding(existing, args.buildingId)) m.isBuildingAdmin = true;
    }
    if (email && !existing.email) existing.email = email;
    if (args.firstName && !existing.firstName) existing.firstName = args.firstName;
    if (args.lastName && !existing.lastName) existing.lastName = args.lastName;
    await existing.save();
    await syncUnits(existing._id);
    return { sent: true, channel: email ? 'email' : 'sms', addedMembership: true };
  }

  const defaultPassword = randomToken(9);
  const passwordHash = await hashPassword(defaultPassword);
  const created = await User.create({
    phone,
    email,
    passwordHash,
    firstName: args.firstName ?? '',
    lastName: args.lastName ?? '',
    systemRole: 'member',
    memberships: [membership],
    status: 'active',
    mustChangePassword: true,
  });
  await syncUnits(created._id);

  // Onboarding message with login + temporary password + app links. Fire-and-
  // forget via the Cloud API (no-ops until configured), and also return a
  // wa.me click-to-send link so the admin can deliver it manually right now.
  const name = `${args.firstName ?? ''} ${args.lastName ?? ''}`.trim();
  void sendOnboarding({ to: phone, name, phone, password: defaultPassword });
  const whatsappUrl = waMeLink(phone, buildOnboardingMessage({ name, phone, password: defaultPassword }));

  return { sent: true, channel: email ? 'email' : 'sms', defaultPassword, whatsappUrl };
}

/**
 * Issue a fresh temporary password for a user and return it plus a wa.me
 * click-to-send link with the new credentials — used to re-share a login
 * (we never store the plaintext password, so "resend" = reset). Also revokes
 * the user's live sessions so the old password stops working immediately.
 */
export async function resetUserCredentials(
  userId: string,
): Promise<{ defaultPassword: string; whatsappUrl: string }> {
  const user = await User.findById(userId);
  if (!user) throw NotFound('User not found');
  const defaultPassword = randomToken(9);
  user.passwordHash = await hashPassword(defaultPassword);
  user.mustChangePassword = true;
  user.refreshTokenHash = null;
  user.sessionsRevokedAt = new Date();
  await user.save();

  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const text = buildOnboardingMessage({ name, phone: user.phone, password: defaultPassword });
  void sendOnboarding({ to: user.phone, name, phone: user.phone, password: defaultPassword });
  return { defaultPassword, whatsappUrl: waMeLink(user.phone, text) };
}

/** A wa.me link to (re)send a user's login info — WITHOUT a password (we don't
 *  store it). For "share how to sign in"; use resetUserCredentials to send a
 *  working password. */
export async function loginShareLink(userId: string): Promise<{ whatsappUrl: string }> {
  const user = await User.findById(userId);
  if (!user) throw NotFound('User not found');
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const text = buildOnboardingMessage({ name, phone: user.phone });
  return { whatsappUrl: waMeLink(user.phone, text) };
}

export interface MembershipInput {
  buildingId: string;
  role: BuildingRole;
  unitIds?: string[];
  isBuildingAdmin?: boolean;
}

/**
 * System-admin edit of an existing user: name, login phone (globally unique),
 * and the FULL set of building/unit/role memberships (replace semantics).
 * Enforces the same rules as creation — units belong to their building, one
 * owner / one tenant per unit, one role per unit for this user — and keeps
 * Unit ownership/occupancy in sync.
 */
export async function updateUserByAdmin(
  userId: string,
  patch: { firstName?: string; lastName?: string; phone?: string; memberships?: MembershipInput[] },
): Promise<UserDoc> {
  const user = await User.findById(userId);
  if (!user) throw NotFound('User not found');

  if (patch.firstName !== undefined) user.firstName = patch.firstName;
  if (patch.lastName !== undefined) user.lastName = patch.lastName;

  if (patch.phone !== undefined) {
    const phone = normalizePhone(patch.phone);
    if (!phone) throw BadRequest('phone is required');
    if (phone !== user.phone) {
      const dupe = await User.findOne({ phone, _id: { $ne: user._id } }).lean();
      if (dupe) throw Conflict('A user with this number already exists');
      user.phone = phone;
    }
  }

  if (patch.memberships) {
    if (user.systemRole === 'admin') throw BadRequest('System admins have no building memberships.');

    // Validate + build the new membership set.
    const built: Array<{
      buildingId: Types.ObjectId;
      role: BuildingRole;
      unitIds: Types.ObjectId[];
      isBuildingAdmin: boolean;
      linkedOwnerId: null;
    }> = [];
    const unitRole = new Map<string, BuildingRole>();
    for (const d of patch.memberships) {
      const bId = new Types.ObjectId(String(d.buildingId));
      const unitIds = [...new Set((d.unitIds ?? []).map((x) => String(x)))].map((x) => new Types.ObjectId(x));
      for (const uid of unitIds) {
        const unit = await Unit.findOne({ _id: uid, buildingId: bId });
        if (!unit) throw NotFound('Unit not found in this building');
        const prev = unitRole.get(String(uid));
        if (prev && prev !== d.role) throw Conflict('This user cannot have two roles on the same unit.');
        unitRole.set(String(uid), d.role);
        if (d.role === 'owner' || d.role === 'renter') {
          const holder = await User.findOne({
            _id: { $ne: user._id },
            memberships: { $elemMatch: { unitIds: uid, role: d.role } },
            status: { $in: ['active', 'invited'] },
          }).lean();
          if (holder) {
            throw Conflict(d.role === 'owner' ? 'This unit already has an owner.' : 'This unit already has a tenant.');
          }
        }
      }
      built.push({ buildingId: bId, role: d.role, unitIds, isBuildingAdmin: !!d.isBuildingAdmin, linkedOwnerId: null });
    }

    // Old vs new unit sets (for occupancy/ownership sync) — computed BEFORE
    // we replace the in-memory memberships.
    const oldAll = new Set(user.memberships.flatMap((m) => m.unitIds.map((u) => String(u))));
    const oldOwned = new Set(
      user.memberships.filter((m) => m.role === 'owner').flatMap((m) => m.unitIds.map((u) => String(u))),
    );
    const newAll = new Set(built.flatMap((m) => m.unitIds.map((u) => String(u))));
    const newOwned = new Set(built.filter((m) => m.role === 'owner').flatMap((m) => m.unitIds.map((u) => String(u))));

    user.memberships.splice(0, user.memberships.length, ...(built as unknown as (typeof user.memberships)[number][]));
    await user.save();

    const toIds = (s: string[]) => s.map((x) => new Types.ObjectId(x));
    const removed = [...oldAll].filter((u) => !newAll.has(u));
    if (removed.length) {
      await Unit.updateMany({ _id: { $in: toIds(removed) } }, { $pull: { occupants: user._id } });
    }
    const ownerCleared = [...oldOwned].filter((u) => !newOwned.has(u));
    if (ownerCleared.length) {
      await Unit.updateMany({ _id: { $in: toIds(ownerCleared) }, ownerId: user._id }, { $unset: { ownerId: '' } });
    }
    if (newAll.size) {
      await Unit.updateMany({ _id: { $in: toIds([...newAll]) } }, { $addToSet: { occupants: user._id } });
    }
    if (newOwned.size) {
      await Unit.updateMany({ _id: { $in: toIds([...newOwned]) } }, { $set: { ownerId: user._id } });
    }
    return user;
  }

  await user.save();
  return user;
}

/**
 * Create another system super-admin (building-agnostic). Returns a generated
 * initial password for the creator to share; the new admin must change it.
 */
export async function createSystemAdmin(args: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ defaultPassword: string }> {
  const phone = args.phone ? normalizePhone(args.phone) : null;
  if (!phone) throw BadRequest('phone is required');
  const email = args.email?.toLowerCase().trim() || null;
  const existing = await User.findOne({ phone });
  if (existing) throw Conflict('A user with this number already exists');

  const defaultPassword = randomToken(9);
  const passwordHash = await hashPassword(defaultPassword);
  await User.create({
    phone,
    email,
    passwordHash,
    firstName: args.firstName ?? '',
    lastName: args.lastName ?? '',
    systemRole: 'admin',
    memberships: [],
    status: 'active',
    mustChangePassword: true,
  });
  return { defaultPassword };
}

export async function acceptInvite(rawToken: string, password: string, names: { firstName?: string; lastName?: string; phone?: string }) {
  const tokenHash = sha256(rawToken);
  const invite = await InviteToken.findOne({ tokenHash });
  if (!invite) throw NotFound('Invite not found');
  if (invite.usedAt) throw BadRequest('Invite already used');
  if (invite.expiresAt.getTime() < Date.now()) throw BadRequest('Invite expired');

  const user = await User.findOne({ email: invite.email });
  if (!user) throw NotFound('User shell missing for invite');

  user.passwordHash = await hashPassword(password);
  user.firstName = names.firstName ?? user.firstName;
  user.lastName = names.lastName ?? user.lastName;
  user.phone = names.phone ?? user.phone;
  user.status = 'active';
  await user.save();

  // If owner accepted, attach to unit
  if (invite.unitId) {
    await Unit.findByIdAndUpdate(invite.unitId, {
      ...(invite.role === 'owner' ? { ownerId: user._id } : {}),
      $addToSet: { occupants: user._id },
    });
  }

  invite.usedAt = new Date();
  await invite.save();

  // Issue session immediately on acceptance
  const accessToken = signAccessToken(tokenPayload(user));
  const refreshRaw = randomToken(48);
  user.refreshTokenHash = sha256(refreshRaw);
  await user.save();
  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: user.refreshTokenHash });

  return { user, accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Self-service signup: create a building + the founder's apartment + their
// account in one shot. The founder becomes an owner flagged as building
// admin, and the building starts a 1-month all-features trial (see
// plans.service.ts). The daily cron suspends the building when the trial
// lapses without a paid plan.
// ---------------------------------------------------------------------------

export interface RegisterBuildingArgs {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  password: string;
  building: { name: string; address?: string; currency?: string; stories: number };
  apartment: { number: string; floor?: number };
}

export async function registerBuilding(args: RegisterBuildingArgs) {
  const phone = normalizePhone(args.phone);
  if (phone.replace(/\D/g, '').length < 6) throw BadRequest('A valid phone number is required');
  const email = args.email?.toLowerCase().trim() || null;

  if (await User.findOne({ phone })) {
    throw Conflict('An account with this phone already exists.');
  }
  if (email && (await User.findOne({ email }))) {
    throw Conflict('An account with this email already exists.');
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const building = await Building.create({
    name: args.building.name,
    address: args.building.address ?? '',
    currency: args.building.currency ?? 'ILS',
    stories: args.building.stories,
    // Active from day one — unlike system-admin-created buildings, the
    // founder IS the building admin, so the "needs admin" gate is met.
    status: 'active',
    subscription: {
      plan: 'trial',
      status: 'trial',
      trialEndsAt,
      currentPeriodEnd: null,
    },
  });

  const unit = await Unit.create({
    buildingId: building._id,
    number: args.apartment.number,
    ...(args.apartment.floor !== undefined ? { floor: args.apartment.floor } : {}),
  });

  const passwordHash = await hashPassword(args.password);
  let user;
  try {
    user = await User.create({
      phone,
      email,
      passwordHash,
      firstName: args.firstName,
      lastName: args.lastName,
      systemRole: 'member',
      status: 'active',
      memberships: [
        {
          buildingId: building._id,
          role: 'owner',
          unitIds: [unit._id],
          isBuildingAdmin: true,
          linkedOwnerId: null,
        },
      ],
    });
  } catch (err) {
    // Signup is all-or-nothing: if the account can't be created (e.g. a
    // unique-index race), don't leave an orphaned building+unit behind.
    await Promise.allSettled([
      Unit.deleteOne({ _id: unit._id }),
      Building.deleteOne({ _id: building._id }),
    ]);
    throw err;
  }

  unit.ownerId = user._id;
  unit.occupants = [user._id];
  await unit.save();

  // Issue a session immediately — same shape as loginWithPassword.
  const accessToken = signAccessToken(tokenPayload(user));
  const refreshRaw = randomToken(48);
  user.refreshTokenHash = sha256(refreshRaw);
  user.lastLoginAt = new Date();
  await user.save();
  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: user.refreshTokenHash });

  return { user, building, accessToken, refreshToken };
}
