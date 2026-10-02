import type { OpResult } from './board.js';
import type { Store } from './hub.js';
import { sampleActivity, sampleBoards, sampleCards } from './sample.js';
import type { ActivityEntry, Board, CanvasCard } from './types.js';

/** In-memory Store used by the browser demo and by tests. */
export class MemoryStore implements Store {
  private boards = new Map<string, Board>();
  private cards = new Map<string, CanvasCard>();
  private activity: ActivityEntry[] = [];
  private counter = 0;

  constructor(seed: { boards: Board[]; cards: CanvasCard[]; activity: ActivityEntry[] } = MemoryStore.sample()) {
    for (const b of seed.boards) this.boards.set(b.id, { ...b });
    for (const c of seed.cards) this.cards.set(c.id, { ...c });
    this.activity = seed.activity.map((a) => ({ ...a }));
  }

  static sample() {
    return { boards: sampleBoards(), cards: sampleCards(), activity: sampleActivity() };
  }

  listBoards(): Board[] {
    return [...this.boards.values()];
  }

  getBoard(id: string): Board | null {
    return this.boards.get(id) ?? null;
  }

  listCards(boardId: string): CanvasCard[] {
    return [...this.cards.values()]
      .filter((c) => c.board_id === boardId)
      .map((c) => ({ ...c }))
      .sort((a, b) => (a.column === b.column ? a.position - b.position : a.column < b.column ? -1 : 1));
  }

  commit(boardId: string, result: OpResult, actor: string, now: string): ActivityEntry | null {
    for (const card of result.changed) this.cards.set(card.id, { ...card });
    for (const id of result.removed) this.cards.delete(id);
    if (!result.audit) return null;
    const entry: ActivityEntry = {
      id: `mem-${++this.counter}`,
      board_id: boardId,
      card_id: result.audit.card_id,
      action: result.audit.action,
      actor_name: actor,
      card_title: result.audit.card_title,
      detail: result.audit.detail,
      created_at: now,
    };
    this.activity.unshift(entry);
    return entry;
  }

  listActivity(boardId: string, limit: number): ActivityEntry[] {
    return this.activity.filter((a) => a.board_id === boardId).slice(0, limit);
  }

  clearLocks(): void {
    for (const c of this.cards.values()) c.locked_by = null;
  }
}
