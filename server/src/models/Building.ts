import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const STATUSES = ['active', 'inactive'] as const;

const BuildingSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    currency: { type: String, default: 'ILS' },
    // Admin can deactivate a building without deleting it — residents lose
    // access immediately but historical data (payments, expenses, polls)
    // stays intact for audit. Re-activating is reversible.
    status: { type: String, enum: STATUSES, default: 'active', index: true },
    // System-admin-controlled allow-list of module ids this building's users
    // can access. When unset (undefined) the building has no restriction —
    // every role's full module set is active. When set, the resident's
    // effective `capabilities.modules` is intersected with this list.
    // Ids match `MODULES.*` in services/capabilities.service.ts.
    enabledModules: { type: [String], default: undefined },
    settings: {
      monthlyDuesDay: { type: Number, default: 1, min: 1, max: 28 },
      // Building-wide fallback for units that don't set their own amount.
      defaultMonthlyDues: { type: Number, default: 0, min: 0 },
      lateFee: {
        gracePeriodDays: { type: Number, default: 5, min: 0 },
        flatAmount: { type: Number, default: 0, min: 0 },
        percent: { type: Number, default: 0, min: 0, max: 100 },
      },
      timezone: { type: String, default: 'UTC' },
      // Anchor for per-user geo-fence radii. Each user's fence is computed
      // against this point; setting both null disables fencing at the
      // building level regardless of per-user radius.
      geoCenter: {
        lat: { type: Number, default: null, min: -90, max: 90 },
        lng: { type: Number, default: null, min: -180, max: 180 },
      },
    },
  },
  { timestamps: true }
);

export const BUILDING_STATUSES = STATUSES;

export type BuildingType = InferSchemaType<typeof BuildingSchema>;
export type BuildingDoc = HydratedDocument<BuildingType>;
export const Building = model('Building', BuildingSchema);
