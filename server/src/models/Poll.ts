import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const STATUSES = ['draft', 'open', 'closed'] as const;

const PollOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const PollSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    options: { type: [PollOptionSchema], required: true, validate: (v: unknown[]) => v.length >= 2 },
    eligibleRoles: {
      type: [String],
      enum: ['admin', 'owner', 'renter', 'dependent'],
      default: ['owner'],
    },
    allowMultiple: { type: Boolean, default: false },
    anonymous: { type: Boolean, default: false },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: 'draft', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export type PollType = InferSchemaType<typeof PollSchema>;
export type PollDoc = HydratedDocument<PollType>;
export const Poll = model('Poll', PollSchema);
