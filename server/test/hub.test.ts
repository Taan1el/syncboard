import { beforeEach, describe, expect, it } from 'vitest';
import { Hub } from '../../shared/hub.js';
import type { Delivery } from '../../shared/hub.js';
import { MemoryStore } from '../../shared/memory-store.js';
import { DEFAULT_BOARD_ID, DOCS_BOARD_ID } from '../../shared/sample.js';
import type { ServerWsMessage } from '../../shared/types.js';

let clock = 0;
let seq = 0;
let store: MemoryStore;
let hub: Hub;

beforeEach(() => {
  clock = Date.parse('2026-10-02T10:00:00.000Z');
  seq = 0;
  store = new MemoryStore();
  hub = new Hub(store, { now: () => clock, newId: () => `id-${++seq}` });
});

const join = (id: string, name: string, board = DEFAULT_BOARD_ID) => {
  hub.connect(id);
  return hub.receive(id, { type: 'join_board', board_id: board, user_name: name, color: '#112233' });
};
const types = (d: Delivery[]) => d.map((x) => x.msg.type);
const only = <T extends ServerWsMessage['type']>(d: Delivery[], type: T) =>
  d.find((x) => x.msg.type === type)!.msg as Extract<ServerWsMessage, { type: T }>;

describe('join', () => {
  it('sends a full snapshot to the joiner and the roster to everyone', () => {
    join('a', 'Ada');
    const out = join('b', 'Bo');
    expect(types(out)).toEqual(['board_sync', 'presence_update']);
    const sync = only(out, 'board_sync');
    expect(sync.cards).toHaveLength(9);
    expect(sync.activity).toHaveLength(3);
    expect(sync.presences.map((p) => p.user_name)).toEqual(['Ada', 'Bo']);
    expect(out[1].to.sort()).toEqual(['a', 'b']);
  });

  it('renames a duplicate name instead of sharing an identity', () => {
    join('a', 'Ada');
    const sync = only(join('b', 'Ada'), 'board_sync');
    expect(sync.user_name).toBe('Ada 2');
    expect(only(join('c', 'Ada'), 'board_sync').user_name).toBe('Ada 3');
  });

  it('errors for an unknown board and for frames before joining', () => {
    hub.connect('a');
    const bad = hub.receive('a', { type: 'join_board', board_id: 'nope', user_name: 'Ada', color: '#112233' });
    expect(only(bad, 'error').message).toMatch(/Board not found/);
    expect(only(hub.receive('a', { type: 'card_delete', id: 'rel-1' }), 'error').message).toMatch(/Join a board first/);
  });

  it('moves a client between boards and tells the old board', () => {
    join('a', 'Ada');
    join('b', 'Bo');
    const out = hub.receive('b', { type: 'join_board', board_id: DOCS_BOARD_ID, user_name: 'Bo', color: '#112233' });
    const toOld = out.find((d) => d.msg.type === 'presence_update' && d.to.includes('a'))!;
    expect((toOld.msg as { presences: unknown[] }).presences).toHaveLength(1);
    expect(only(out, 'board_sync').cards.every((c) => c.board_id === DOCS_BOARD_ID)).toBe(true);
  });
});

describe('operations', () => {
  it('broadcasts a move to the whole board including the sender, and records activity', () => {
    join('a', 'Ada');
    join('b', 'Bo');
    const out = hub.receive('a', { type: 'card_move', id: 'rel-1', column: 'doing', index: 0, version: 1 });
    expect(types(out)).toEqual(['card_moved', 'activity']);
    expect(out[0].to.sort()).toEqual(['a', 'b']);
    expect(only(out, 'activity').entry).toMatchObject({ action: 'card.moved', actor_name: 'Ada', detail: 'doing' });
    expect(store.listActivity(DEFAULT_BOARD_ID, 1)[0].card_title).toBe('Write the changelog');
  });

  it('keeps boards isolated', () => {
    join('a', 'Ada');
    join('b', 'Bo', DOCS_BOARD_ID);
    const out = hub.receive('a', { type: 'card_create', title: 'Only here', content: '', column: 'backlog' });
    expect(out[0].to).toEqual(['a']);
  });

  it('turns a rejected operation into an error for the sender only', () => {
    join('a', 'Ada');
    join('b', 'Bo');
    hub.receive('a', { type: 'card_lock', id: 'rel-1' });
    const out = hub.receive('b', { type: 'card_delete', id: 'rel-1' });
    expect(out).toHaveLength(1);
    expect(out[0].to).toEqual(['b']);
    expect(only(out, 'error').message).toMatch(/Ada is editing/);
    expect(store.listCards(DEFAULT_BOARD_ID)).toHaveLength(9);
  });

  it('reports presence.editing while a lock is held', () => {
    join('a', 'Ada');
    const out = hub.receive('a', { type: 'card_lock', id: 'rel-2' });
    expect(only(out, 'presence_update').presences[0].editing).toBe('rel-2');
    const after = hub.receive('a', { type: 'card_unlock', id: 'rel-2' });
    expect(only(after, 'presence_update').presences[0].editing).toBeNull();
  });

  it('answers invalid frames with a readable error and ignores heartbeats', () => {
    join('a', 'Ada');
    expect(only(hub.receive('a', { type: 'card_create', title: '', content: '', column: 'done' }), 'error').message).toMatch(/title is required/);
    expect(hub.receive('a', { type: 'heartbeat' })).toEqual([]);
    expect(hub.receive('ghost', { type: 'heartbeat' })).toEqual([]);
  });
});

describe('disconnect and staleness', () => {
  it('releases locks held by a closed connection and updates the roster', () => {
    join('a', 'Ada');
    join('b', 'Bo');
    hub.receive('a', { type: 'card_lock', id: 'rel-1' });
    const out = hub.disconnect('a');
    expect(types(out)).toEqual(['card_unlocked', 'presence_update']);
    expect(out.every((d) => d.to.join() === 'b')).toBe(true);
    expect(store.listCards(DEFAULT_BOARD_ID).find((c) => c.id === 'rel-1')?.locked_by).toBeNull();
    expect(hub.connectionCount()).toBe(1);
    expect(hub.disconnect('a')).toEqual([]);
  });

  it('lists connections silent for longer than the limit', () => {
    join('a', 'Ada');
    join('b', 'Bo');
    clock += 30_000;
    hub.receive('b', { type: 'heartbeat' });
    clock += 20_000;
    expect(hub.staleClients(45_000)).toEqual(['a']);
  });

  it('clears locks left over from a previous run when it starts', () => {
    store.commit(DEFAULT_BOARD_ID, {
      cards: [],
      changed: [{ ...store.listCards(DEFAULT_BOARD_ID)[0], locked_by: 'Ghost' }],
      removed: [],
      event: { type: 'card_unlocked', id: 'x' },
      audit: null,
    }, 'Ghost', '2026-10-02T10:00:00.000Z');
    expect(store.listCards(DEFAULT_BOARD_ID).some((c) => c.locked_by)).toBe(true);
    new Hub(store);
    expect(store.listCards(DEFAULT_BOARD_ID).some((c) => c.locked_by)).toBe(false);
  });
});

describe('run (REST path)', () => {
  it('creates a card without a socket and reaches board members', () => {
    join('a', 'Ada');
    const out = hub.run(DEFAULT_BOARD_ID, 'API', { type: 'create', title: 'From REST', content: '', column: 'done' });
    expect(out[0].to).toEqual(['a']);
    expect(only(out, 'card_created').card.id).toBe('id-1');
    expect(() => hub.run('missing', 'API', { type: 'delete', id: 'x' })).toThrow(/Board not found/);
  });
});
