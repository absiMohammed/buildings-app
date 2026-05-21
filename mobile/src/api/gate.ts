import { api } from './client';

export async function triggerGate(): Promise<void> {
  // Backend forwards the trigger to the building's ESP-01 over WebSocket.
  // The caller's JWT determines which building's gate fires.
  await api.post('/gate/trigger', null, { timeout: 8000 });
}
