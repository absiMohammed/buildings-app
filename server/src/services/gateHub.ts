import type { WebSocket } from 'ws';
import { logger } from '../config/logger.js';

// Permissive mode: every connected ESP-01 listens on the same "global"
// channel. A trigger fan-outs to all of them. Tighten to per-building
// once provisioning is in place — see git history for the scoped
// version.
const connections = new Set<WebSocket>();

export function registerDevice(ws: WebSocket): void {
  connections.add(ws);
  logger.info({ total: connections.size }, 'Gate device connected');
}

export function unregisterDevice(ws: WebSocket): void {
  if (connections.delete(ws)) {
    logger.info({ total: connections.size }, 'Gate device disconnected');
  }
}

export function isOnline(): boolean {
  for (const ws of connections) {
    if (ws.readyState === 1) return true;
  }
  return false;
}

export function sendTrigger(): boolean {
  const payload = JSON.stringify({ type: 'trigger', at: new Date().toISOString() });
  let delivered = 0;
  for (const ws of connections) {
    if (ws.readyState === 1) {
      ws.send(payload);
      delivered++;
    }
  }
  return delivered > 0;
}
