import { Types } from 'mongoose';
import { User, type UserDoc } from '../models/User.js';
import { InviteToken } from '../models/InviteToken.js';
import { Unit } from '../models/Unit.js';
import {
  hashPassword,
  verifyPassword,
  sha256,
  randomToken,
} from '../utils/hash.js';
import {
  signAccessToken,
  signRefreshToken,
  type AccessTokenPayload,
} from '../utils/jwt.js';
import { BadRequest, Conflict, NotFound, Unauthorized, Forbidden } from '../utils/errors.js';
import type { Role } from '../../../shared/types.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function normalizePhone(v: string): string {
  // Keep leading '+' and digits only.
  const trimmed = v.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

function tokenPayload(user: UserDoc): AccessTokenPayload {
  return {
    sub: user._id.toString(),
    role: user.role as Role,
    // System admins have no home building; non-admins always do.
    buildingId: user.buildingId ? user.buildingId.toString() : null,
    unitId: user.unitId ? user.unitId.toString() : null,
  };
}

export async function loginWithPassword(identifier: string, password: string) {
  const trimmed = identifier.trim();
  const user = looksLikeEmail(trimmed)
    ? await User.findOne({ email: trimmed.toLowerCase() })
    : await User.findOne({ phone: normalizePhone(trimmed) });
  if (!user || !user.passwordHash) throw Unauthorized('Invalid credentials');
  if (user.status !== 'active') throw Forbidden('Account not active');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw Unauthorized('Invalid credentials');

  const accessToken = signAccessToken(tokenPayload(user));
  const refreshRaw = randomToken(48);
  const refreshHash = sha256(refreshRaw);
  user.refreshTokenHash = refreshHash;
  user.lastLoginAt = new Date();
  await user.save();

  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: refreshHash });
  return { user, accessToken, refreshToken };
}

export async function refresh(userId: string, jti: string) {
  const user = await User.findById(userId);
  if (!user) throw Unauthorized('Invalid refresh');
  if (user.refreshTokenHash !== jti) throw Unauthorized('Refresh token revoked');

  const accessToken = signAccessToken(tokenPayload(user));
  return { accessToken };
}

export async function logout(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

// Revokes ALL live sessions for a user, not just the calling one. Bumps
// `sessionsRevokedAt` so any in-flight access tokens (which are otherwise
// valid up to the JWT TTL) are rejected by the auth middleware, and clears
// the refresh token hash so the refresh flow can't mint new ones.
export async function logoutAll(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    refreshTokenHash: null,
    sessionsRevokedAt: new Date(),
  });
}

interface CreateInviteArgs {
  email?: string;
  phone?: string;
  role: Role;
  buildingId: Types.ObjectId | string;
  unitId?: Types.ObjectId | string | null;
  linkedOwnerId?: Types.ObjectId | string | null;
  invitedBy: Types.ObjectId | string;
  /** When true, the User shell created for this invite is flagged as the
   *  building admin (owner with elevated overlay). Only meaningful when
   *  role === 'owner'; ignored otherwise. */
  isBuildingAdmin?: boolean;
}

export interface CreateInviteResult {
  /** Always true — the user is created and ready to log in immediately. */
  sent: true;
  channel: 'email' | 'sms';
  /** The default password the admin should share with the new user. */
  defaultPassword: string;
}

/**
 * The notification stack (email/SMS) isn't wired up, so we skip the
 * pending-invite flow entirely: the new user is created as `active` with
 * a known default password (`password`). The admin shares those creds out
 * of band. The user can change the password later from their profile.
 *
 * The name `createInvite` is kept for backwards compat with the existing
 * mobile/web POST /invites callers, even though no invite token is
 * actually created.
 */
export async function createInvite(args: CreateInviteArgs): Promise<CreateInviteResult> {
  if (!args.email && !args.phone) throw BadRequest('email or phone is required');

  const email = args.email?.toLowerCase().trim() || null;
  const phone = args.phone ? normalizePhone(args.phone) : null;

  const lookup: Record<string, string> = {};
  if (email) lookup.email = email;
  if (phone) lookup.phone = phone;
  const existing = lookup.email
    ? await User.findOne({ email: lookup.email })
    : phone
      ? await User.findOne({ phone })
      : null;
  if (existing) throw Conflict('A user with this contact already exists');

  // unitId is required EXCEPT when the system admin appoints the
  // building admin before any units exist (`isBuildingAdmin: true`).
  const appointingBuildingAdmin = args.role === 'owner' && !!args.isBuildingAdmin;
  if (!appointingBuildingAdmin && !args.unitId) {
    throw BadRequest('unitId is required for non-admin invites');
  }
  if (args.unitId) {
    const unit = await Unit.findById(args.unitId);
    if (!unit) throw NotFound('Unit not found');
  }

  const defaultPassword = 'password';
  const passwordHash = await hashPassword(defaultPassword);

  // Synthetic email for phone-only users — the User schema requires a
  // unique non-null email and a single placeholder collides across users.
  const synthEmail = email ?? `phone+${phone?.replace(/[^0-9]/g, '')}@invite.local`;
  await User.create({
    email: synthEmail,
    phone: phone ?? '',
    passwordHash,
    role: args.role,
    buildingId: args.buildingId,
    unitId: args.unitId ?? null,
    linkedOwnerId: args.linkedOwnerId ?? null,
    status: 'active',
    isBuildingAdmin: args.role === 'owner' ? !!args.isBuildingAdmin : false,
  });

  return { sent: true, channel: email ? 'email' : 'sms', defaultPassword };
}

export async function acceptInvite(rawToken: string, password: string, names: { firstName?: string; lastName?: string; phone?: string }) {
  const tokenHash = sha256(rawToken);
  const invite = await InviteToken.findOne({ tokenHash });
  if (!invite) throw NotFound('Invite not found');
  if (invite.usedAt) throw BadRequest('Invite already used');
  if (invite.expiresAt.getTime() < Date.now()) throw BadRequest('Invite expired');

  const user = await User.findOne({ email: invite.email });
  if (!user) throw NotFound('User shell missing for invite');

  user.passwordHash = await hashPassword(password);
  user.firstName = names.firstName ?? user.firstName;
  user.lastName = names.lastName ?? user.lastName;
  user.phone = names.phone ?? user.phone;
  user.status = 'active';
  await user.save();

  // If owner accepted, attach to unit
  if (invite.unitId) {
    await Unit.findByIdAndUpdate(invite.unitId, {
      ...(invite.role === 'owner' ? { ownerId: user._id } : {}),
      $addToSet: { occupants: user._id },
    });
  }

  invite.usedAt = new Date();
  await invite.save();

  // Issue session immediately on acceptance
  const accessToken = signAccessToken(tokenPayload(user));
  const refreshRaw = randomToken(48);
  user.refreshTokenHash = sha256(refreshRaw);
  await user.save();
  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti: user.refreshTokenHash });

  return { user, accessToken, refreshToken };
}
