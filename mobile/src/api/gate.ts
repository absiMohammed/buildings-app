import { api } from './client';

export type DoorState = 'open' | 'closed' | 'unknown';

export interface GateStatus {
  online: boolean;
  doorState: DoorState;
}

export interface TriggerResult {
  ok: true;
  /** When the reed switch reports the gate is already open the server
   *  no-ops and sets this flag so the UI can swap its success pill for
   *  an "already open" one. */
  skipped?: boolean;
  reason?: 'already_open';
}

export async function triggerGate(): Promise<TriggerResult> {
  // Send `{}` (not `null`) — express.json() strict-mode rejects `null`
  // as the top-level value and the request 500s.
  const r = await api.post<TriggerResult>('/gate/trigger', {}, { timeout: 8000 });
  return r.data;
}

export async function fetchGateStatus(): Promise<GateStatus> {
  const r = await api.get<GateStatus>('/gate/status', { timeout: 6000 });
  return r.data;
}
