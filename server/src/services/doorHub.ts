import type { WebSocket } from 'ws';
import { logger } from '../config/logger.js';

// Same permissive single-channel model as the gate hub — every door
// device joins the same set, an unlock fan-outs to all of them. Per-
// building scoping comes later.
const connections = new Set<WebSocket>();

export function registerDoor(ws: WebSocket): void {
  connections.add(ws);
  logger.info({ total: connections.size }, 'Door device connected');
}

export function unregisterDoor(ws: WebSocket): void {
  if (connections.delete(ws)) {
    logger.info({ total: connections.size }, 'Door device disconnected');
  }
}

export function isOnline(): boolean {
  for (const ws of connections) {
    if (ws.readyState === 1) return true;
  }
  return false;
}

/**
 * Tell every connected door controller to drop the solenoid relay long
 * enough for someone to walk through. The actual unlock duration is
 * fixed in firmware (typically 3–5 s) — the server only signals the
 * intent.
 */
export function sendUnlock(): boolean {
  const payload = JSON.stringify({ type: 'unlock', at: new Date().toISOString() });
  let delivered = 0;
  for (const ws of connections) {
    if (ws.readyState === 1) {
      ws.send(payload);
      delivered++;
    }
  }
  return delivered > 0;
}
