import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One row per subscription installment the admin records for a building.
 * Distinct from the resident-facing `Payment` model — that one tracks dues
 * paid into a building; this one tracks the building's payment INTO the
 * SaaS platform. Status is admin-controlled (pending / paid / cancelled);
 * "overdue" is derived in the UI from `status === 'pending' && dueDate < now`.
 */
const STATUSES = ['pending', 'paid', 'cancelled'] as const;
const KINDS = ['annual', 'monthly'] as const;
const METHODS = ['cash', 'transfer', 'card', 'other'] as const;

const SubscriptionPaymentSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    periodKind: { type: String, enum: KINDS, required: true },
    // Free-form human label for the period — "2026" for annual, "2026-05"
    // for monthly. Combined with periodKind, gives the admin a stable
    // breadcrumb when scanning the list.
    periodLabel: { type: String, required: true, trim: true, maxlength: 32 },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    method: { type: String, enum: METHODS, default: null },
    externalRef: { type: String, default: '', maxlength: 200 },
    notes: { type: String, default: '', maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

SubscriptionPaymentSchema.index({ buildingId: 1, dueDate: -1 });
SubscriptionPaymentSchema.index({ status: 1, dueDate: -1 });

export const SUBSCRIPTION_PAYMENT_STATUSES = STATUSES;
export const SUBSCRIPTION_PAYMENT_KINDS = KINDS;
export const SUBSCRIPTION_PAYMENT_METHODS = METHODS;

export type SubscriptionPaymentType = InferSchemaType<typeof SubscriptionPaymentSchema>;
export type SubscriptionPaymentDoc = HydratedDocument<SubscriptionPaymentType>;
export const SubscriptionPayment = model('SubscriptionPayment', SubscriptionPaymentSchema);
