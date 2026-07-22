import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../../../shared/types.js';

export interface AccessTokenPayload {
  sub: string;
  // The ACTIVE membership's role, or 'admin' for the system super-admin.
  role: Role;
  // The active membership's building. null only for the system admin.
  buildingId: string | null;
  // First unit of the active membership (compat convenience; a membership may
  // cover several units — see the /me payload's `units`). null when none.
  unitId: string | null;
  // Whether the active membership is a building admin.
  isBuildingAdmin?: boolean;
  /** Issued-at timestamp in seconds, set by jsonwebtoken on sign. */
  iat?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // tied to refreshTokenHash on User
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // Pin the algorithm so a token forged with `alg: none` (or any other
  // scheme) is rejected rather than trusted.
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as RefreshTokenPayload;
}
