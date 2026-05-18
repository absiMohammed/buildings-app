import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const CATEGORIES = ['maintenance', 'utilities', 'repairs', 'cleaning', 'insurance', 'other'] as const;
const SPLIT_MODES = ['equal', 'by_sqft', 'none'] as const;

const ExpenseSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    category: { type: String, enum: CATEGORIES, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    description: { type: String, default: '' },
    vendor: { type: String, default: '' },
    incurredAt: { type: Date, required: true },
    receiptUrl: { type: String, default: null },
    splitMode: { type: String, enum: SPLIT_MODES, default: 'none' },
    splitGenerated: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ExpenseSchema.index({ buildingId: 1, incurredAt: -1 });

export type ExpenseType = InferSchemaType<typeof ExpenseSchema>;
export type ExpenseDoc = HydratedDocument<ExpenseType>;
export const Expense = model('Expense', ExpenseSchema);
