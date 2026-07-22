import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { logger } from '../config/logger.js';
import { registerDoor, unregisterDoor } from '../services/doorHub.js';
import { deviceTokenValid } from './deviceAuth.js';

const WS_PATH = '/ws/door';
const HEARTBEAT_MS = 30_000;

export function attachDoorWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url) return socket.destroy();
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== WS_PATH) return;
    // Fail-closed device auth: reject the upgrade unless the controller
    // presents the shared token (?token=...) matching DEVICE_WS_TOKEN.
    if (!deviceTokenValid(url.searchParams.get('token'))) {
      logger.warn({ remote: req.socket.remoteAddress }, 'Door WS upgrade rejected: bad device token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    logger.info({ remote: req.socket.remoteAddress }, 'Door WS upgrade accepted');
    registerDoor(ws);

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
      unregisterDoor(ws);
    });
    ws.on('error', (err) => {
      logger.warn({ err }, 'Door WS error');
    });
  });

  logger.info({ path: WS_PATH }, 'Door WebSocket server attached');
}
