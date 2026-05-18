import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Singleton document holding the annual price (in the system's base currency)
 * for each feature/module that buildings can subscribe to. Admin edits this
 * via PATCH /buildings/admin/pricing. Building monthly installment is computed
 * as `annual / 12` at read time.
 *
 * Keys are MODULES.* ids (e.g. 'module.payments'). They contain `.` which
 * Mongoose Map types reject — so we store the price table as a plain object
 * field (`Schema.Types.Mixed`). The route handler enforces shape via zod;
 * here we just persist whatever object is set.
 */
const FeaturePricingSchema = new Schema(
  {
    // Stable, hardcoded singleton id so every fetch can use the same query.
    key: { type: String, default: 'GLOBAL', unique: true, index: true },
    // Record<moduleId, annualPriceInCurrency>. Currency is the deployment's
    // canonical reporting currency (we don't model multi-currency pricing
    // yet — buildings settle in their building.currency at the same number).
    prices: { type: Schema.Types.Mixed, default: () => ({}) },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true }
);

export type FeaturePricingType = InferSchemaType<typeof FeaturePricingSchema> & {
  prices: Record<string, number>;
};
export type FeaturePricingDoc = HydratedDocument<FeaturePricingType>;
export const FeaturePricing = model('FeaturePricing', FeaturePricingSchema);

/** Fetch (or lazily create) the global pricing doc. */
export async function getOrCreatePricing(): Promise<FeaturePricingDoc> {
  const existing = await FeaturePricing.findOne({ key: 'GLOBAL' });
  if (existing) return existing;
  return FeaturePricing.create({ key: 'GLOBAL' });
}
