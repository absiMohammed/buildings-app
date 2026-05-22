import { api } from './client';

export async function triggerGate(): Promise<void> {
  // Backend forwards the trigger to the building's ESP-01 over WebSocket.
  // The caller's JWT determines which building's gate fires.
  // Send `{}` (not `null`) — express.json() strict-mode rejects `null`
  // as the top-level value and the request 500s.
  await api.post('/gate/trigger', {}, { timeout: 8000 });
}
