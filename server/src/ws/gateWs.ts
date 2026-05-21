import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import bcrypt from 'bcryptjs';
import { logger } from '../config/logger.js';
import { Building } from '../models/Building.js';
import { registerDevice, unregisterDevice } from '../services/gateHub.js';

const WS_PATH = '/ws/gate';
const HEARTBEAT_MS = 30_000;

export function attachGateWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url) return socket.destroy();
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== WS_PATH) {
      // Let other upgrade handlers (none today) try; if nothing claims it,
      // node closes the socket once the request ends.
      return;
    }

    void authenticateDevice(url).then((auth) => {
      if (!auth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, auth);
      });
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, auth: { buildingId: string }) => {
    registerDevice(auth.buildingId, ws);
    Building.updateOne(
      { _id: auth.buildingId },
      { $set: { 'gateDevice.lastSeenAt': new Date() } }
    ).catch((err) => logger.warn({ err }, 'Failed to update gate lastSeenAt'));

    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) {
        try { ws.terminate(); } catch { /* swallow */ }
        return;
      }
      alive = false;
      try { ws.ping(); } catch { /* swallow */ }
    }, HEARTBEAT_MS);

    ws.on('pong', () => { alive = true; });
    ws.on('message', () => { alive = true; });
    ws.on('close', () => {
      clearInterval(heartbeat);
      unregisterDevice(auth.buildingId, ws);
    });
    ws.on('error', (err) => {
      logger.warn({ err, buildingId: auth.buildingId }, 'Gate WS error');
    });
  });

  logger.info({ path: WS_PATH }, 'Gate WebSocket server attached');
}

async function authenticateDevice(url: URL): Promise<{ buildingId: string } | null> {
  const token = url.searchParams.get('token');
  const buildingId = url.searchParams.get('buildingId');
  if (!token || !buildingId) return null;

  try {
    const building = await Building.findById(buildingId).select('gateDevice').lean();
    const hash = building?.gateDevice?.tokenHash;
    if (!hash) return null;
    const ok = await bcrypt.compare(token, hash);
    return ok ? { buildingId } : null;
  } catch (err) {
    logger.warn({ err }, 'Gate WS auth lookup failed');
    return null;
  }
}
