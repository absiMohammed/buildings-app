import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { logger } from '../config/logger.js';

/**
 * One-off migration helper: remove every non-super-admin user. Used when the
 * data model changed shape (single-building → memberships) and legacy resident
 * docs can't be auto-migrated. Run AFTER ensure-admin so the super-admin (whose
 * systemRole is 'admin') is preserved.
 */
async function main(): Promise<void> {
  await connectDb();
  const result = await User.deleteMany({ systemRole: { $ne: 'admin' } });
  logger.info({ deleted: result.deletedCount }, 'Legacy residents removed');
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'wipeResidents failed');
  process.exit(1);
});
