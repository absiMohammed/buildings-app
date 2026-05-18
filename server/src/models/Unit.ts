import { Schema, model, type InferSchemaType, type HydratedDocument, Types } from 'mongoose';

const UnitSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    number: { type: String, required: true, trim: true },
    floor: { type: Number },
    sqft: { type: Number, min: 0 },
    bedrooms: { type: Number, min: 0 },
    // null/undefined ⇒ inherit Building.settings.defaultMonthlyDues at billing time.
    monthlyDuesAmount: { type: Number, default: null, min: 0 },
    // If set, overrides the building-wide settings.monthlyDuesDay for this unit only.
    monthlyDuesDayOverride: { type: Number, default: null, min: 1, max: 28 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    occupants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

UnitSchema.index({ buildingId: 1, number: 1 }, { unique: true });

export type UnitType = InferSchemaType<typeof UnitSchema> & { _id: Types.ObjectId };
export type UnitDoc = HydratedDocument<UnitType>;
export const Unit = model('Unit', UnitSchema);
