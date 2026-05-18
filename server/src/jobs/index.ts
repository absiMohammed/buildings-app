import cron from 'node-cron';
import { Building } from '../models/Building.js';
import { Poll } from '../models/Poll.js';
import { generateMonthlyDues, markOverduePayments } from '../services/payments.service.js';
import { SubscriptionPayment } from '../models/SubscriptionPayment.js';
import { computeBuildingSubscription } from '../services/subscription.service.js';
import { logger } from '../config/logger.js';

const DEFAULT_TZ = 'Asia/Jerusalem';
const MONTHLY_DUES_HOUR = 2; // 02:00 local time on the 1st of each month
const OVERDUE_CHECK_HOUR = 3; // 03:00 local time daily
const SUBSCRIPTION_BILL_HOUR = 4; // 04:00 local time on the 1st (after dues)
const SUBSCRIPTION_DUE_DAY = 15; // grace: invoice due on the 15th of the same month

interface ZonedParts {
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, tz: string): ZonedParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const lookup = (type: string) => parts.find((p) => p.type === type)?.value;
    const day = parseInt(lookup('day') ?? '', 10);
    let hour = parseInt(lookup('hour') ?? '', 10);
    const minute = parseInt(lookup('minute') ?? '', 10);
    if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour === 24) hour = 0; // some locales render midnight as 24
    return { day, hour, minute };
  } catch {
    return null;
  }
}

export function startCronJobs(): void {
  // Per-building scheduler. Cron fires every 15 minutes (UTC). For each
  // building we re-derive the local time using its configured timezone and
  // run the dues / overdue jobs when the local clock crosses the configured
  // hour. The 15-minute window matches the cron cadence, so each job is
  // triggered exactly once per local-day boundary per building.
  cron.schedule('*/15 * * * *', async () => {
    const now = new Date();
    const buildings = await Building.find();
    for (const b of buildings) {
      const tz = b.settings?.timezone ?? DEFAULT_TZ;
      const parts = zonedParts(now, tz);
      if (!parts) {
        logger.warn({ buildingId: b._id, tz }, 'invalid building timezone — skipping cron tick');
        continue;
      }
      if (parts.day === 1 && parts.hour === MONTHLY_DUES_HOUR && parts.minute < 15) {
        try {
          const r = await generateMonthlyDues(b._id.toString());
          logger.info({ buildingId: b._id, tz, ...r }, 'generated monthly dues');
        } catch (err) {
          logger.error({ err, buildingId: b._id, tz }, 'monthly dues failed');
        }
      }
      if (parts.hour === OVERDUE_CHECK_HOUR && parts.minute < 15) {
        try {
          const r = await markOverduePayments(b._id.toString());
          logger.info({ buildingId: b._id, tz, ...r }, 'marked overdue payments');
        } catch (err) {
          logger.error({ err, buildingId: b._id, tz }, 'overdue check failed');
        }
      }
      // Subscription installment: on the 1st of each local month at 04:00,
      // generate a pending row for this building based on its computed
      // monthly cost. Skipped for inactive buildings; idempotent against
      // existing rows for the same (buildingId, periodLabel).
      if (
        (b.status ?? 'active') === 'active' &&
        parts.day === 1 &&
        parts.hour === SUBSCRIPTION_BILL_HOUR &&
        parts.minute < 15
      ) {
        try {
          await generateMonthlySubscriptionInstallment(b, now, tz);
        } catch (err) {
          logger.error({ err, buildingId: b._id, tz }, 'subscription installment failed');
        }
      }
    }
  });

  // Poll status transitions use absolute UTC timestamps (opensAt / closesAt)
  // and don't depend on building timezone.
  cron.schedule('*/15 * * * *', async () => {
    const now = new Date();
    const closed = await Poll.updateMany(
      { status: 'open', closesAt: { $lt: now } },
      { status: 'closed' }
    );
    if (closed.modifiedCount > 0) logger.info({ closed: closed.modifiedCount }, 'closed polls');

    const opened = await Poll.updateMany(
      { status: 'draft', opensAt: { $lte: now }, closesAt: { $gt: now } },
      { status: 'open' }
    );
    if (opened.modifiedCount > 0) logger.info({ opened: opened.modifiedCount }, 'opened polls');
  });

  logger.info('Cron jobs scheduled');
}

interface BuildingForBilling {
  _id: { toString(): string };
  currency?: string;
  enabledModules?: string[] | null;
}

/**
 * Emit one pending `SubscriptionPayment` row for the building's current
 * month, sized at its computed monthly subscription. Idempotent: a unique
 * `(buildingId, periodLabel)` lookup runs first so a duplicate cron tick
 * (server restart, clock drift) doesn't double-bill. Skipped when the
 * computed monthly is 0 — no pricing means no invoice.
 */
async function generateMonthlySubscriptionInstallment(
  b: BuildingForBilling,
  now: Date,
  tz: string
): Promise<void> {
  // Period label uses the local-time year/month so a building in a
  // non-UTC timezone gets billed for the right month around midnight UTC.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  if (!year || !month) return;
  const periodLabel = `${year}-${month}`;

  const existing = await SubscriptionPayment.findOne({
    buildingId: b._id,
    periodLabel,
    periodKind: 'monthly',
  })
    .select('_id')
    .lean();
  if (existing) return; // already invoiced for this period

  const summary = await computeBuildingSubscription({
    enabledModules: b.enabledModules ?? null,
    _id: b._id.toString(),
  });
  if (summary.monthly <= 0) return; // nothing to bill

  // Due on the 15th of the same UTC month. Admins can override per-row.
  const dueDate = new Date(Date.UTC(Number(year), Number(month) - 1, SUBSCRIPTION_DUE_DAY));

  await SubscriptionPayment.create({
    buildingId: b._id,
    amount: summary.monthly,
    currency: b.currency ?? summary.currency,
    periodKind: 'monthly',
    periodLabel,
    dueDate,
    status: 'pending',
    notes: 'Auto-generated by monthly subscription cron',
  });
  logger.info({ buildingId: b._id, periodLabel, amount: summary.monthly }, 'subscription installment created');
}
