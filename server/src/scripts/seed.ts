import { connectDb, disconnectDb } from '../config/db.js';
import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/hash.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// Credentials come from the environment (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD),
// validated in env.ts (email format + min-8 password). Never hardcode them here.
const ADMIN_EMAIL = env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD;

async function main(): Promise<void> {
  // Guardrails: refuse the placeholder password, and refuse to run
  // destructively against a production database.
  if (ADMIN_PASSWORD === 'ChangeMe!123') {
    logger.error(
      'Refusing to seed with the default SEED_ADMIN_PASSWORD. Set a strong SEED_ADMIN_PASSWORD in the environment.',
    );
    process.exit(1);
  }
  const allowProdWipe = process.env.SEED_ALLOW_PRODUCTION === 'true';
  if (env.NODE_ENV === 'production' && !allowProdWipe) {
    logger.error(
      'Refusing to run the destructive seed in production. Set SEED_ALLOW_PRODUCTION=true to override.',
    );
    process.exit(1);
  }

  await connectDb();

  // Single-user seed: wipe everything and create one system admin. The
  // admin is building-agnostic, so no Building or Unit rows are needed.
  await Promise.all([
    User.deleteMany({}),
    Unit.deleteMany({}),
    Building.deleteMany({}),
  ]);
  logger.info('Wiped users, units, buildings');

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await User.create({
    email: ADMIN_EMAIL.toLowerCase(),
    phone: env.SEED_ADMIN_PHONE ?? '',
    passwordHash,
    firstName: env.SEED_ADMIN_FIRST,
    lastName: env.SEED_ADMIN_LAST,
    systemRole: 'admin',
    memberships: [],
    status: 'active',
  });

  logger.info({ email: ADMIN_EMAIL }, 'Seed complete — admin user created');
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
