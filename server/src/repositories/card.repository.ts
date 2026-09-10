import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { CanvasCard } from '../../../shared/types.js';

export class CardRepository {
  constructor(private db: DatabaseSync) {}

  listCardsByBoard(boardId: string): CanvasCard[] {
    const stmt = this.db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY updated_at ASC;');
    const rows = stmt.all(boardId) as any[];

    return rows.map((r) => ({
      id: r.id,
      board_id: r.board_id,
      title: r.title,
      content: r.content,
      color: r.color,
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width),
      height: Number(r.height),
      version: Number(r.version),
      locked_by: r.locked_by ?? null,
      updated_by: r.updated_by,
      updated_at: r.updated_at,
    }));
  }

  getCardById(id: string): CanvasCard | null {
    const stmt = this.db.prepare('SELECT * FROM cards WHERE id = ?;');
    const r = stmt.get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      board_id: r.board_id,
      title: r.title,
      content: r.content,
      color: r.color,
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width),
      height: Number(r.height),
      version: Number(r.version),
      locked_by: r.locked_by ?? null,
      updated_by: r.updated_by,
      updated_at: r.updated_at,
    };
  }

  createCard(data: {
    board_id: string;
    title: string;
    content: string;
    color?: string;
    x: number;
    y: number;
    updated_by: string;
  }): CanvasCard {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const color = data.color || '#bae6fd';

    const stmt = this.db.prepare(`
      INSERT INTO cards (
        id, board_id, title, content, color, x, y, width, height, version, locked_by, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 240, 150, 1, NULL, ?, ?);
    `);

    stmt.run(id, data.board_id, data.title, data.content, color, data.x, data.y, data.updated_by, nowIso);
    return this.getCardById(id)!;
  }

  updatePosition(id: string, x: number, y: number, nextVersion: number, updatedBy: string): CanvasCard {
    const nowIso = new Date().toISOString();
    this.db.prepare(`
      UPDATE cards
      SET x = ?, y = ?, version = ?, updated_by = ?, updated_at = ?
      WHERE id = ?;
    `).run(x, y, nextVersion, updatedBy, nowIso, id);

    return this.getCardById(id)!;
  }

  updateContent(
    id: string,
    title: string,
    content: string,
    color: string | undefined,
    nextVersion: number,
    updatedBy: string
  ): CanvasCard {
    const nowIso = new Date().toISOString();
    if (color) {
      this.db.prepare(`
        UPDATE cards
        SET title = ?, content = ?, color = ?, version = ?, updated_by = ?, updated_at = ?
        WHERE id = ?;
      `).run(title, content, color, nextVersion, updatedBy, nowIso, id);
    } else {
      this.db.prepare(`
        UPDATE cards
        SET title = ?, content = ?, version = ?, updated_by = ?, updated_at = ?
        WHERE id = ?;
      `).run(title, content, nextVersion, updatedBy, nowIso, id);
    }

    return this.getCardById(id)!;
  }

  setLock(id: string, lockedBy: string | null): CanvasCard {
    const nowIso = new Date().toISOString();
    this.db.prepare(`
      UPDATE cards
      SET locked_by = ?, updated_at = ?
      WHERE id = ?;
    `).run(lockedBy, nowIso, id);

    return this.getCardById(id)!;
  }

  deleteCard(id: string): boolean {
    const info = this.db.prepare('DELETE FROM cards WHERE id = ?;').run(id);
    return info.changes > 0;
  }

  recordMutation(boardId: string, cardId: string | null, action: string, actorName: string): void {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO mutation_audit (id, board_id, card_id, action, actor_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run(id, boardId, cardId ?? null, action, actorName, nowIso);
  }

  getMetrics(): { total_boards: number; total_cards: number; total_mutations: number } {
    const bCount = (this.db.prepare('SELECT COUNT(*) as c FROM boards;').get() as any)?.c || 0;
    const cCount = (this.db.prepare('SELECT COUNT(*) as c FROM cards;').get() as any)?.c || 0;
    const mCount = (this.db.prepare('SELECT COUNT(*) as c FROM mutation_audit;').get() as any)?.c || 0;

    return {
      total_boards: Number(bCount),
      total_cards: Number(cCount),
      total_mutations: Number(mCount),
    };
  }
}
