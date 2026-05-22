import type { WebSocket } from 'ws';
import { logger } from '../config/logger.js';

// Permissive mode: every connected device listens on the same "global"
// channel. A trigger fan-outs to all of them. Tighten to per-building
// once provisioning is in place — see git history for the scoped
// version.
const connections = new Set<WebSocket>();

export type DoorState = 'open' | 'closed' | 'unknown';
// Single global door state — the firmware reports this over the WS via
// {type:"door_state", state:"open|closed"}. Defaults to 'unknown' until
// a device actually checks in, so a fresh server boot doesn't lie about
// gate position.
let doorState: DoorState = 'unknown';

export function getDoorState(): DoorState {
  return doorState;
}

export function setDoorState(next: 'open' | 'closed'): void {
  if (doorState !== next) {
    logger.info({ from: doorState, to: next }, 'Gate door state changed');
  }
  doorState = next;
}

export function registerDevice(ws: WebSocket): void {
  connections.add(ws);
  logger.info({ total: connections.size }, 'Gate device connected');
}

export function unregisterDevice(ws: WebSocket): void {
  if (connections.delete(ws)) {
    logger.info({ total: connections.size }, 'Gate device disconnected');
    // When the last device drops we can't trust the cached state any
    // more — a new device may be a different gate, or the sensor may
    // have changed without us hearing about it.
    if (connections.size === 0) doorState = 'unknown';
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
