import { api } from './client';

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent';
export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'elevator'
  | 'common_area'
  | 'other';

export interface MaintenanceComment {
  _id: string;
  userId: string;
  body: string;
  createdAt: string;
}

export interface MaintenanceRequest {
  _id: string;
  buildingId: string;
  unitId: string | null;
  filedBy: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedTo: string;
  comments: MaintenanceComment[];
  resolvedAt: string | null;
  resolutionNotes: string;
  createdAt: string;
  updatedAt: string;
}

export async function listMaintenance(): Promise<MaintenanceRequest[]> {
  const r = await api.get<{ requests: MaintenanceRequest[] }>('/maintenance');
  return r.data.requests ?? [];
}

export async function getMaintenance(id: string): Promise<MaintenanceRequest> {
  const r = await api.get<{ request: MaintenanceRequest }>(`/maintenance/${id}`);
  return r.data.request;
}

export async function createMaintenance(body: {
  title: string;
  description?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  unitId?: string | null;
}): Promise<MaintenanceRequest> {
  const r = await api.post<{ request: MaintenanceRequest }>('/maintenance', body);
  return r.data.request;
}

/** Admin may set status/priority/assignee/resolution; filer may edit title/description. */
export async function updateMaintenance(
  id: string,
  body: {
    status?: MaintenanceStatus;
    priority?: MaintenancePriority;
    assignedTo?: string;
    title?: string;
    description?: string;
    resolutionNotes?: string;
  },
): Promise<MaintenanceRequest> {
  const r = await api.patch<{ request: MaintenanceRequest }>(`/maintenance/${id}`, body);
  return r.data.request;
}

export async function addMaintenanceComment(id: string, body: string): Promise<MaintenanceRequest> {
  const r = await api.post<{ request: MaintenanceRequest }>(`/maintenance/${id}/comments`, { body });
  return r.data.request;
}
