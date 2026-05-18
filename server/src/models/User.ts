import { Schema, model, type InferSchemaType, type HydratedDocument, Types } from 'mongoose';

const ROLES = ['admin', 'owner', 'renter', 'dependent'] as const;
const STATUSES = ['invited', 'active', 'suspended'] as const;
const GEO_ACTIONS = ['open_gate', 'close_gate', 'open_door', 'call_elevator'] as const;

const GeoFenceSchema = new Schema(
  {
    centerLat: { type: Number, default: null },
    centerLng: { type: Number, default: null },
    radiusMeters: { type: Number, default: null },
    allowedActions: { type: [String], enum: GEO_ACTIONS, default: [] },
  },
  { _id: false }
);

// Per-user policy & quota knobs configurable by the admin. Each subfield is
// optional; null/undefined means "use the building default (or unlimited
// where no default exists)". Keep this open-ended via `custom` so the admin
// can attach arbitrary key/value preferences without a model migration.
const UserSettingsSchema = new Schema(
  {
    // Cap on how many dependents this user (owner or renter) is allowed
    // to invite into their unit. null = unlimited. Admin role ignores this.
    maxDependents: { type: Number, default: null, min: 0 },
    // Recurring monthly utility lines that this user owes on top of dues.
    // Keyed by free-form utility name (e.g. "electricity", "internet").
    monthlyUtilities: { type: Map, of: Number, default: undefined },
    geoFence: { type: GeoFenceSchema, default: undefined },
    // Free-form admin-set preferences. Stored as strings to keep the API
    // simple; richer types can live in dedicated fields when justified.
    custom: { type: Map, of: String, default: undefined },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, default: null },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
    role: { type: String, enum: ROLES, required: true },
    // System admins (`role === 'admin'`) are NOT attached to any building:
    // they CRUD buildings and assign building admins across the whole
    // system. Every other role MUST belong to a specific building.
    buildingId: {
      type: Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
      index: true,
      validate: {
        validator(this: { role?: string }, v: unknown) {
          if (this.role === 'admin') return true;
          return v != null;
        },
        message: 'buildingId is required for non-admin roles',
      },
    },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    linkedOwnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Building-admin flag — only meaningful when `role === 'owner'`. When
    // true, the owner can switch to "admin view" in the mobile UI and is
    // granted the building-management capability set on top of owner caps.
    // A building has at most one owner with this flag set (enforced at the
    // appointment endpoint, not at the schema level).
    isBuildingAdmin: { type: Boolean, default: false, index: true },
    status: { type: String, enum: STATUSES, default: 'invited', index: true },
    refreshTokenHash: { type: String, default: null },
    // Wall-clock cutoff for live session validity. Access tokens whose
    // `iat` claim is older than this timestamp are rejected by the auth
    // middleware. Bumped on logout-all and on admin suspension so revocation
    // is immediate, not deferred until the JWT's natural expiry.
    sessionsRevokedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    settings: { type: UserSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const GEO_FENCE_ACTIONS = GEO_ACTIONS;

UserSchema.index({ buildingId: 1, role: 1 });

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete (ret as Record<string, unknown>).passwordHash;
    delete (ret as Record<string, unknown>).refreshTokenHash;
    delete (ret as Record<string, unknown>).__v;
    return ret;
  },
});

export type UserType = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };
export type UserDoc = HydratedDocument<UserType>;
export const User = model('User', UserSchema);
