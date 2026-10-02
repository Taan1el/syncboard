import type { CanvasCard, ClientWsMessage, ColumnId } from './types.js';
import { COLUMNS } from './types.js';

const ORDER: ColumnId[] = COLUMNS.map((c) => c.id);

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic script for a simulated collaborator. Each call is one tick:
 * pick a free card and lock it, move it one column on, release it. Given the
 * same name, step and cards it always returns the same frames.
 */
export function nextCollaboratorFrames(name: string, step: number, cards: CanvasCard[]): ClientWsMessage[] {
  const phase = step % 3;
  const holding = cards.filter((c) => c.locked_by === name);

  if (phase === 0) {
    if (holding.length > 0) return [{ type: 'card_unlock', id: holding[0].id }];
    const free = cards.filter((c) => !c.locked_by).sort((a, b) => a.id.localeCompare(b.id));
    if (free.length === 0) return [];
    const pick = free[(hash(name) + step * 7) % free.length];
    return [{ type: 'card_lock', id: pick.id }];
  }

  const card = holding[0];
  if (!card) return [];
  if (phase === 1) {
    const next = ORDER[(ORDER.indexOf(card.column) + 1) % ORDER.length];
    return [{ type: 'card_move', id: card.id, column: next, index: 0, version: card.version }];
  }
  return [{ type: 'card_unlock', id: card.id }];
}
