import { api } from './client';

export interface DoorStatus {
  online: boolean;
}

export async function unlockDoor(): Promise<void> {
  await api.post('/door/unlock', {}, { timeout: 8000 });
}

export async function fetchDoorStatus(): Promise<DoorStatus> {
  const r = await api.get<DoorStatus>('/door/status', { timeout: 6000 });
  return r.data;
}
