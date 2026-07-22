import { Router } from 'express';
import { getDoorState, isOnline, sendTrigger } from '../services/gateHub.js';
import { ServiceUnavailable, Forbidden } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { Building } from '../models/Building.js';

export const router = Router();

// Any authenticated user can fire the gate, unless the building admin has
// disabled gate access (settings.access.gate.enabled === false).
router.post(
  '/trigger',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (me.buildingId) {
      const b = await Building.findById(me.buildingId).lean();
      const gate = (b?.settings as { access?: { gate?: { enabled?: boolean } } } | undefined)?.access?.gate;
      if (gate && gate.enabled === false) throw Forbidden('Gate access is disabled for this building');
    }
    const ok = sendTrigger();
    if (!ok) throw ServiceUnavailable('Gate device offline');
    res.json({ ok: true });
  }),
);

router.get('/status', (_req, res) => {
  res.json({ online: isOnline(), doorState: getDoorState() });
});
