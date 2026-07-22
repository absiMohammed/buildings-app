import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/hash.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// Idempotent, NON-destructive admin setup. Creates the system admin if it
// doesn't exist, otherwise updates its phone/email/password in place. Unlike
// `seed`, this NEVER deletes any existing data — safe to run against a live DB.
//
// Credentials come from the environment:
//   SEED_ADMIN_PHONE     e.g. +970598136876   (login identifier)
//   SEED_ADMIN_PASSWORD  strong password
//   SEED_ADMIN_EMAIL     unique email (the User schema requires one)
function normalizePhone(v: string): string {
  const trimmed = v.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

async function main(): Promise<void> {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const phone = env.SEED_ADMIN_PHONE ? normalizePhone(env.SEED_ADMIN_PHONE) : '';
  const password = env.SEED_ADMIN_PASSWORD;

  if (password === 'ChangeMe!123') {
    logger.error('Set a real SEED_ADMIN_PASSWORD before running ensure-admin.');
    process.exit(1);
  }

  await connectDb();
  const passwordHash = await hashPassword(password);

  // Match an existing admin by phone (preferred) or email so re-runs update
  // in place instead of creating duplicates.
  const or: Array<Record<string, string>> = [{ email }];
  if (phone) or.unshift({ phone });
  const existing = await User.findOne({ $or: or });

  if (existing) {
    existing.email = email;
    if (phone) existing.phone = phone;
    existing.passwordHash = passwordHash;
    existing.firstName = env.SEED_ADMIN_FIRST;
    existing.lastName = env.SEED_ADMIN_LAST;
    existing.systemRole = 'admin';
    existing.memberships.splice(0, existing.memberships.length);
    existing.status = 'active';
    existing.mustChangePassword = false;
    existing.refreshTokenHash = null;
    await existing.save();
    logger.info({ email, phone }, 'Admin updated in place');
  } else {
    await User.create({
      email,
      phone,
      passwordHash,
      firstName: env.SEED_ADMIN_FIRST,
      lastName: env.SEED_ADMIN_LAST,
      systemRole: 'admin',
      memberships: [],
      status: 'active',
      mustChangePassword: false,
    });
    logger.info({ email, phone }, 'Admin created');
  }

  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'ensure-admin failed');
  process.exit(1);
});
