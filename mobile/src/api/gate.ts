import axios from 'axios';

export const GATE_TRIGGER_URL = 'http://192.168.1.150/api/gate/trigger';

export async function triggerGate(): Promise<void> {
  await axios.post(GATE_TRIGGER_URL, null, { timeout: 5000 });
}
