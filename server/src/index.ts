import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { WebSocketService } from './services/websocket.service.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const { app, boardService } = createApp();

const server = http.createServer(app);

// Mount WebSocket server on /ws
const wss = new WebSocketServer({ server, path: '/ws' });
new WebSocketService(wss, boardService);

server.listen(PORT, () => {
  console.log(`[SyncBoard Server] HTTP API running on http://localhost:${PORT}`);
  console.log(`[SyncBoard Server] WebSocket endpoint at ws://localhost:${PORT}/ws`);
});
