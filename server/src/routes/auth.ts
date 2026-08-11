import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema,
  acceptInviteSchema,
  refreshSchema,
  registerBuildingSchema,
} from '../validators/auth.js';
import {
  loginWithPassword,
  refresh,
  logout,
  logoutAll,
  acceptInvite,
  switchActiveBuilding,
  registerBuilding,
  type RegisterBuildingArgs,
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

// Public self-service signup: creates the building, the founder's apartment
// unit, and the founder as owner + building admin on a 1-month trial, then
// signs them in (same response shape as /login).
router.post(
  '/register-building',
  validate(registerBuildingSchema),
  asyncHandler(async (req, res) => {
    const result = await registerBuilding(req.body as RegisterBuildingArgs);
    res.status(201).json({
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

// Switch which building the session is scoped to (for users who belong to
// several). Re-mints the access token for the chosen membership.
router.post(
  '/switch-building',
  authenticate,
  asyncHandler(async (req, res) => {
    const { buildingId } = req.body as { buildingId?: string };
    if (!buildingId) throw Unauthorized('buildingId is required');
    const result = await switchActiveBuilding((req as AuthedRequest).user.sub, buildingId);
    res.json({
      user: await toUserPayload(result.user, buildingId),
      accessToken: result.accessToken,
    });
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
