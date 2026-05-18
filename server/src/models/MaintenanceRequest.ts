import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const CATEGORIES = ['plumbing', 'electrical', 'elevator', 'common_area', 'other'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

const CommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true }
);

const MaintenanceRequestSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null }, // null = common area
    filedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    status: { type: String, enum: STATUSES, default: 'open', index: true },
    assignedTo: { type: String, default: '' },
    comments: { type: [CommentSchema], default: [] },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

MaintenanceRequestSchema.index({ buildingId: 1, status: 1, createdAt: -1 });

export type MaintenanceRequestType = InferSchemaType<typeof MaintenanceRequestSchema>;
export type MaintenanceRequestDoc = HydratedDocument<MaintenanceRequestType>;
export const MaintenanceRequest = model('MaintenanceRequest', MaintenanceRequestSchema);
