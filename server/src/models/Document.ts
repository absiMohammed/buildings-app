import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const CATEGORIES = ['bylaws', 'meeting_minutes', 'notice', 'contract', 'other'] as const;
const VISIBILITIES = ['all', 'owners_only', 'admin_only'] as const;

const DocumentSchema = new Schema(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
    visibility: { type: String, enum: VISIBILITIES, default: 'all' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type DocumentType = InferSchemaType<typeof DocumentSchema>;
export type DocumentDoc = HydratedDocument<DocumentType>;
export const DocumentModel = model('Document', DocumentSchema);
