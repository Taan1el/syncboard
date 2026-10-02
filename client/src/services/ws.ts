import type { Board } from '../../../shared/types';
import type { ConnectHandlers, Connection, Services } from './types';

export const HEARTBEAT_MS = 15_000;
export const RETRY_FIRST_MS = 1_000;
export const RETRY_MAX_MS = 10_000;

/** Delay before reconnect attempt number `attempt` (0 based): 1 s, 2 s, 4 s, 8 s, then 10 s. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_FIRST_MS * 2 ** attempt, RETRY_MAX_MS);
}

export interface WsOptions {
  url?: string;
  WebSocketImpl?: typeof WebSocket;
}

function defaultUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws`;
}

/**
 * One WebSocket that reconnects with backoff. It does not join a board:
 * the app sends `join_board` whenever the status turns `open`, so a
 * reconnect always ends with a fresh board_sync.
 */
export function openConnection(handlers: ConnectHandlers, options: WsOptions = {}): Connection {
  const url = options.url ?? defaultUrl();
  const Impl = options.WebSocketImpl ?? WebSocket;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const open = () => {
    handlers.onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new Impl(url);
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      handlers.onStatus('open');
      heartbeat = setInterval(() => ws.send(JSON.stringify({ type: 'heartbeat' })), HEARTBEAT_MS);
    };
    ws.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)));
      } catch {
        // A frame that is not JSON is ignored.
      }
    };
    ws.onclose = () => {
      clearInterval(heartbeat);
      if (closed) return;
      const wait = retryDelay(attempt);
      attempt += 1;
      handlers.onStatus('reconnecting', wait);
      retryTimer = setTimeout(open, wait);
    };
    ws.onerror = () => ws.close();
  };

  open();

  return {
    send: (msg) => {
      if (socket && socket.readyState === Impl.OPEN) socket.send(JSON.stringify(msg));
    },
    close: () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      socket?.close();
    },
  };
}

export function createWsServices(options: WsOptions = {}): Services {
  return {
    isDemo: false,
    defaultName: 'Guest',
    async loadBoards(): Promise<Board[]> {
      const res = await fetch('/api/boards');
      if (!res.ok) throw new Error(`Boards request failed with status ${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    connect: (handlers) => openConnection(handlers, options),
  };
}
