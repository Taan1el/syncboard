import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import type { RunningServer } from '../src/server.js';
import { DEFAULT_BOARD_ID } from '../../shared/sample.js';
import type { ClientWsMessage, ServerWsMessage } from '../../shared/types.js';

/** Test socket that queues frames so tests wait on events instead of sleeping. */
class Peer {
  private queue: ServerWsMessage[] = [];
  private waiters: Array<() => void> = [];
  closed: Promise<void>;
  constructor(private ws: WebSocket) {
    ws.on('message', (data) => {
      this.queue.push(JSON.parse(data.toString()));
      this.waiters.splice(0).forEach((w) => w());
    });
    this.closed = new Promise((resolve) => ws.on('close', () => resolve()));
  }
  static async open(port: number): Promise<Peer> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new Peer(ws);
  }
  send(msg: ClientWsMessage | Record<string, unknown>) {
    this.ws.send(JSON.stringify(msg));
  }
  sendRaw(text: string) {
    this.ws.send(text);
  }
  async next<T extends ServerWsMessage['type']>(type: T): Promise<Extract<ServerWsMessage, { type: T }>> {
    for (;;) {
      const i = this.queue.findIndex((m) => m.type === type);
      if (i >= 0) return this.queue.splice(i, 1)[0] as Extract<ServerWsMessage, { type: T }>;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }
  drop(type: ServerWsMessage['type']) {
    this.queue = this.queue.filter((m) => m.type !== type);
  }
  async join(name: string, board = DEFAULT_BOARD_ID) {
    this.send({ type: 'join_board', board_id: board, user_name: name, color: '#336699' });
    return this.next('board_sync');
  }
  close() {
    this.ws.close();
    return this.closed;
  }
}

let srv: RunningServer;
let port: number;
const peers: Peer[] = [];

const connect = async () => {
  const p = await Peer.open(port);
  peers.push(p);
  return p;
};

beforeEach(async () => {
  srv = createServer({ dbPath: ':memory:' });
  await new Promise<void>((resolve) => srv.server.listen(0, '127.0.0.1', resolve));
  port = (srv.server.address() as AddressInfo).port;
});

afterEach(async () => {
  peers.length = 0;
  await srv.close();
});

describe('live WebSocket rooms', () => {
  it('sends a board snapshot on join', async () => {
    const a = await connect();
    const sync = await a.join('Ada');
    expect(sync.board.id).toBe(DEFAULT_BOARD_ID);
    expect(sync.cards).toHaveLength(9);
    expect(sync.user_name).toBe('Ada');
    expect(sync.presences.map((p) => p.user_name)).toEqual(['Ada']);
  });

  it('shows a new peer in the other peer roster and removes it on close', async () => {
    const a = await connect();
    await a.join('Ada');
    await a.next('presence_update');
    const b = await connect();
    await b.join('Bo');
    const joined = await a.next('presence_update');
    expect(joined.presences.map((p) => p.user_name).sort()).toEqual(['Ada', 'Bo']);
    a.drop('presence_update');
    await b.close();
    const left = await a.next('presence_update');
    expect(left.presences.map((p) => p.user_name)).toEqual(['Ada']);
  });

  it('delivers a move to every peer and persists it', async () => {
    const a = await connect();
    const b = await connect();
    await a.join('Ada');
    await b.join('Bo');
    a.send({ type: 'card_move', id: 'rel-1', column: 'doing', index: 0, version: 1 });
    const seenByB = await b.next('card_moved');
    const seenByA = await a.next('card_moved');
    expect(seenByB).toMatchObject({ id: 'rel-1', column: 'doing', index: 0, version: 2, updated_by: 'Ada' });
    expect(seenByA).toEqual(seenByB);
    expect((await b.next('activity')).entry.action).toBe('card.moved');
    expect(srv.store.listCards(DEFAULT_BOARD_ID).find((c) => c.id === 'rel-1')?.column).toBe('doing');
  });

  it('rejects a move on a card locked by someone else and leaves the card alone', async () => {
    const a = await connect();
    const b = await connect();
    await a.join('Ada');
    await b.join('Bo');
    a.send({ type: 'card_lock', id: 'rel-1' });
    expect((await b.next('card_locked')).locked_by).toBe('Ada');
    b.send({ type: 'card_move', id: 'rel-1', column: 'done', index: 0, version: 1 });
    expect((await b.next('error')).message).toMatch(/Ada is editing/);
    expect(srv.store.listCards(DEFAULT_BOARD_ID).find((c) => c.id === 'rel-1')?.column).toBe('backlog');
  });

  it('releases locks when the holder disconnects', async () => {
    const a = await connect();
    const b = await connect();
    await a.join('Ada');
    await b.join('Bo');
    a.send({ type: 'card_lock', id: 'rel-2' });
    await b.next('card_locked');
    await a.close();
    expect((await b.next('card_unlocked')).id).toBe('rel-2');
    expect(srv.store.listCards(DEFAULT_BOARD_ID).find((c) => c.id === 'rel-2')?.locked_by).toBeNull();
  });

  it('answers invalid JSON and invalid frames with an error and keeps the socket open', async () => {
    const a = await connect();
    await a.join('Ada');
    a.sendRaw('{not json');
    expect((await a.next('error')).message).toMatch(/not valid JSON/);
    a.send({ type: 'card_create', title: 'x'.repeat(200), content: '', column: 'done' });
    expect((await a.next('error')).message).toMatch(/at most 120/);
    a.send({ type: 'teleport' });
    expect((await a.next('error')).message).toMatch(/Unknown message type/);
    a.send({ type: 'card_create', title: 'Still works', content: '', column: 'done' });
    expect((await a.next('card_created')).card.title).toBe('Still works');
  });

  it('rejects joining a board that does not exist', async () => {
    const a = await connect();
    a.send({ type: 'join_board', board_id: 'missing', user_name: 'Ada', color: '#336699' });
    expect((await a.next('error')).message).toMatch(/Board not found/);
  });

  it('sends a fresh snapshot when a client joins again, which is how it recovers after a rejection', async () => {
    const a = await connect();
    await a.join('Ada');
    a.send({ type: 'card_delete', id: 'rel-3' });
    await a.next('card_deleted');
    const again = await a.join('Ada');
    expect(again.cards).toHaveLength(8);
  });

  it('counts open sockets in the metrics', async () => {
    await connect();
    const b = await connect();
    await b.join('Bo');
    expect(srv.boardService.getMetrics().active_connections).toBe(2);
  });
});
