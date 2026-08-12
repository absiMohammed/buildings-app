import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// 'rent' charges are owner-managed: created/settled by the unit's owner,
// billed to the renter — unlike the rest, which are building-admin managed.
const TYPES = ['monthly_dues', 'expense_split', 'one_off', 'rent'] as const;
const STATUSES = ['pending', 'paid', 'overdue', 'waived'] as const;
// 'credit' is system-only: written when a user's credit balance auto-covers
// (part of) a new charge. The receipts API never accepts it from callers.
const METHODS = ['cash', 'transfer', 'stripe', 'other', 'credit'] as const;

// One installment received against this charge. Money can arrive in several
// receipts (partial payments); the charge flips to 'paid' only when they
// cover `amount`. Partial coverage is derived (paidAmount > 0, status still
// pending/overdue) — deliberately NOT a status value, so overdue marking and
// status filters keep working unchanged.
const ReceiptSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    at: { type: Date, default: Date.now },
    method: { type: String, enum: METHODS, default: 'cash' },
    externalRef: { type: String, default: '' },
    note: { type: String, default: '' },
    // null = system (credit auto-apply).
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Whose money this was; surplus beyond the charge credits this user.
    payerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true }
);

const PaymentSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    type: { type: String, enum: TYPES, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    // Denormalized sum of receipts[].amount, maintained by the two server
    // write paths (receipts endpoint, credit auto-apply) so list views and
    // client sums never unroll the receipts array.
    paidAmount: { type: Number, default: 0, min: 0 },
    receipts: { type: [ReceiptSchema], default: [] },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paymentMethod: { type: String, enum: METHODS, default: null },
    externalRef: { type: String, default: '' },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },
    // Dunning bookkeeping. lateFeeChargeId doubles as the idempotency key
    // ("one late fee per charge"); lastReminderAt paces repeat reminders.
    lateFeeChargeId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    lastReminderAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  // optimisticConcurrency: two admins recording receipts on the same charge
  // race on read-modify-write of receipts/paidAmount; the __v guard turns the
  // loser's save into a VersionError instead of a silent overwrite.
  { timestamps: true, optimisticConcurrency: true }
);

PaymentSchema.index({ unitId: 1, dueDate: -1 });
PaymentSchema.index({ status: 1, dueDate: 1 });

export type PaymentType = InferSchemaType<typeof PaymentSchema>;
export type PaymentDoc = HydratedDocument<PaymentType>;
export const Payment = model('Payment', PaymentSchema);
