import type { Request, RequestHandler } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js';
import { Unauthorized, Forbidden } from '../utils/errors.js';
import { User } from '../models/User.js';
import type { Role } from '../../../shared/types.js';

export interface AuthedRequest extends Request {
  user: AccessTokenPayload;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(Unauthorized('Missing bearer token'));

  const token = header.slice('Bearer '.length).trim();

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(Unauthorized('Invalid or expired token'));
  }

  // Re-check live user state on every request. This is the cost of
  // immediate revocation — we trade a per-request lookup for the ability
  // to kick suspended users and "logout-all" sessions without waiting for
  // the access token's natural expiry.
  try {
    const user = await User.findById(payload.sub)
      .select('status sessionsRevokedAt')
      .lean();
    if (!user) return next(Unauthorized('Account not found'));
    if (user.status !== 'active') return next(Unauthorized('Account suspended'));
    if (
      user.sessionsRevokedAt &&
      typeof payload.iat === 'number' &&
      payload.iat * 1000 < user.sessionsRevokedAt.getTime()
    ) {
      return next(Unauthorized('Session revoked'));
    }
  } catch (err) {
    return next(err);
  }

  (req as AuthedRequest).user = payload;
  next();
};

export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    const user = (req as AuthedRequest).user;
    if (!user) return next(Unauthorized());
    if (!allowed.includes(user.role)) return next(Forbidden('Insufficient role'));
    next();
  };

/**
 * Allow only the system admin role. Use for routes that operate on the
 * Buildings collection itself — list/create/delete buildings, appoint
 * building admins, etc. — and that have no "per-building" scope.
 */
export const requireSystemAdmin: RequestHandler = (req, _res, next) => {
  const user = (req as AuthedRequest).user;
  if (!user) return next(Unauthorized());
  if (user.role !== 'admin') return next(Forbidden('System admin role required'));
  next();
};

/**
 * Allow only an owner with `isBuildingAdmin === true`. Building-management
 * endpoints (units, payments, expenses, settings, …) are scoped to one
 * building, so the system admin role — which is building-agnostic — does
 * NOT pass this guard. System admin uses its own endpoints
 * (`/buildings` CRUD, `POST /invites` with explicit `buildingId`, etc.).
 *
 * Handlers must still scope their queries by `me.buildingId` so a
 * building admin can't reach into a different building's data.
 */
export const requireBuildingAdmin: RequestHandler = async (req, _res, next) => {
  const payload = (req as AuthedRequest).user;
  if (!payload) return next(Unauthorized());
  if (payload.role !== 'owner') return next(Forbidden('Building admin required'));
  try {
    const user = await User.findById(payload.sub).select('isBuildingAdmin').lean();
    if (!user?.isBuildingAdmin) return next(Forbidden('Building admin required'));
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Building-scoped handlers expect a non-null buildingId on the caller.
 * `requireBuildingAdmin` already rules out admins, but TypeScript can't
 * narrow `AccessTokenPayload.buildingId` (which is `string | null`)
 * automatically. Use this helper at the top of such handlers to assert
 * non-null and to surface a clear error if a route guard slips.
 */
export function ownBuildingId(req: Request): string {
  const payload = (req as AuthedRequest).user;
  if (!payload?.buildingId) {
    throw Forbidden('This endpoint requires a building context.');
  }
  return payload.buildingId;
}
