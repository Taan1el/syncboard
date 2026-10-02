import { createServer } from './server.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const running = createServer();

running.server.listen(PORT, () => {
  console.log(`SyncBoard listening on http://localhost:${PORT} (WebSocket at /ws)`);
});

function shutdown(): void {
  void running.close().then(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
