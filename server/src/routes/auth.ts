import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema,
  acceptInviteSchema,
  refreshSchema,
} from '../validators/auth.js';
import {
  loginWithPassword,
  refresh,
  logout,
  logoutAll,
  acceptInvite,
} from '../services/auth.service.js';
import { authenticate, type AuthedRequest } from '../middleware/auth.js';
import { verifyRefreshToken } from '../utils/jwt.js';
import { Unauthorized } from '../utils/errors.js';
import { toUserPayload } from '../services/capabilities.service.js';

export const router = Router();

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { identifier, email, password } = req.body as { identifier?: string; email?: string; password: string };
    const result = await loginWithPassword(identifier ?? email ?? '', password);
    res.json({
      user: await toUserPayload(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  })
);

router.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string };
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw Unauthorized('Invalid refresh token');
    }
    const result = await refresh(payload.sub, payload.jti);
    res.json(result);
  })
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await logout((req as AuthedRequest).user.sub);
    res.json({ ok: true });
  })
);

// Sign out from every device. Revokes the refresh token and bumps
// sessionsRevokedAt so all live access tokens are rejected immediately
// by the auth middleware on their next request.
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await logoutAll((req as AuthedRequest).user.sub);
    res.json({ ok: true });
  })
);

router.post(
  '/invite/accept',
  validate(acceptInviteSchema),
  asyncHandler(async (req, res) => {
    const { token, password, firstName, lastName, phone } = req.body as {
      token: string;
      password: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    const result = await acceptInvite(token, password, { firstName, lastName, phone });
    res.json({
      user: await toUserPayload(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  })
);
