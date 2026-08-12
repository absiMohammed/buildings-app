import { Types } from 'mongoose';
import { Building } from '../models/Building.js';
import { Unit, type UnitDoc } from '../models/Unit.js';
import { Payment, type PaymentDoc } from '../models/Payment.js';
import { UserCredit } from '../models/UserCredit.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { sendWhatsApp } from './whatsapp.service.js';
import { logger } from '../config/logger.js';
import { BadRequest, Forbidden, Conflict, NotFound } from '../utils/errors.js';

// Amounts are JS floats end-to-end; without rounding at every mutation,
// paidAmount drifts (99.99999999999999) and a charge never flips to paid.
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// Covered when receipts reach the charge amount, minus a half-cent epsilon
// for float drift that survives round2 (e.g. three 33.33 receipts vs 100).
function covers(paidAmount: number, amount: number): boolean {
  return paidAmount >= amount - 0.005;
}

/**
 * Split `amount` across charges oldest-first, capping each slice at that
 * charge's remaining balance. Pure — shared by the receipts endpoint and the
 * client-side preview must mirror it exactly (same ordering, same caps).
 * Returns per-charge applied slices (aligned with the input order) and the
 * surplus left after every charge is covered.
 */
export function planWaterfall(
  remainings: number[],
  amount: number
): { applied: number[]; surplus: number } {
  let left = round2(amount);
  const applied = remainings.map((remaining) => {
    const slice = round2(Math.min(Math.max(remaining, 0), left));
    left = round2(left - slice);
    return slice;
  });
  return { applied, surplus: left };
}

/**
 * Who the money is presumed to come from, per charge type: rent → the active
 * renter (they pay the owner), everything else → the unit owner (the party
 * financially responsible for the unit). Used both for receipt attribution
 * and for picking whose credit balance covers a freshly generated charge.
 */
export async function derivePayer(
  payment: Pick<PaymentDoc, 'type' | 'buildingId'>,
  unit: Pick<UnitDoc, '_id' | 'ownerId'>
): Promise<Types.ObjectId | null> {
  if (payment.type === 'rent') {
    const renter = await User.findOne({
      memberships: {
        $elemMatch: { buildingId: payment.buildingId, unitIds: unit._id, role: 'renter' },
      },
      status: { $in: ['active', 'invited'] },
    }).select('_id');
    if (renter) return renter._id;
  }
  return unit.ownerId ?? null;
}

export interface RecordReceiptsInput {
  buildingId: string;
  paymentIds: string[];
  amount: number;
  method: 'cash' | 'transfer' | 'stripe' | 'other';
  externalRef?: string;
  note?: string;
  /** Explicit payer override; otherwise derived per charge type. */
  payerId?: string;
  /** The authed caller — used for permissions and receipt attribution. */
  me: { sub: string; isBuildingAdmin: boolean };
}

/**
 * Record money received against one unit's charges. The amount waterfalls
 * oldest-dueDate-first; a shortfall leaves the tail charges partially covered
 * (status untouched, so they still go overdue), and a surplus credits the
 * payer's per-building balance.
 *
 * Not transactional (standalone Mongo): the payment saves and the credit $inc
 * are separate writes, ordered charge-first so a crash can only lose the
 * credit grant (recoverable from receipts), never invent phantom credit.
 */
export async function recordReceipts(input: RecordReceiptsInput) {
  const { buildingId, me } = input;
  const ids = [...new Set(input.paymentIds)];
  const payments = await Payment.find({ _id: { $in: ids }, buildingId });
  if (payments.length !== ids.length) throw NotFound('Payment not found');

  const first = payments[0];
  if (!first) throw NotFound('Payment not found');
  const unitIds = new Set(payments.map((p) => p.unitId.toString()));
  if (unitIds.size > 1) throw BadRequest('All payments must belong to the same unit.');
  const closed = payments.find((p) => p.status === 'paid' || p.status === 'waived');
  if (closed) throw BadRequest(`Payment ${closed._id} is already settled.`);

  const unit = await Unit.findOne({ _id: first.unitId, buildingId });
  if (!unit) throw NotFound('Unit not found');

  // Mirror of the PATCH /:id rule: building admins settle any charge; a plain
  // owner only rent charges on units they own.
  if (!me.isBuildingAdmin) {
    const ownsUnit = unit.ownerId?.toString() === me.sub;
    if (!ownsUnit || payments.some((p) => p.type !== 'rent')) {
      throw Forbidden('You can only manage rent charges on units you own.');
    }
  }

  const ordered = [...payments].sort((a, b) => +a.dueDate - +b.dueDate);
  const { applied, surplus } = planWaterfall(
    ordered.map((p) => round2(p.amount - p.paidAmount)),
    input.amount
  );

  const now = new Date();
  for (const [i, p] of ordered.entries()) {
    const slice = applied[i] ?? 0;
    if (slice <= 0) continue;
    const payerId = input.payerId
      ? new Types.ObjectId(input.payerId)
      : await derivePayer(p, unit);
    p.receipts.push({
      amount: slice,
      at: now,
      method: input.method,
      externalRef: input.externalRef ?? '',
      note: input.note ?? '',
      recordedBy: new Types.ObjectId(me.sub),
      payerId,
    });
    p.paidAmount = round2(p.paidAmount + slice);
    if (covers(p.paidAmount, p.amount)) {
      p.status = 'paid';
      p.paidAt = now;
      p.paidBy = payerId;
      p.paymentMethod = input.method;
      if (input.externalRef) p.externalRef = input.externalRef;
    }
    try {
      await p.save();
    } catch (err) {
      // Optimistic-concurrency loser: another receipt landed first. Surface
      // as a conflict rather than retrying blind — the client re-fetches and
      // the admin re-enters against fresh remaining balances.
      if ((err as Error).name === 'VersionError') {
        throw Conflict('Payment was updated by someone else — refresh and retry.');
      }
      throw err;
    }
  }

  let surplusResult: { amount: number; userId: string } | null = null;
  if (surplus > 0) {
    // Mixed rent + non-rent selections fall back to the unit owner —
    // derivePayer only looks up the renter for rent charges.
    const allRent = ordered.every((p) => p.type === 'rent');
    const payerId = input.payerId
      ? new Types.ObjectId(input.payerId)
      : await derivePayer({ type: allRent ? 'rent' : 'one_off', buildingId: first.buildingId }, unit);
    if (!payerId) {
      throw BadRequest('No payer to credit the surplus to — set a unit owner or pass payerId.');
    }
    await UserCredit.findOneAndUpdate(
      { userId: payerId, buildingId },
      { $inc: { balance: surplus }, $setOnInsert: { currency: first.currency } },
      { upsert: true }
    );
    surplusResult = { amount: surplus, userId: payerId.toString() };
  }

  return { payments: ordered, surplus: surplusResult };
}

/**
 * Cover a freshly generated charge from the presumed payer's credit balance.
 * Deduction is a guarded atomic $inc (balance >= take) so concurrent applies
 * can't overdraw; the payment write follows, so a crash in between leaves
 * credit deducted but recoverable from the missing receipt — never doubled.
 */
export async function applyCreditToCharge(payment: PaymentDoc, unit: UnitDoc): Promise<void> {
  const payerId = await derivePayer(payment, unit);
  if (!payerId) return;

  const remaining = round2(payment.amount - payment.paidAmount);
  if (remaining <= 0) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    const credit = await UserCredit.findOne({ userId: payerId, buildingId: payment.buildingId });
    const take = round2(Math.min(credit?.balance ?? 0, remaining));
    if (take <= 0) return;
    const deducted = await UserCredit.findOneAndUpdate(
      { userId: payerId, buildingId: payment.buildingId, balance: { $gte: take } },
      { $inc: { balance: -take } }
    );
    if (!deducted) continue; // concurrent spend — re-read once, then give up

    payment.receipts.push({
      amount: take,
      at: new Date(),
      method: 'credit',
      externalRef: '',
      note: '',
      recordedBy: null,
      payerId,
    });
    payment.paidAmount = round2(payment.paidAmount + take);
    if (covers(payment.paidAmount, payment.amount)) {
      payment.status = 'paid';
      payment.paidAt = new Date();
      payment.paidBy = payerId;
      payment.paymentMethod = 'credit';
    }
    await payment.save();
    return;
  }
}

export async function generateMonthlyDues(buildingId: string) {
  const building = await Building.findById(buildingId);
  if (!building) return { generated: 0 };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const defaultDay = building.settings?.monthlyDuesDay ?? 1;
  const defaultAmount = building.settings?.defaultMonthlyDues ?? 0;

  const units = await Unit.find({ buildingId });

  let generated = 0;
  for (const unit of units) {
    // Per-unit overrides take precedence; falls back to building defaults.
    const day = unit.monthlyDuesDayOverride ?? defaultDay;
    const dueDate = new Date(year, month, day);
    const startOfMonth = new Date(year, month, 1);
    const startOfNextMonth = new Date(year, month + 1, 1);

    // Owner-set rent: billed monthly alongside dues, but only while a renter
    // actually occupies the unit. The owner settles these charges directly.
    const rentAmount = unit.monthlyRentAmount ?? 0;
    if (rentAmount > 0) {
      const hasRenter = await User.exists({
        memberships: { $elemMatch: { unitIds: unit._id, role: 'renter' } },
        status: { $in: ['active', 'invited'] },
      });
      const existingRent = hasRenter
        ? await Payment.findOne({
            unitId: unit._id,
            type: 'rent',
            dueDate: { $gte: startOfMonth, $lt: startOfNextMonth },
          })
        : null;
      if (hasRenter && !existingRent) {
        const rentPayment = await Payment.create({
          buildingId,
          unitId: unit._id,
          type: 'rent',
          amount: rentAmount,
          currency: building.currency,
          dueDate,
          status: 'pending',
        });
        await applyCreditToCharge(rentPayment, unit);
        generated++;
      }
    }

    const amount = unit.monthlyDuesAmount ?? defaultAmount;
    if (!amount || amount <= 0) continue; // nothing billable
    const existing = await Payment.findOne({
      unitId: unit._id,
      type: 'monthly_dues',
      dueDate: { $gte: startOfMonth, $lt: startOfNextMonth },
    });
    if (existing) continue;
    const duesPayment = await Payment.create({
      buildingId,
      unitId: unit._id,
      type: 'monthly_dues',
      amount,
      currency: building.currency,
      dueDate,
      status: 'pending',
    });
    await applyCreditToCharge(duesPayment, unit);
    generated++;

    // Notify occupants — with the post-credit remaining; skip entirely when
    // the payer's credit balance already covered the whole charge.
    if (duesPayment.status !== 'paid' && unit.occupants && unit.occupants.length > 0) {
      const remaining = round2(duesPayment.amount - duesPayment.paidAmount);
      const occupants = await User.find({ _id: { $in: unit.occupants }, status: 'active' });
      const title = `Monthly dues for ${month + 1}/${year}`;
      const body = `Amount due: ${building.currency} ${remaining.toFixed(2)} by ${dueDate.toDateString()}`;
      for (const u of occupants) {
        await Notification.create({
          userId: u._id,
          buildingId,
          type: 'payment_due',
          title,
          body,
          link: `/payments`,
        });
        // Mirror the reminder over WhatsApp (no-ops if WhatsApp isn't configured).
        await sendWhatsApp(u.phone, `${building.name}: ${title}. ${body}`);
      }
    }
  }
  return { generated };
}

/**
 * Daily dunning pass. Flips pending charges past the grace period to
 * overdue, then per newly-overdue charge: notifies the derived payer
 * (in-app + WhatsApp) with the REMAINING amount and, when the building
 * configured a late fee, generates a one-off fee charge — exactly once per
 * source charge (`lateFeeChargeId` is the idempotency key). Charges that
 * stay overdue get re-reminded every `reminderEveryDays`.
 *
 * NOTE (production WhatsApp): outside Meta's 24h customer-service window
 * only approved templates deliver — these free-form reminders work in
 * dev/mock mode; template wiring is a separate task.
 */
export async function markOverduePayments(buildingId: string) {
  const building = await Building.findById(buildingId);
  if (!building) return { marked: 0, fees: 0, reminders: 0 };
  const lateFee = building.settings?.lateFee;
  const grace = lateFee?.gracePeriodDays ?? 0;
  const reminderEveryDays = lateFee?.reminderEveryDays ?? 7;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - grace);

  // 1. Find the rows about to flip so we can act on them individually
  //    after the bulk status update.
  const newlyOverdue = await Payment.find({
    buildingId,
    status: 'pending',
    dueDate: { $lt: cutoff },
  });
  if (newlyOverdue.length > 0) {
    await Payment.updateMany(
      { _id: { $in: newlyOverdue.map((p) => p._id) } },
      { status: 'overdue' }
    );
  }

  // 2. Long-overdue rows whose last reminder is stale get another nudge.
  const reminderCutoff = new Date(now.getTime() - reminderEveryDays * 86_400_000);
  const staleOverdue = await Payment.find({
    buildingId,
    status: 'overdue',
    _id: { $nin: newlyOverdue.map((p) => p._id) },
    $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: reminderCutoff } }],
  });

  let fees = 0;
  let reminders = 0;
  const feeConfigured = (lateFee?.flatAmount ?? 0) > 0 || (lateFee?.percent ?? 0) > 0;

  async function remind(payment: PaymentDoc, isFirst: boolean) {
    const unit = await Unit.findById(payment.unitId);
    if (!unit) return;
    const payerId = await derivePayer(payment, unit);
    const remaining = round2(payment.amount - payment.paidAmount);
    if (payerId && remaining > 0) {
      const payer = await User.findById(payerId).select('phone status');
      const title = `Payment overdue — unit ${unit.number}`;
      const body = `Remaining: ${payment.currency} ${remaining.toFixed(2)} (due ${payment.dueDate.toDateString()})`;
      await Notification.create({
        userId: payerId,
        buildingId,
        type: 'payment_overdue',
        title,
        body,
        link: '/payments',
      });
      if (payer?.status === 'active') {
        await sendWhatsApp(payer.phone, `${building!.name}: ${title}. ${body}`);
      }
      reminders++;
    }

    // Late fee: only on first flip, only when configured, exactly once.
    if (isFirst && feeConfigured && !payment.lateFeeChargeId && remaining > 0) {
      const feeAmount = round2(
        (lateFee?.flatAmount ?? 0) + (remaining * (lateFee?.percent ?? 0)) / 100
      );
      if (feeAmount > 0) {
        const fee = await Payment.create({
          buildingId,
          unitId: payment.unitId,
          type: 'one_off',
          amount: feeAmount,
          currency: payment.currency,
          dueDate: now,
          status: 'pending',
          notes: `Late fee for ${payment.type} due ${payment.dueDate.toISOString().slice(0, 10)}`,
        });
        payment.lateFeeChargeId = fee._id;
        fees++;
      }
    }

    payment.lastReminderAt = now;
    await payment.save();
  }

  for (const p of newlyOverdue) {
    try {
      await remind(p, true);
    } catch (err) {
      logger.error({ err, paymentId: p._id }, 'dunning failed for newly-overdue charge');
    }
  }
  for (const p of staleOverdue) {
    try {
      await remind(p, false);
    } catch (err) {
      logger.error({ err, paymentId: p._id }, 'dunning reminder failed');
    }
  }

  return { marked: newlyOverdue.length, fees, reminders };
}
