import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// Prepaid credit a user holds with one building — the surplus when money
// received exceeds the charges it was recorded against. Auto-applied (as a
// system 'credit' receipt) when new charges are generated for their unit.
// Keyed per (user, building) because a user can belong to several buildings
// with different currencies. Balance mutations must go through atomic $inc
// updates (deductions guarded with { balance: { $gte: take } }) so the
// balance can never go negative under concurrency.
const UserCreditSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true }
);

UserCreditSchema.index({ userId: 1, buildingId: 1 }, { unique: true });

export type UserCreditType = InferSchemaType<typeof UserCreditSchema>;
export type UserCreditDoc = HydratedDocument<UserCreditType>;
export const UserCredit = model('UserCredit', UserCreditSchema);
