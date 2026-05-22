import { connectDb, disconnectDb } from '../config/db.js';
import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/hash.js';
import { logger } from '../config/logger.js';

const ADMIN_EMAIL = 'admin@absitech.com';
const ADMIN_PASSWORD = 'admin';

async function main(): Promise<void> {
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
    phone: '',
    passwordHash,
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    buildingId: null,
    status: 'active',
  });

  logger.info({ email: ADMIN_EMAIL }, 'Seed complete — admin user created');
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
