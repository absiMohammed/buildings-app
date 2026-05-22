import { Router } from 'express';
import { getDoorState, isOnline, sendTrigger } from '../services/gateHub.js';
import { ServiceUnavailable } from '../utils/errors.js';

export const router = Router();

// Permissive: any authenticated user can fire the gate, no per-building
// scope. The /api/v1 router applies authenticate() at the top, so
// requests without a JWT still 401.
router.post('/trigger', (_req, res, next) => {
  try {
    // Mobile now labels the button "Open gate" or "Close gate" based on
    // the reed-derived doorState, so each press is an explicit toggle
    // intent — always pulse the relay, no skip logic.
    const ok = sendTrigger();
    if (!ok) throw ServiceUnavailable('Gate device offline');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/status', (_req, res) => {
  res.json({ online: isOnline(), doorState: getDoorState() });
});
