import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/hash.js';
import { logger } from '../config/logger.js';

const DEMO_PASSWORD = env.SEED_ADMIN_PASSWORD;

interface DemoUser {
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'owner' | 'renter' | 'dependent';
  unitNumber?: string;
  linkOwnerEmail?: string;
  isBuildingAdmin?: boolean;
}

// System admin operates above any single building — building-agnostic.
// Entry point in the app is the Buildings CRUD page; they never have a unit
// or per-building dashboard.
const SYSTEM_ADMIN: DemoUser = {
  email: env.SEED_ADMIN_EMAIL,
  phone: '+972500000001',
  firstName: env.SEED_ADMIN_FIRST,
  lastName: env.SEED_ADMIN_LAST,
  role: 'admin',
};

// Demo residents for the seeded building. The owner of 8B is also the
// building admin — they see the app as an owner and toggle to "admin view"
// via a header chip.
const DEMO_RESIDENTS: DemoUser[] = [
  {
    email: 'owner@example.com',
    phone: '+972500000002',
    firstName: 'Pat',
    lastName: 'Kim',
    role: 'owner',
    unitNumber: '8B',
    isBuildingAdmin: true,
  },
  {
    email: 'renter@example.com',
    phone: '+972500000003',
    firstName: 'Jordan',
    lastName: 'Lee',
    role: 'renter',
    unitNumber: '12A',
  },
  {
    email: 'dependent@example.com',
    phone: '+972500000004',
    firstName: 'Taylor',
    lastName: 'Brown',
    role: 'dependent',
    unitNumber: '8B',
    linkOwnerEmail: 'owner@example.com',
  },
];

const demoUnits: { number: string; floor: number; bedrooms: number; monthlyDuesAmount: number }[] = [
  { number: '8B', floor: 8, bedrooms: 3, monthlyDuesAmount: 1450 },
  { number: '12A', floor: 12, bedrooms: 2, monthlyDuesAmount: 1200 },
];

async function main(): Promise<void> {
  await connectDb();

  // Wipe + reseed: clean slate so the role-model refactor doesn't leave any
  // stale `role==='admin'` users hanging around with no building context.
  // This is destructive — only intended for development seeding.
  await Promise.all([
    User.deleteMany({}),
    Unit.deleteMany({}),
    Building.deleteMany({}),
  ]);
  logger.info('Wiped users, units, buildings');

  const building = await Building.create({
    name: env.SEED_BUILDING_NAME,
    currency: 'ILS',
    settings: { monthlyDuesDay: 1, timezone: 'UTC' },
  });
  logger.info({ id: building._id.toString() }, 'Created building');

  const unitsByNumber: Record<string, Awaited<ReturnType<typeof Unit.findOne>>> = {};
  for (const u of demoUnits) {
    const unit = await Unit.create({ buildingId: building._id, ...u });
    unitsByNumber[u.number] = unit;
    logger.info({ unit: u.number }, 'Created unit');
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // 1. System admin — building-agnostic. The schema's buildingId validator
  // accepts null specifically for the admin role.
  await User.create({
    email: SYSTEM_ADMIN.email.toLowerCase(),
    phone: SYSTEM_ADMIN.phone ?? '',
    passwordHash,
    firstName: SYSTEM_ADMIN.firstName,
    lastName: SYSTEM_ADMIN.lastName,
    role: 'admin',
    buildingId: null,
    status: 'active',
  });
  logger.info({ email: SYSTEM_ADMIN.email }, 'Created system admin (no home building)');

  // 2. Demo residents.
  const usersByEmail: Record<string, Awaited<ReturnType<typeof User.findOne>>> = {};
  for (const u of DEMO_RESIDENTS) {
    const unit = u.unitNumber ? unitsByNumber[u.unitNumber] : null;
    const user = await User.create({
      email: u.email.toLowerCase(),
      phone: u.phone ?? '',
      passwordHash,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      buildingId: building._id,
      unitId: unit?._id ?? null,
      isBuildingAdmin: !!u.isBuildingAdmin,
      status: 'active',
      // Demo policy: give the owner-as-building-admin a generous dependent
      // quota so they can invite family members without re-tuning settings.
      ...(u.role === 'owner'
        ? { settings: { maxDependents: 4 } }
        : {}),
    });
    usersByEmail[u.email.toLowerCase()] = user;
    logger.info(
      { email: u.email, role: u.role, isBuildingAdmin: !!u.isBuildingAdmin },
      'Created user'
    );
  }

  // 3. Cross-references: linked-owner for dependents, unit ownership for
  // owners. Done in a second pass so all User._ids are known.
  for (const u of DEMO_RESIDENTS) {
    const me = usersByEmail[u.email.toLowerCase()];
    if (!me) continue;
    if (u.role === 'dependent' && u.linkOwnerEmail) {
      const owner = usersByEmail[u.linkOwnerEmail.toLowerCase()];
      if (owner) {
        await User.updateOne({ _id: me._id }, { linkedOwnerId: owner._id });
        logger.info({ email: u.email }, 'Linked dependent to owner');
      }
    }
    if (u.role === 'owner' && u.unitNumber) {
      const unit = unitsByNumber[u.unitNumber];
      if (unit) {
        await Unit.updateOne({ _id: unit._id }, { ownerId: me._id });
        logger.info({ unit: u.unitNumber, owner: u.email }, 'Assigned unit owner');
      }
    }
  }

  logger.info({ password: DEMO_PASSWORD }, 'Seed complete — same password for all demo accounts');
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
