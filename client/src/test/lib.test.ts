import { describe, expect, it } from 'vitest';
import { formatCount, formatTime, initials, pluralize } from '../lib/format';
import { dropTarget, planKeyMove } from '../lib/move';
import { boardReducer, emptyState } from '../lib/state';
import { cardsInColumn } from '../../../shared/board';
import { sampleActivity, sampleBoards, sampleCards, DEFAULT_BOARD_ID } from '../../../shared/sample';
import type { ServerWsMessage } from '../../../shared/types';

const release = () => sampleCards().filter((c) => c.board_id === DEFAULT_BOARD_ID);

describe('format helpers', () => {
  it('pluralizes by count', () => {
    expect(pluralize(0, 'card')).toBe('cards');
    expect(pluralize(1, 'card')).toBe('card');
    expect(pluralize(2, 'card')).toBe('cards');
    expect(formatCount(1, 'person', 'people')).toBe('1 person');
    expect(formatCount(3, 'person', 'people')).toBe('3 people');
  });

  it('builds initials from one or more words', () => {
    expect(initials('mari')).toBe('M');
    expect(initials('Mari Tamm')).toBe('MT');
    expect(initials('Jan van der Berg')).toBe('JB');
    expect(initials('   ')).toBe('?');
  });

  it('formats times in UTC', () => {
    expect(formatTime('2026-10-01T09:42:00.000Z')).toBe('09:42');
    expect(formatTime('nonsense')).toBe('--:--');
  });
});

describe('planKeyMove', () => {
  it('reorders inside a column', () => {
    const cards = release();
    expect(planKeyMove(cards, 'rel-2', 'ArrowUp')).toEqual({ column: 'backlog', index: 0 });
    expect(planKeyMove(cards, 'rel-2', 'ArrowDown')).toEqual({ column: 'backlog', index: 2 });
  });

  it('stops at the edges', () => {
    const cards = release();
    expect(planKeyMove(cards, 'rel-1', 'ArrowUp')).toBeNull();
    expect(planKeyMove(cards, 'rel-3', 'ArrowDown')).toBeNull();
    expect(planKeyMove(cards, 'rel-1', 'ArrowLeft')).toBeNull();
    expect(planKeyMove(cards, 'rel-8', 'ArrowRight')).toBeNull();
    expect(planKeyMove(cards, 'missing', 'ArrowRight')).toBeNull();
  });

  it('keeps the row position when jumping columns and clamps it to the end', () => {
    const cards = release();
    expect(planKeyMove(cards, 'rel-2', 'ArrowRight')).toEqual({ column: 'doing', index: 1 });
    expect(planKeyMove(cards, 'rel-3', 'ArrowRight')).toEqual({ column: 'doing', index: 2 });
  });
});

describe('dropTarget', () => {
  it('counts the target column without the dragged card', () => {
    const cards = release();
    // rel-1 is first in backlog; dropping it after rel-3 puts it last.
    expect(dropTarget(cards, 'rel-1', 'rel-3', true)).toEqual({ column: 'backlog', index: 2 });
    expect(dropTarget(cards, 'rel-1', 'rel-2', false)).toEqual({ column: 'backlog', index: 0 });
    expect(dropTarget(cards, 'rel-1', 'rel-4', false)).toEqual({ column: 'doing', index: 0 });
    expect(dropTarget(cards, 'rel-1', 'nope', false)).toBeNull();
  });
});

describe('boardReducer', () => {
  const sync: ServerWsMessage = {
    type: 'board_sync',
    board: sampleBoards()[0],
    cards: release(),
    presences: [],
    activity: sampleActivity(),
    client_id: 'c1',
    user_name: 'You',
  };

  it('replaces everything on board_sync', () => {
    const s = boardReducer(emptyState, { kind: 'server', msg: sync });
    expect(s.cards).toHaveLength(9);
    expect(s.userName).toBe('You');
    expect(s.activity).toHaveLength(3);
  });

  it('applies a local move before the server confirms it, and the confirmation is harmless', () => {
    let s = boardReducer(emptyState, { kind: 'server', msg: sync });
    s = boardReducer(s, { kind: 'move', id: 'rel-1', column: 'done', index: 0 });
    expect(cardsInColumn(s.cards, 'done')[0].id).toBe('rel-1');
    const confirm: ServerWsMessage = {
      type: 'card_moved',
      id: 'rel-1',
      column: 'done',
      index: 0,
      version: 2,
      updated_by: 'You',
      updated_at: '2026-10-01T10:00:00.000Z',
    };
    const after = boardReducer(s, { kind: 'server', msg: confirm });
    expect(cardsInColumn(after.cards, 'done').map((c) => c.id)).toEqual(cardsInColumn(s.cards, 'done').map((c) => c.id));
    expect(after.cards.find((c) => c.id === 'rel-1')?.version).toBe(2);
  });

  it('puts new activity first, skips duplicates and keeps 30 entries', () => {
    let s = boardReducer(emptyState, { kind: 'server', msg: sync });
    const entry = { ...sampleActivity()[0], id: 'new-1' };
    s = boardReducer(s, { kind: 'server', msg: { type: 'activity', entry } });
    s = boardReducer(s, { kind: 'server', msg: { type: 'activity', entry } });
    expect(s.activity[0].id).toBe('new-1');
    expect(s.activity).toHaveLength(4);
    for (let i = 0; i < 40; i++) {
      s = boardReducer(s, { kind: 'server', msg: { type: 'activity', entry: { ...entry, id: `bulk-${i}` } } });
    }
    expect(s.activity).toHaveLength(30);
  });

  it('removes deleted cards and tracks locks', () => {
    let s = boardReducer(emptyState, { kind: 'server', msg: sync });
    s = boardReducer(s, { kind: 'server', msg: { type: 'card_locked', id: 'rel-2', locked_by: 'Mari' } });
    expect(s.cards.find((c) => c.id === 'rel-2')?.locked_by).toBe('Mari');
    s = boardReducer(s, { kind: 'server', msg: { type: 'card_deleted', id: 'rel-2' } });
    expect(s.cards.some((c) => c.id === 'rel-2')).toBe(false);
    expect(cardsInColumn(s.cards, 'backlog').map((c) => c.position)).toEqual([0, 1]);
  });
});
