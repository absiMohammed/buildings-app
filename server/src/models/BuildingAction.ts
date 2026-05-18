import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A configurable building-scoped "action" the residents can trigger from
 * the QuickActions modal — open a gate, call an elevator, etc. Each action
 * is wired to an external integration via `config` (API key/secret/endpoint
 * etc.) and carries its own annual price on top of the building's feature
 * subscription. The system admin authors these from BuildingDetailPage.
 *
 * `config` keys can contain `.` so we use Mixed (plain object) rather than
 * a Mongoose Map. Sensitive values (api secrets) are stored as-is; the API
 * doesn't redact yet — treat the dev DB as untrusted.
 */
const TYPES = ['open_gate', 'close_gate', 'open_door', 'call_elevator', 'custom'] as const;
const STATUSES = ['active', 'inactive'] as const;

const BuildingActionSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    type: { type: String, enum: TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 280 },
    config: { type: Schema.Types.Mixed, default: () => ({}) },
    annualPrice: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: STATUSES, default: 'active', index: true },
  },
  { timestamps: true }
);

BuildingActionSchema.index({ buildingId: 1, status: 1 });

export const BUILDING_ACTION_TYPES = TYPES;
export const BUILDING_ACTION_STATUSES = STATUSES;

export type BuildingActionType = InferSchemaType<typeof BuildingActionSchema> & {
  config: Record<string, string>;
};
export type BuildingActionDoc = HydratedDocument<BuildingActionType>;
export const BuildingAction = model('BuildingAction', BuildingActionSchema);
