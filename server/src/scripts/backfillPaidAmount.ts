import { connectDb, disconnectDb } from '../config/db.js';
import { Payment } from '../models/Payment.js';
import { logger } from '../config/logger.js';

/**
 * One-time backfill for the partial-payments fields. Pre-feature rows have
 * no paidAmount/receipts: paid rows become fully covered (paidAmount =
 * amount), everything else starts at 0. Receipts stay empty for legacy rows —
 * their single settle is already recorded in paidAt/paidBy/paymentMethod, and
 * `status === 'paid' && receipts.length === 0` is the recognizable
 * pre-feature signature. Safe to run repeatedly.
 */
async function main(): Promise<void> {
  await connectDb();
  const paid = await Payment.updateMany({ status: 'paid', paidAmount: { $in: [null, 0] } }, [
    { $set: { paidAmount: '$amount', receipts: { $ifNull: ['$receipts', []] } } },
  ]);
  const rest = await Payment.updateMany(
    { status: { $ne: 'paid' }, paidAmount: { $exists: false } },
    { $set: { paidAmount: 0, receipts: [] } }
  );
  logger.info(
    { paidRows: paid.modifiedCount, otherRows: rest.modifiedCount },
    'paidAmount backfill complete'
  );
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'backfillPaidAmount failed');
  process.exit(1);
});
