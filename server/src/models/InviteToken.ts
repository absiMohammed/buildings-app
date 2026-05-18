import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const InviteTokenSchema = new Schema(
  {
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    role: { type: String, enum: ['admin', 'owner', 'renter', 'dependent'], required: true },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    linkedOwnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type InviteTokenType = InferSchemaType<typeof InviteTokenSchema>;
export type InviteTokenDoc = HydratedDocument<InviteTokenType>;
export const InviteToken = model('InviteToken', InviteTokenSchema);
