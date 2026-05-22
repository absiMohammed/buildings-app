import { Router } from 'express';
import { getDoorState, isOnline, sendTrigger } from '../services/gateHub.js';
import { ServiceUnavailable } from '../utils/errors.js';

export const router = Router();

// Permissive: any authenticated user can fire the gate, no per-building
// scope. The /api/v1 router applies authenticate() at the top, so
// requests without a JWT still 401.
router.post('/trigger', (_req, res, next) => {
  try {
    // Reed switch says the gate is already open — no point pulsing the
    // contactor again. Returning 200 with a skipped flag keeps the
    // mobile happy-path code while letting the UI swap its busy/done
    // pill for a "already open" one.
    if (getDoorState() === 'open') {
      res.json({ ok: true, skipped: true, reason: 'already_open' });
      return;
    }
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
