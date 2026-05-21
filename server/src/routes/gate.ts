import { Router, type RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  requireBuildingAdmin,
  ownBuildingId,
  type AuthedRequest,
} from '../middleware/auth.js';
import { Building } from '../models/Building.js';
import { isOnline, sendTrigger } from '../services/gateHub.js';
import {
  BadRequest,
  NotFound,
  Forbidden,
  Unauthorized,
  ServiceUnavailable,
} from '../utils/errors.js';

export const router = Router();

// System admin OR building admin. Non-admin owners and other roles get 403.
// We can't reuse requireBuildingAdmin alone because it rejects system
// admins (their role is 'admin', not 'owner'). And we can't use
// requireSystemAdmin alone because building admins must work too.
const requireSystemOrBuildingAdmin: RequestHandler = (req, res, next) => {
  const payload = (req as AuthedRequest).user;
  if (!payload) return next(Unauthorized());
  if (payload.role === 'admin') return next();
  return requireBuildingAdmin(req, res, next);
};

router.use(requireSystemOrBuildingAdmin);

// Resolve which building this request acts on. Building admins are pinned
// to their own; system admins must specify buildingId in the body/query.
function resolveBuildingId(req: AuthedRequest, override: string | null): string {
  if (req.user.role === 'admin') {
    if (!override) throw BadRequest('System admin must specify buildingId');
    return override;
  }
  const own = ownBuildingId(req);
  if (override && override !== own) throw Forbidden('Cannot act on another building');
  return own;
}

router.post('/trigger', async (req, res, next) => {
  try {
    const buildingId = resolveBuildingId(
      req as AuthedRequest,
      typeof req.body?.buildingId === 'string' ? req.body.buildingId : null
    );
    const building = await Building.findById(buildingId).select('gateDevice').lean();
    if (!building) throw NotFound('Building not found');
    if (!building.gateDevice?.tokenHash) {
      throw BadRequest('No gate device provisioned for this building');
    }
    const ok = sendTrigger(buildingId);
    if (!ok) throw ServiceUnavailable('Gate device offline');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const provisionSchema = z.object({
  buildingId: z.string().optional(),
  name: z.string().trim().max(60).optional(),
});

router.post('/devices/provision', async (req, res, next) => {
  try {
    const parsed = provisionSchema.parse(req.body ?? {});
    const buildingId = resolveBuildingId(req as AuthedRequest, parsed.buildingId ?? null);
    const plaintext = randomBytes(24).toString('base64url');
    const tokenHash = await bcrypt.hash(plaintext, 10);
    const updated = await Building.findByIdAndUpdate(
      buildingId,
      {
        $set: {
          'gateDevice.tokenHash': tokenHash,
          'gateDevice.name': parsed.name ?? '',
          'gateDevice.lastSeenAt': null,
        },
      },
      { new: true }
    )
      .select('gateDevice')
      .lean();
    if (!updated) throw NotFound('Building not found');
    res.json({
      buildingId,
      name: updated.gateDevice?.name ?? '',
      token: plaintext, // shown ONCE — caller must capture
    });
  } catch (err) {
    next(err);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const buildingId = resolveBuildingId(
      req as AuthedRequest,
      typeof req.query.buildingId === 'string' ? req.query.buildingId : null
    );
    const building = await Building.findById(buildingId).select('gateDevice').lean();
    if (!building) throw NotFound('Building not found');
    res.json({
      provisioned: !!building.gateDevice?.tokenHash,
      online: isOnline(buildingId),
      name: building.gateDevice?.name ?? '',
      lastSeenAt: building.gateDevice?.lastSeenAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/devices', async (req, res, next) => {
  try {
    const buildingId = resolveBuildingId(
      req as AuthedRequest,
      typeof req.query.buildingId === 'string' ? req.query.buildingId : null
    );
    await Building.updateOne(
      { _id: buildingId },
      {
        $set: {
          'gateDevice.tokenHash': null,
          'gateDevice.name': '',
          'gateDevice.lastSeenAt': null,
        },
      }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
