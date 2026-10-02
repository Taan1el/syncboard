import { COLUMNS } from '../../../shared/types';
import type { CanvasCard, ColumnId } from '../../../shared/types';
import { cardsInColumn } from '../../../shared/board';

export type MoveKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export interface MoveTarget {
  column: ColumnId;
  index: number;
}

/**
 * Where an arrow key sends a card, or null when it is already at the edge.
 * Up and down reorder inside the column, left and right jump to the next
 * column and keep the row position where possible.
 */
export function planKeyMove(cards: CanvasCard[], id: string, key: MoveKey): MoveTarget | null {
  const card = cards.find((c) => c.id === id);
  if (!card) return null;
  const list = cardsInColumn(cards, card.column);
  const index = list.findIndex((c) => c.id === id);

  if (key === 'ArrowUp') return index > 0 ? { column: card.column, index: index - 1 } : null;
  if (key === 'ArrowDown') return index < list.length - 1 ? { column: card.column, index: index + 1 } : null;

  const at = COLUMNS.findIndex((c) => c.id === card.column);
  const next = COLUMNS[at + (key === 'ArrowRight' ? 1 : -1)];
  if (!next) return null;
  const size = cardsInColumn(cards, next.id).length;
  return { column: next.id, index: Math.min(index, size) };
}

/**
 * Target for a card dropped on the row `overId`, before or after it. Indexes
 * count the column without the dragged card, which is what a move expects.
 */
export function dropTarget(cards: CanvasCard[], dragId: string, overId: string, after: boolean): MoveTarget | null {
  const over = cards.find((c) => c.id === overId);
  if (!over) return null;
  const rest = cardsInColumn(
    cards.filter((c) => c.id !== dragId),
    over.column
  );
  const at = rest.findIndex((c) => c.id === overId);
  if (at < 0) return null;
  return { column: over.column, index: at + (after ? 1 : 0) };
}
