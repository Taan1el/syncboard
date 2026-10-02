import { WebSocket, WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import type { Delivery, Hub } from '../../../shared/hub.js';

/** Clients send a heartbeat every 15 s; silence for this long drops the connection. */
export const STALE_AFTER_MS = 45_000;
const REAP_INTERVAL_MS = 15_000;

/**
 * Moves frames between WebSockets and the Hub. All room logic lives in the
 * Hub; this class only decodes frames, delivers results and closes dead sockets.
 */
export class WebSocketService {
  private sockets = new Map<string, WebSocket>();
  private reaper: NodeJS.Timeout;

  constructor(
    private wss: WebSocketServer,
    private hub: Hub
  ) {
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.reaper = setInterval(() => this.reapStale(), REAP_INTERVAL_MS);
    this.reaper.unref();
    this.wss.on('close', () => clearInterval(this.reaper));
  }

  private onConnection(ws: WebSocket): void {
    const id = crypto.randomUUID();
    this.sockets.set(id, ws);
    this.hub.connect(id);

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Frame is not valid JSON' }));
        return;
      }
      try {
        this.deliver(this.hub.receive(id, parsed));
      } catch (err) {
        console.error('Failed to handle frame:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Internal error' }));
      }
    });

    const drop = () => {
      if (!this.sockets.delete(id)) return;
      this.deliver(this.hub.disconnect(id));
    };
    ws.on('close', drop);
    ws.on('error', drop);
  }

  /** Sends each frame to its recipients that still have an open socket. */
  deliver = (deliveries: Delivery[]): void => {
    for (const { to, msg } of deliveries) {
      const payload = JSON.stringify(msg);
      for (const id of to) {
        const ws = this.sockets.get(id);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  };

  reapStale(): void {
    for (const id of this.hub.staleClients(STALE_AFTER_MS)) {
      this.sockets.get(id)?.terminate();
    }
  }
}
