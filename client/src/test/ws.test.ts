import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, openConnection, retryDelay } from '../services/ws';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const impl = FakeSocket as unknown as typeof WebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retryDelay', () => {
  it('doubles from one second up to ten', () => {
    expect([0, 1, 2, 3, 4, 5].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});

describe('openConnection', () => {
  it('reports open, forwards frames and sends only while open', () => {
    const onStatus = vi.fn();
    const onMessage = vi.fn();
    const conn = openConnection({ onStatus, onMessage }, { url: 'ws://test/ws', WebSocketImpl: impl });
    const [ws] = FakeSocket.instances;
    conn.send({ type: 'heartbeat' });
    expect(ws.sent).toEqual([]);

    ws.open();
    expect(onStatus).toHaveBeenLastCalledWith('open');
    conn.send({ type: 'card_lock', id: 'a' });
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'card_lock', id: 'a' });

    ws.onmessage?.({ data: JSON.stringify({ type: 'card_unlocked', id: 'a' }) });
    ws.onmessage?.({ data: 'not json' });
    expect(onMessage).toHaveBeenCalledTimes(1);
    conn.close();
  });

  it('sends a heartbeat every 15 seconds while connected', () => {
    const conn = openConnection({ onStatus: vi.fn(), onMessage: vi.fn() }, { WebSocketImpl: impl, url: 'ws://t' });
    const [ws] = FakeSocket.instances;
    ws.open();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(ws.sent.map((s) => JSON.parse(s).type)).toEqual(['heartbeat', 'heartbeat']);
    conn.close();
  });

  it('reconnects with growing delays and resets after a successful open', () => {
    const onStatus = vi.fn();
    openConnection({ onStatus, onMessage: vi.fn() }, { WebSocketImpl: impl, url: 'ws://t' });
    FakeSocket.instances[0].close();
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting', 1000);

    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1].close();
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting', 2000);
    vi.advanceTimersByTime(2000);
    FakeSocket.instances[2].open();
    expect(onStatus).toHaveBeenLastCalledWith('open');

    FakeSocket.instances[2].close();
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting', 1000);
  });

  it('stops retrying once closed on purpose', () => {
    const onStatus = vi.fn();
    const conn = openConnection({ onStatus, onMessage: vi.fn() }, { WebSocketImpl: impl, url: 'ws://t' });
    FakeSocket.instances[0].close();
    conn.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
