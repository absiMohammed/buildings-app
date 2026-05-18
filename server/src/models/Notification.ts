import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const TYPES = [
  'payment_due',
  'payment_overdue',
  'poll_open',
  'announcement',
  'maintenance_update',
] as const;

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export type NotificationType = InferSchemaType<typeof NotificationSchema>;
export type NotificationDoc = HydratedDocument<NotificationType>;
export const Notification = model('Notification', NotificationSchema);
