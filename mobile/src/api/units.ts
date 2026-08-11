import { api } from './client';

export interface Unit {
  _id: string;
  buildingId: string;
  number: string;
  floor?: number;
  sqft?: number;
  bedrooms?: number;
  monthlyDuesAmount: number | null;
  monthlyDuesDayOverride: number | null;
  /** Rent the owner charges for this unit; null = not set. */
  monthlyRentAmount: number | null;
  ownerId: string | null;
  occupants: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export async function listUnits(): Promise<Unit[]> {
  const r = await api.get<{ units: Unit[] }>('/units');
  return r.data.units ?? [];
}

export async function getUnit(id: string): Promise<Unit> {
  const r = await api.get<{ unit: Unit }>(`/units/${id}`);
  return r.data.unit;
}

/** Admin-only. */
export async function createUnit(body: {
  number: string;
  floor?: number;
  sqft?: number;
  bedrooms?: number;
  monthlyDuesAmount?: number;
  monthlyDuesDayOverride?: number | null;
  notes?: string;
}): Promise<Unit> {
  const r = await api.post<{ unit: Unit }>('/units', body);
  return r.data.unit;
}

// ── System-admin: manage a specific building's units ──────────────────────
export interface UnitInput {
  number: string;
  floor?: number;
  sqft?: number;
  bedrooms?: number;
  monthlyDuesAmount?: number;
  monthlyDuesDayOverride?: number | null;
  notes?: string;
}

export async function listBuildingUnits(buildingId: string): Promise<Unit[]> {
  const r = await api.get<{ units: Unit[] }>(`/buildings/${buildingId}/units`);
  return r.data.units ?? [];
}

export async function createBuildingUnit(buildingId: string, body: UnitInput): Promise<Unit> {
  const r = await api.post<{ unit: Unit }>(`/buildings/${buildingId}/units`, body);
  return r.data.unit;
}

export async function updateBuildingUnit(buildingId: string, unitId: string, body: Partial<UnitInput>): Promise<Unit> {
  const r = await api.patch<{ unit: Unit }>(`/buildings/${buildingId}/units/${unitId}`, body);
  return r.data.unit;
}

export async function deleteBuildingUnit(buildingId: string, unitId: string): Promise<void> {
  await api.delete(`/buildings/${buildingId}/units/${unitId}`);
}

/** Admin may edit any field; a unit owner may edit `notes` and
 *  `monthlyRentAmount` on units they own. */
export async function updateUnit(
  id: string,
  body: Partial<{
    number: string;
    floor: number;
    sqft: number;
    bedrooms: number;
    monthlyDuesAmount: number;
    monthlyDuesDayOverride: number | null;
    monthlyRentAmount: number | null;
    notes: string;
  }>,
): Promise<Unit> {
  const r = await api.patch<{ unit: Unit }>(`/units/${id}`, body);
  return r.data.unit;
}
