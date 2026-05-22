import { Router } from 'express';
import { isOnline, sendUnlock } from '../services/doorHub.js';
import { ServiceUnavailable } from '../utils/errors.js';

export const router = Router();

// Permissive: any authenticated user can unlock the door. The /api/v1
// router applies authenticate() at the top, so unauthenticated requests
// still 401. Tighten with role/building scoping when we move past
// single-tenant.
router.post('/unlock', (_req, res, next) => {
  try {
    const ok = sendUnlock();
    if (!ok) throw ServiceUnavailable('Door device offline');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/status', (_req, res) => {
  res.json({ online: isOnline() });
});
