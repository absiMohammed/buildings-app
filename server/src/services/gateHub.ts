import type { WebSocket } from 'ws';
import { logger } from '../config/logger.js';

// One ESP-01 per building. If two devices connect with the same token we
// keep only the latest — the older socket is closed. This keeps the
// "single physical gate" assumption simple.
const connections = new Map<string, WebSocket>();

export function registerDevice(buildingId: string, ws: WebSocket): void {
  const existing = connections.get(buildingId);
  if (existing && existing !== ws) {
    try {
      existing.close(4001, 'replaced by newer connection');
    } catch {
      /* swallow */
    }
  }
  connections.set(buildingId, ws);
  logger.info({ buildingId }, 'Gate device connected');
}

export function unregisterDevice(buildingId: string, ws: WebSocket): void {
  if (connections.get(buildingId) === ws) {
    connections.delete(buildingId);
    logger.info({ buildingId }, 'Gate device disconnected');
  }
}

export function isOnline(buildingId: string): boolean {
  const ws = connections.get(buildingId);
  return !!ws && ws.readyState === 1; // OPEN
}

export function sendTrigger(buildingId: string): boolean {
  const ws = connections.get(buildingId);
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify({ type: 'trigger', at: new Date().toISOString() }));
  return true;
}
