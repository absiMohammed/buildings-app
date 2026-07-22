import { Schema, model, type InferSchemaType, type HydratedDocument, Types } from 'mongoose';

const BUILDING_ROLES = ['owner', 'renter', 'dependent', 'independent'] as const;
const SYSTEM_ROLES = ['admin', 'member'] as const;
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

const UserSettingsSchema = new Schema(
  {
    maxDependents: { type: Number, default: null, min: 0 },
    monthlyUtilities: { type: Map, of: Number, default: undefined },
    geoFence: { type: GeoFenceSchema, default: undefined },
    custom: { type: Map, of: String, default: undefined },
  },
  { _id: false }
);

// A single building relationship. A user can hold several of these — across
// different buildings, and each may cover multiple units. `independent`
// memberships (guard/staff) carry a building but no units.
const MembershipSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    role: { type: String, enum: BUILDING_ROLES, required: true },
    unitIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Unit' }], default: [] },
    isBuildingAdmin: { type: Boolean, default: false },
    // For dependents: the owner/renter they belong to within this building.
    linkedOwnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    // Phone is the login identity and is globally unique. Email is optional.
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: null },
    passwordHash: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    // System-level role. 'admin' = application super-admin (no memberships);
    // 'member' = normal user whose per-building roles live in `memberships`.
    systemRole: { type: String, enum: SYSTEM_ROLES, default: 'member', index: true },
    // Every non-super-admin belongs to at least one building via a membership.
    memberships: { type: [MembershipSchema], default: [] },
    status: { type: String, enum: STATUSES, default: 'invited', index: true },
    refreshTokenHash: { type: String, default: null },
    sessionsRevokedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    settings: { type: UserSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const GEO_FENCE_ACTIONS = GEO_ACTIONS;

// Email uniqueness only among users that actually have one.
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

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
export type MembershipType = UserType['memberships'][number];

/** The FIRST membership matching `buildingId` (and `role` if given), or undefined. */
export function membershipFor(
  user: UserType,
  buildingId: string | Types.ObjectId | null | undefined,
  role?: string,
) {
  if (!buildingId) return undefined;
  const target = String(buildingId);
  return user.memberships.find(
    (m) => String(m.buildingId) === target && (role === undefined || m.role === role),
  );
}

/** Every membership the user holds in `buildingId` (a user can be, say, owner
 *  of one unit and tenant of another → one membership per role). */
export function membershipsForBuilding(
  user: UserType,
  buildingId: string | Types.ObjectId | null | undefined,
) {
  if (!buildingId) return [];
  const target = String(buildingId);
  return user.memberships.filter((m) => String(m.buildingId) === target);
}

const ROLE_STRENGTH: Record<string, number> = { owner: 3, renter: 2, dependent: 1, independent: 0 };

/** The representative membership for a building context: prefers a building-
 *  admin membership, then the strongest role. Used for the token/capabilities
 *  when a user has several roles in one building. */
export function primaryMembership(
  user: UserType,
  buildingId: string | Types.ObjectId | null | undefined,
) {
  const ms = membershipsForBuilding(user, buildingId);
  if (!ms.length) return undefined;
  return [...ms].sort(
    (a, b) =>
      Number(!!b.isBuildingAdmin) - Number(!!a.isBuildingAdmin) ||
      (ROLE_STRENGTH[b.role] ?? 0) - (ROLE_STRENGTH[a.role] ?? 0),
  )[0];
}

export const User = model('User', UserSchema);
