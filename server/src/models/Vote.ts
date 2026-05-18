import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const VoteSchema = new Schema(
  {
    pollId: { type: Schema.Types.ObjectId, ref: 'Poll', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    optionIds: { type: [String], required: true, validate: (v: string[]) => v.length >= 1 },
    castAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

VoteSchema.index({ pollId: 1, userId: 1 }, { unique: true });

export type VoteType = InferSchemaType<typeof VoteSchema>;
export type VoteDoc = HydratedDocument<VoteType>;
export const Vote = model('Vote', VoteSchema);
