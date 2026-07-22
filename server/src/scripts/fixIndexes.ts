import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { logger } from '../config/logger.js';

/**
 * Reconcile the `users` collection indexes with the current schema. Drops
 * legacy indexes from the pre-memberships model (e.g. a non-partial unique
 * `email_1`, `buildingId_1`, `isBuildingAdmin_1`) and creates the ones the
 * schema now declares (unique `phone`, partial-unique `email`, membership
 * lookups). Safe to run repeatedly.
 */
async function main(): Promise<void> {
  await connectDb();
  const before = await User.collection.indexes();
  logger.info({ indexes: before.map((i) => i.name) }, 'users indexes before');
  await User.syncIndexes();
  const after = await User.collection.indexes();
  logger.info({ indexes: after.map((i) => i.name) }, 'users indexes after');
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'fixIndexes failed');
  process.exit(1);
});
