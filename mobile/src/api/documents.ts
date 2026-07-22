import { api, API_BASE_URL } from './client';

export type DocumentCategory = 'bylaws' | 'meeting_minutes' | 'notice' | 'contract' | 'other';
export type DocumentVisibility = 'all' | 'owners_only' | 'admin_only';

export interface BuildingDocument {
  _id: string;
  buildingId: string;
  title: string;
  description: string;
  category: DocumentCategory;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibility;
  uploadedBy: string;
  createdAt: string;
}

export async function listDocuments(): Promise<BuildingDocument[]> {
  const r = await api.get<{ documents: BuildingDocument[] }>('/documents');
  return r.data.documents ?? [];
}

/** Admin-only. Deletes the document and its stored file. */
export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/documents/${id}`);
}

/** Absolute URL for downloading a document (auth is via the same session). */
export function documentDownloadUrl(id: string): string {
  return `${API_BASE_URL}/documents/${id}/download`;
}
