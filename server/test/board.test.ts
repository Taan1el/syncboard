import { describe, expect, it } from 'vitest';
import { applyOp, applyServerMessage, cardsInColumn, describeActivity, moveWithin, normalize } from '../../shared/board.js';
import type { OpResult } from '../../shared/board.js';
import { nextCollaboratorFrames } from '../../shared/collaborator.js';
import { sampleCards, DEFAULT_BOARD_ID } from '../../shared/sample.js';
import type { CanvasCard } from '../../shared/types.js';
import { SyncError, parseClientMessage } from '../../shared/validate.js';

const NOW = '2026-10-02T10:00:00.000Z';
const board = () => sampleCards().filter((c) => c.board_id === DEFAULT_BOARD_ID);
const ids = (cards: CanvasCard[], column: CanvasCard['column']) => cardsInColumn(cards, column).map((c) => c.id);
let n = 0;
const newId = () => `new-${++n}`;
const run = (cards: CanvasCard[], op: Parameters<typeof applyOp>[1], actor = 'Ada'): OpResult =>
  applyOp(cards, op, actor, NOW, newId, DEFAULT_BOARD_ID);

describe('moveWithin', () => {
  it('reorders inside a column and keeps positions dense', () => {
    const next = moveWithin(board(), 'rel-1', 'backlog', 2);
    expect(ids(next, 'backlog')).toEqual(['rel-2', 'rel-3', 'rel-1']);
    expect(cardsInColumn(next, 'backlog').map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('moves across columns and renumbers both', () => {
    const next = moveWithin(board(), 'rel-1', 'doing', 1);
    expect(ids(next, 'backlog')).toEqual(['rel-2', 'rel-3']);
    expect(ids(next, 'doing')).toEqual(['rel-4', 'rel-1', 'rel-5']);
    expect(next.find((c) => c.id === 'rel-1')?.column).toBe('doing');
  });

  it('clamps an index past the end and ignores unknown ids', () => {
    expect(ids(moveWithin(board(), 'rel-1', 'done', 99), 'done')).toEqual(['rel-8', 'rel-9', 'rel-1']);
    const cards = board();
    expect(moveWithin(cards, 'nope', 'done', 0)).toBe(cards);
  });

  it('moves into an empty column', () => {
    const cards = board().filter((c) => c.column !== 'done');
    expect(ids(moveWithin(cards, 'rel-1', 'done', 0), 'done')).toEqual(['rel-1']);
  });

  it('normalize closes gaps', () => {
    const gappy = board().map((c) => (c.id === 'rel-3' ? { ...c, position: 9 } : c));
    expect(cardsInColumn(normalize(gappy), 'backlog').map((c) => c.position)).toEqual([0, 1, 2]);
  });
});

describe('applyOp', () => {
  it('creates a card at the end of its column with version 1', () => {
    const r = run(board(), { type: 'create', title: '  New card ', content: 'Body', column: 'review' });
    expect(r.event.type).toBe('card_created');
    const card = r.changed[0];
    expect(card).toMatchObject({ title: 'New card', column: 'review', position: 2, version: 1, updated_by: 'Ada' });
    expect(r.audit).toMatchObject({ action: 'card.created', detail: 'review' });
  });

  it('rejects an empty or oversized title and oversized content', () => {
    expect(() => run(board(), { type: 'create', title: '   ', content: '', column: 'backlog' })).toThrow(SyncError);
    expect(() => run(board(), { type: 'create', title: 'x'.repeat(121), content: '', column: 'backlog' })).toThrow(/at most 120/);
    expect(() => run(board(), { type: 'create', title: 'ok', content: 'y'.repeat(2001), column: 'backlog' })).toThrow(/at most 2000/);
  });

  it('moves with version max(stored, sent) + 1, so a stale version still wins', () => {
    const stale = run(board(), { type: 'move', id: 'rel-1', column: 'doing', index: 0, version: 0 });
    expect(stale.cards.find((c) => c.id === 'rel-1')?.version).toBe(2);
    const ahead = run(board(), { type: 'move', id: 'rel-1', column: 'doing', index: 0, version: 7 });
    expect(ahead.cards.find((c) => c.id === 'rel-1')?.version).toBe(8);
  });

  it('last write wins: two moves in arrival order leave the second position', () => {
    const first = run(board(), { type: 'move', id: 'rel-1', column: 'doing', index: 0, version: 1 }, 'Ada');
    const second = run(first.cards, { type: 'move', id: 'rel-1', column: 'done', index: 0, version: 1 }, 'Bo');
    const card = second.cards.find((c) => c.id === 'rel-1')!;
    expect(card).toMatchObject({ column: 'done', position: 0, updated_by: 'Bo', version: 3 });
  });

  it('lists only rows that changed after a move', () => {
    const r = run(board(), { type: 'move', id: 'rel-3', column: 'backlog', index: 0, version: 1 });
    expect(r.changed.map((c) => c.id).sort()).toEqual(['rel-1', 'rel-2', 'rel-3']);
  });

  it('updates title and content and bumps the version', () => {
    const r = run(board(), { type: 'update', id: 'rel-1', title: 'Changelog', content: 'Done', version: 1 }, 'Bo');
    expect(r.changed[0]).toMatchObject({ title: 'Changelog', content: 'Done', version: 2, updated_by: 'Bo' });
    expect(r.audit?.action).toBe('card.updated');
  });

  it('blocks move, edit and delete while someone else holds the lock', () => {
    const locked = run(board(), { type: 'lock', id: 'rel-1' }, 'Ada').cards;
    expect(() => run(locked, { type: 'move', id: 'rel-1', column: 'done', index: 0, version: 1 }, 'Bo')).toThrow(/Ada is editing/);
    expect(() => run(locked, { type: 'update', id: 'rel-1', title: 'x', content: '', version: 1 }, 'Bo')).toThrow(/Ada is editing/);
    expect(() => run(locked, { type: 'delete', id: 'rel-1' }, 'Bo')).toThrow(/Ada is editing/);
    expect(() => run(locked, { type: 'lock', id: 'rel-1' }, 'Bo')).toThrow(/already being edited by Ada/);
    expect(() => run(locked, { type: 'unlock', id: 'rel-1' }, 'Bo')).toThrow(SyncError);
  });

  it('lets the lock holder move, edit, relock and unlock', () => {
    let cards = run(board(), { type: 'lock', id: 'rel-1' }, 'Ada').cards;
    cards = run(cards, { type: 'lock', id: 'rel-1' }, 'Ada').cards;
    cards = run(cards, { type: 'update', id: 'rel-1', title: 'Mine', content: '', version: 1 }, 'Ada').cards;
    cards = run(cards, { type: 'unlock', id: 'rel-1' }, 'Ada').cards;
    expect(cards.find((c) => c.id === 'rel-1')).toMatchObject({ title: 'Mine', locked_by: null });
  });

  it('deletes a card and renumbers the column', () => {
    const r = run(board(), { type: 'delete', id: 'rel-1' });
    expect(r.removed).toEqual(['rel-1']);
    expect(cardsInColumn(r.cards, 'backlog').map((c) => c.position)).toEqual([0, 1]);
    expect(r.changed.map((c) => c.id).sort()).toEqual(['rel-2', 'rel-3']);
  });

  it('throws for unknown cards', () => {
    expect(() => run(board(), { type: 'delete', id: 'ghost' })).toThrow(/Card not found/);
    expect(() => run(board(), { type: 'lock', id: 'ghost' })).toThrow(SyncError);
  });
});

describe('applyServerMessage', () => {
  it('replays server events to the same state the server computed', () => {
    const start = board();
    const move = run(start, { type: 'move', id: 'rel-3', column: 'review', index: 1, version: 1 }, 'Ada');
    expect(applyServerMessage(start, move.event)).toEqual(move.cards);
    const del = run(move.cards, { type: 'delete', id: 'rel-8' }, 'Ada');
    expect(applyServerMessage(move.cards, del.event)).toEqual(del.cards);
  });

  it('is idempotent for moves and creations', () => {
    const move = run(board(), { type: 'move', id: 'rel-3', column: 'review', index: 0, version: 1 }, 'Ada');
    const once = applyServerMessage(board(), move.event);
    expect(applyServerMessage(once, move.event)).toEqual(once);
    const created = run(board(), { type: 'create', title: 'A', content: '', column: 'done' });
    const withCard = applyServerMessage(board(), created.event);
    expect(applyServerMessage(withCard, created.event)).toBe(withCard);
  });

  it('ignores moves and updates for cards it does not have', () => {
    const cards = board();
    expect(applyServerMessage(cards, { type: 'card_moved', id: 'x', column: 'done', index: 0, version: 2, updated_by: 'a', updated_at: NOW })).toBe(cards);
  });

  it('applies lock frames', () => {
    const locked = applyServerMessage(board(), { type: 'card_locked', id: 'rel-1', locked_by: 'Ada' });
    expect(locked.find((c) => c.id === 'rel-1')?.locked_by).toBe('Ada');
    expect(applyServerMessage(locked, { type: 'card_unlocked', id: 'rel-1' }).find((c) => c.id === 'rel-1')?.locked_by).toBeNull();
  });
});

describe('describeActivity', () => {
  it('writes one sentence per action', () => {
    const base = { actor_name: 'Ada', card_title: 'Ship it' };
    expect(describeActivity({ ...base, action: 'card.created', detail: 'backlog' })).toBe('Ada added "Ship it" to Backlog');
    expect(describeActivity({ ...base, action: 'card.moved', detail: 'review' })).toBe('Ada moved "Ship it" to In review');
    expect(describeActivity({ ...base, action: 'card.updated', detail: '' })).toBe('Ada edited "Ship it"');
    expect(describeActivity({ ...base, action: 'card.deleted', detail: '' })).toBe('Ada deleted "Ship it"');
  });
});

describe('parseClientMessage', () => {
  it('accepts well formed frames and trims text', () => {
    expect(parseClientMessage({ type: 'card_create', title: ' Hi ', content: 'x', column: 'done' })).toEqual({
      type: 'card_create',
      title: 'Hi',
      content: 'x',
      column: 'done',
    });
    expect(parseClientMessage({ type: 'heartbeat' })).toEqual({ type: 'heartbeat' });
  });

  it('defaults a missing color and column', () => {
    expect(parseClientMessage({ type: 'join_board', board_id: 'b', user_name: 'Ada', color: 'red' })).toMatchObject({ color: '#0b6bcb' });
    expect(parseClientMessage({ type: 'card_create', title: 'x' })).toMatchObject({ column: 'backlog', content: '' });
  });

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['null', null],
    ['unknown type', { type: 'explode' }],
    ['bad column', { type: 'card_move', id: 'a', column: 'later', index: 0, version: 1 }],
    ['negative index', { type: 'card_move', id: 'a', column: 'done', index: -1, version: 1 }],
    ['fractional index', { type: 'card_move', id: 'a', column: 'done', index: 0.5, version: 1 }],
    ['bad version', { type: 'card_update', id: 'a', title: 't', content: '', version: 'one' }],
    ['missing id', { type: 'card_delete' }],
    ['long id', { type: 'card_lock', id: 'x'.repeat(65) }],
    ['blank name', { type: 'join_board', board_id: 'b', user_name: '  ', color: '#112233' }],
    ['non-string title', { type: 'card_create', title: 5, content: '', column: 'done' }],
  ])('rejects %s', (_label, frame) => {
    expect(() => parseClientMessage(frame)).toThrow(SyncError);
  });
});

describe('nextCollaboratorFrames', () => {
  it('locks, moves one column on, then unlocks, deterministically', () => {
    let cards = board();
    const lock = nextCollaboratorFrames('Mira', 0, cards);
    expect(lock).toEqual(nextCollaboratorFrames('Mira', 0, cards));
    expect(lock[0].type).toBe('card_lock');
    const id = (lock[0] as { id: string }).id;
    cards = cards.map((c) => (c.id === id ? { ...c, locked_by: 'Mira' } : c));
    const before = cards.find((c) => c.id === id)!;
    const move = nextCollaboratorFrames('Mira', 1, cards)[0];
    expect(move).toMatchObject({ type: 'card_move', id, index: 0 });
    expect((move as { column: string }).column).not.toBe(before.column);
    expect(nextCollaboratorFrames('Mira', 2, cards)).toEqual([{ type: 'card_unlock', id }]);
  });

  it('does nothing when it holds no card mid-script or every card is locked', () => {
    expect(nextCollaboratorFrames('Mira', 1, board())).toEqual([]);
    expect(nextCollaboratorFrames('Mira', 0, board().map((c) => ({ ...c, locked_by: 'X' })))).toEqual([]);
  });
});
