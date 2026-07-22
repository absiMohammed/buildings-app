import { Router } from 'express';
import { isOnline, sendUnlock } from '../services/doorHub.js';
import { ServiceUnavailable, Forbidden } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { Building } from '../models/Building.js';

export const router = Router();

// Any authenticated user can unlock the door, unless the building admin has
// disabled door access (settings.access.door.enabled === false).
router.post(
  '/unlock',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (me.buildingId) {
      const b = await Building.findById(me.buildingId).lean();
      const door = (b?.settings as { access?: { door?: { enabled?: boolean } } } | undefined)?.access?.door;
      if (door && door.enabled === false) throw Forbidden('Door access is disabled for this building');
    }
    const ok = sendUnlock();
    if (!ok) throw ServiceUnavailable('Door device offline');
    res.json({ ok: true });
  }),
);

router.get('/status', (_req, res) => {
  res.json({ online: isOnline() });
});
