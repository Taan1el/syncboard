import { COLUMNS } from './types.js';
import type { ActivityAction, CanvasCard, ColumnId, ServerWsMessage } from './types.js';
import { SyncError, columnTitle, validateContent, validateTitle } from './validate.js';

/** Cards of one column in display order. */
export function cardsInColumn(cards: CanvasCard[], column: ColumnId): CanvasCard[] {
  return cards.filter((c) => c.column === column).sort((a, b) => a.position - b.position);
}

/** Rewrites positions so every column is numbered 0..n-1 in its current order. */
export function normalize(cards: CanvasCard[]): CanvasCard[] {
  const out: CanvasCard[] = [];
  for (const col of COLUMNS) {
    cardsInColumn(cards, col.id).forEach((c, i) => {
      out.push(c.position === i ? c : { ...c, position: i });
    });
  }
  return out;
}

/**
 * Moves a card to `index` inside `column`. The index is clamped to the end of
 * the column, so a stale index never throws.
 */
export function moveWithin(cards: CanvasCard[], id: string, column: ColumnId, index: number): CanvasCard[] {
  const moving = cards.find((c) => c.id === id);
  if (!moving) return cards;
  const rest = cards.filter((c) => c.id !== id);
  const target = cardsInColumn(rest, column);
  const at = Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, { ...moving, column });
  const others = rest.filter((c) => c.column !== column);
  return normalize([...others, ...target.map((c, i) => ({ ...c, position: i }))]);
}

/**
 * The one state transition used by the server, the in-browser demo and the
 * client. Every message the server broadcasts is applied through this function.
 * Applying the same message twice is harmless, which is what lets the sender
 * apply its own move optimistically and apply the confirmation later.
 */
export function applyServerMessage(cards: CanvasCard[], msg: ServerWsMessage): CanvasCard[] {
  switch (msg.type) {
    case 'board_sync':
      return normalize(msg.cards);
    case 'card_created': {
      if (cards.some((c) => c.id === msg.card.id)) return cards;
      return normalize([...cards, msg.card]);
    }
    case 'card_moved': {
      if (!cards.some((c) => c.id === msg.id)) return cards;
      return moveWithin(cards, msg.id, msg.column, msg.index).map((c) =>
        c.id === msg.id
          ? { ...c, version: msg.version, updated_by: msg.updated_by, updated_at: msg.updated_at }
          : c
      );
    }
    case 'card_updated':
      return cards.map((c) =>
        c.id === msg.card.id ? { ...msg.card, column: c.column, position: c.position } : c
      );
    case 'card_locked':
      return cards.map((c) => (c.id === msg.id ? { ...c, locked_by: msg.locked_by } : c));
    case 'card_unlocked':
      return cards.map((c) => (c.id === msg.id ? { ...c, locked_by: null } : c));
    case 'card_deleted':
      return normalize(cards.filter((c) => c.id !== msg.id));
    default:
      return cards;
  }
}

export type CardOp =
  | { type: 'create'; title: string; content: string; column: ColumnId }
  | { type: 'move'; id: string; column: ColumnId; index: number; version: number }
  | { type: 'update'; id: string; title: string; content: string; version: number }
  | { type: 'lock'; id: string }
  | { type: 'unlock'; id: string }
  | { type: 'delete'; id: string };

export interface OpResult {
  /** Board cards after the operation. */
  cards: CanvasCard[];
  /** Cards whose stored row must be written (new, moved, renumbered or edited). */
  changed: CanvasCard[];
  /** Ids of cards that no longer exist. */
  removed: string[];
  /** The frame to broadcast to everyone on the board. */
  event: ServerWsMessage;
  /** Set when the operation belongs in the activity feed. */
  audit: { action: ActivityAction; card_id: string; card_title: string; detail: string } | null;
}

function find(cards: CanvasCard[], id: string): CanvasCard {
  const card = cards.find((c) => c.id === id);
  if (!card) throw new SyncError(`Card not found: ${id}`);
  return card;
}

function assertNotLockedByOther(card: CanvasCard, actor: string, verb: string): void {
  if (card.locked_by && card.locked_by !== actor) {
    throw new SyncError(`Cannot ${verb} "${card.title}": ${card.locked_by} is editing it`);
  }
}

function changedRows(before: CanvasCard[], after: CanvasCard[]): CanvasCard[] {
  const old = new Map(before.map((c) => [c.id, c]));
  return after.filter((c) => {
    const prev = old.get(c.id);
    return !prev || prev.column !== c.column || prev.position !== c.position || prev.version !== c.version;
  });
}

/**
 * Validates and applies one operation to the cards of a board.
 *
 * Conflict rules: operations are applied in the order they arrive. A move or
 * an edit never fails because the sender's version is old, the later write
 * wins and the version becomes max(stored, sent) + 1. The only thing that
 * rejects an operation is another person's lock.
 */
export function applyOp(
  cards: CanvasCard[],
  op: CardOp,
  actor: string,
  now: string,
  newId: () => string,
  boardId: string
): OpResult {
  switch (op.type) {
    case 'create': {
      const title = validateTitle(op.title);
      const content = validateContent(op.content);
      const card: CanvasCard = {
        id: newId(),
        board_id: boardId,
        title,
        content,
        column: op.column,
        position: cardsInColumn(cards, op.column).length,
        version: 1,
        locked_by: null,
        updated_by: actor,
        updated_at: now,
      };
      return {
        cards: [...cards, card],
        changed: [card],
        removed: [],
        event: { type: 'card_created', card },
        audit: { action: 'card.created', card_id: card.id, card_title: title, detail: op.column },
      };
    }
    case 'move': {
      const current = find(cards, op.id);
      assertNotLockedByOther(current, actor, 'move');
      const version = Math.max(current.version, op.version) + 1;
      const next = moveWithin(cards, op.id, op.column, op.index).map((c) =>
        c.id === op.id ? { ...c, version, updated_by: actor, updated_at: now } : c
      );
      const moved = next.find((c) => c.id === op.id)!;
      return {
        cards: next,
        changed: changedRows(cards, next),
        removed: [],
        event: {
          type: 'card_moved',
          id: op.id,
          column: moved.column,
          index: moved.position,
          version,
          updated_by: actor,
          updated_at: now,
        },
        audit: { action: 'card.moved', card_id: op.id, card_title: current.title, detail: moved.column },
      };
    }
    case 'update': {
      const current = find(cards, op.id);
      assertNotLockedByOther(current, actor, 'edit');
      const title = validateTitle(op.title);
      const content = validateContent(op.content);
      const card: CanvasCard = {
        ...current,
        title,
        content,
        version: Math.max(current.version, op.version) + 1,
        updated_by: actor,
        updated_at: now,
      };
      return {
        cards: cards.map((c) => (c.id === card.id ? card : c)),
        changed: [card],
        removed: [],
        event: { type: 'card_updated', card },
        audit: { action: 'card.updated', card_id: card.id, card_title: title, detail: '' },
      };
    }
    case 'lock': {
      const current = find(cards, op.id);
      if (current.locked_by && current.locked_by !== actor) {
        throw new SyncError(`"${current.title}" is already being edited by ${current.locked_by}`);
      }
      const card = { ...current, locked_by: actor };
      return {
        cards: cards.map((c) => (c.id === card.id ? card : c)),
        changed: [card],
        removed: [],
        event: { type: 'card_locked', id: card.id, locked_by: actor },
        audit: null,
      };
    }
    case 'unlock': {
      const current = find(cards, op.id);
      assertNotLockedByOther(current, actor, 'unlock');
      const card = { ...current, locked_by: null };
      return {
        cards: cards.map((c) => (c.id === card.id ? card : c)),
        changed: [card],
        removed: [],
        event: { type: 'card_unlocked', id: card.id },
        audit: null,
      };
    }
    case 'delete': {
      const current = find(cards, op.id);
      assertNotLockedByOther(current, actor, 'delete');
      const remaining = cards.filter((c) => c.id !== op.id);
      const next = normalize(remaining);
      return {
        cards: next,
        changed: changedRows(remaining, next),
        removed: [op.id],
        event: { type: 'card_deleted', id: op.id },
        audit: { action: 'card.deleted', card_id: op.id, card_title: current.title, detail: '' },
      };
    }
  }
}

/** One-line description of an activity entry, shared by the feed and the tests. */
export function describeActivity(entry: {
  action: ActivityAction;
  actor_name: string;
  card_title: string;
  detail: string;
}): string {
  const title = `"${entry.card_title}"`;
  switch (entry.action) {
    case 'card.created':
      return `${entry.actor_name} added ${title} to ${columnTitle(entry.detail)}`;
    case 'card.moved':
      return `${entry.actor_name} moved ${title} to ${columnTitle(entry.detail)}`;
    case 'card.updated':
      return `${entry.actor_name} edited ${title}`;
    case 'card.deleted':
      return `${entry.actor_name} deleted ${title}`;
  }
}
