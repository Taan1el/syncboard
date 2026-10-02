import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import type { AppContext, AppOptions } from './app.js';
import { WebSocketService } from './services/websocket.service.js';

export interface RunningServer extends AppContext {
  server: http.Server;
  wss: WebSocketServer;
  ws: WebSocketService;
  close: () => Promise<void>;
}

/** HTTP API, WebSocket endpoint at /ws and the built client on one server. */
export function createServer(options: AppOptions = {}): RunningServer {
  const ctx = createApp(options);
  const server = http.createServer(ctx.app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const ws = new WebSocketService(wss, ctx.hub);
  ctx.publisher.publish = ws.deliver;

  const close = () =>
    new Promise<void>((resolve) => {
      for (const client of wss.clients) client.terminate();
      wss.close(() => {
        server.close(() => {
          ctx.db.close();
          resolve();
        });
        server.closeAllConnections();
      });
    });

  return { ...ctx, server, wss, ws, close };
}
