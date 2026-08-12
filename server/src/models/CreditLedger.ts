import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// Append-only history of every credit-balance movement. The balance itself
// lives on UserCredit (atomic $inc); each mutation writes one ledger row
// AFTER the $inc succeeds — same fail-safe ordering as receipts: a crash in
// between loses history, never money.
const REASONS = ['surplus', 'auto_apply', 'manual'] as const;

const CreditLedgerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true },
    // Positive = credit granted, negative = credit spent.
    delta: { type: Number, required: true },
    reason: { type: String, enum: REASONS, required: true },
    // The charge involved, when the movement came from a payment flow.
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    // Who triggered it; null = system (auto-apply on charge generation).
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CreditLedgerSchema.index({ buildingId: 1, userId: 1, createdAt: -1 });

export type CreditLedgerType = InferSchemaType<typeof CreditLedgerSchema>;
export type CreditLedgerDoc = HydratedDocument<CreditLedgerType>;
export const CreditLedger = model('CreditLedger', CreditLedgerSchema);
