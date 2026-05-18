import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const TYPES = ['monthly_dues', 'expense_split', 'one_off'] as const;
const STATUSES = ['pending', 'paid', 'overdue', 'waived'] as const;
const METHODS = ['cash', 'transfer', 'stripe', 'other'] as const;

const PaymentSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    type: { type: String, enum: TYPES, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paymentMethod: { type: String, enum: METHODS, default: null },
    externalRef: { type: String, default: '' },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

PaymentSchema.index({ unitId: 1, dueDate: -1 });
PaymentSchema.index({ status: 1, dueDate: 1 });

export type PaymentType = InferSchemaType<typeof PaymentSchema>;
export type PaymentDoc = HydratedDocument<PaymentType>;
export const Payment = model('Payment', PaymentSchema);
