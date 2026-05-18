import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../../../shared/types.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  // null for system admin (no home building); always non-null for any other role.
  buildingId: string | null;
  unitId: string | null;
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
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
