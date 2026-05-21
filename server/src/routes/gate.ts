import { Router } from 'express';
import { isOnline, sendTrigger } from '../services/gateHub.js';
import { ServiceUnavailable } from '../utils/errors.js';

export const router = Router();

// Permissive: any authenticated user can fire the gate, no per-building
// scope. The /api/v1 router applies authenticate() at the top, so
// requests without a JWT still 401.
router.post('/trigger', (_req, res, next) => {
  try {
    const ok = sendTrigger();
    if (!ok) throw ServiceUnavailable('Gate device offline');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/status', (_req, res) => {
  res.json({ online: isOnline() });
});
