import { api } from './client';
import type { Role } from '../auth/AuthContext';

export type UserStatus = 'invited' | 'active' | 'suspended';

export interface BuildingUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  buildingId: string | null;
  unitId: string | null;
  linkedOwnerId: string | null;
  isBuildingAdmin: boolean;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Admin-only: everyone in the caller's building. */
export async function listUsers(): Promise<BuildingUser[]> {
  const r = await api.get<{ users: BuildingUser[] }>('/users');
  return r.data.users ?? [];
}

/** Admin-only. */
export async function setUserStatus(id: string, status: 'active' | 'suspended'): Promise<BuildingUser> {
  const r = await api.patch<{ user: BuildingUser }>(`/users/${id}/status`, { status });
  return r.data.user;
}

/** Edit a user's display name. System admin (any building) or building admin
 *  (own building). */
export async function updateUserProfile(
  id: string,
  body: { firstName?: string; lastName?: string },
): Promise<BuildingUser> {
  const r = await api.patch<{ user: BuildingUser }>(`/users/${id}`, body);
  return r.data.user;
}

/** Reset a user's password and get a wa.me link to re-share the new login. */
export async function resetUserPassword(
  id: string,
): Promise<{ defaultPassword: string; whatsappUrl: string }> {
  const r = await api.patch<{ defaultPassword: string; whatsappUrl: string }>(
    `/users/${id}/reset-password`,
    {},
  );
  return r.data;
}

/** wa.me link to (re)send login info (no password reset). */
export async function getUserLoginLink(id: string): Promise<{ whatsappUrl: string }> {
  const r = await api.get<{ whatsappUrl: string }>(`/users/${id}/whatsapp-link`);
  return r.data;
}

/** System-admin-only: promote owner→admin or demote admin→owner. */
export async function setUserRole(id: string, role: 'admin' | 'owner'): Promise<BuildingUser> {
  const r = await api.patch<{ user: BuildingUser }>(`/users/${id}/role`, { role });
  return r.data.user;
}

/** System-admin-only: create another super-admin. Returns the initial password. */
export async function createSystemAdmin(body: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ defaultPassword: string }> {
  const r = await api.post<{ defaultPassword: string }>('/users/system-admin', body);
  return r.data;
}

/** Set (or clear) the building-admin flag on a building user. Any building role
 *  is allowed, and a building may have multiple building admins. */
export async function setBuildingAdmin(
  buildingId: string,
  userId: string,
  isBuildingAdmin: boolean,
): Promise<BuildingUser> {
  const r = await api.patch<{ user: BuildingUser }>(
    `/buildings/${buildingId}/admin/${userId}`,
    { isBuildingAdmin },
  );
  return r.data.user;
}
