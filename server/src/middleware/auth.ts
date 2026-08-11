import type { Request, RequestHandler } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js';
import { Unauthorized, Forbidden, AppError } from '../utils/errors.js';
import { User } from '../models/User.js';
import { Building } from '../models/Building.js';
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

/**
 * Reject requests scoped to a building that is inactive or suspended
 * (billing lapse). Building admins are still let through to `/me` and
 * `/plans/*` so they can see the paywall and subscribe their way back —
 * everyone else in the building is locked out until it's reactivated.
 * System-admin sessions have no building scope and always pass.
 */
export const enforceBuildingActive: RequestHandler = async (req, _res, next) => {
  const payload = (req as AuthedRequest).user;
  if (!payload?.buildingId || payload.role === 'admin') return next();
  try {
    const building = await Building.findById(payload.buildingId).select('status').lean();
    if (!building) return next(Unauthorized('Building not found'));
    if (building.status === 'active') return next();

    const path = `${req.baseUrl}${req.path}`;
    const paywallAllowed =
      payload.isBuildingAdmin && (path.startsWith('/api/v1/me') || path.startsWith('/api/v1/plans'));
    if (paywallAllowed) return next();

    const code = building.status === 'suspended' ? 'BUILDING_SUSPENDED' : 'BUILDING_INACTIVE';
    return next(new AppError(403, code, 'This building is not active.'));
  } catch (err) {
    return next(err);
  }
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
export const requireBuildingAdmin: RequestHandler = (req, _res, next) => {
  const payload = (req as AuthedRequest).user;
  if (!payload) return next(Unauthorized());
  // The active membership must be a building role flagged as building admin.
  // (Any building role can be a building admin, not just owners.)
  if (payload.role === 'admin') return next(Forbidden('Building admin required'));
  if (!payload.isBuildingAdmin || !payload.buildingId) return next(Forbidden('Building admin required'));
  next();
};

/**
 * Building-scoped handlers expect a non-null buildingId on the caller.
 * `requireBuildingAdmin` already rules out admins, but TypeScript can't
 * narrow `AccessTokenPayload.buildingId` (which is `string | null`)
 * automatically. Use this helper at the top of such handlers to assert
 * non-null and to surface a clear error if a route guard slips.
 */
/**
 * Every unit the caller holds in the active building. Falls back to the
 * legacy single `unitId` for access tokens minted before `unitIds` existed
 * (they age out at the next refresh).
 */
export function unitIdsOf(payload: AccessTokenPayload): string[] {
  if (payload.unitIds?.length) return payload.unitIds;
  return payload.unitId ? [payload.unitId] : [];
}

export function ownBuildingId(req: Request): string {
  const payload = (req as AuthedRequest).user;
  if (!payload?.buildingId) {
    throw Forbidden('This endpoint requires a building context.');
  }
  return payload.buildingId;
}
