import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import type { OpResult } from '../../../shared/board.js';
import type { Store } from '../../../shared/hub.js';
import type { ActivityEntry, Board, CanvasCard, ColumnId } from '../../../shared/types.js';

type Row = Record<string, string | number | null>;

function toCard(r: Row): CanvasCard {
  return {
    id: String(r.id),
    board_id: String(r.board_id),
    title: String(r.title),
    content: String(r.content),
    column: String(r.column_id) as ColumnId,
    position: Number(r.position),
    version: Number(r.version),
    locked_by: r.locked_by === null ? null : String(r.locked_by),
    updated_by: String(r.updated_by),
    updated_at: String(r.updated_at),
  };
}

function toActivity(r: Row): ActivityEntry {
  return {
    id: String(r.id),
    board_id: String(r.board_id),
    card_id: r.card_id === null ? null : String(r.card_id),
    action: String(r.action) as ActivityEntry['action'],
    actor_name: String(r.actor_name),
    card_title: String(r.card_title),
    detail: String(r.detail),
    created_at: String(r.created_at),
  };
}

/** SQLite-backed Store: one transaction per operation. */
export class SqliteStore implements Store {
  constructor(private db: DatabaseSync) {}

  getBoard(id: string): Board | null {
    const r = this.db.prepare('SELECT * FROM boards WHERE id = ?;').get(id) as Board | undefined;
    return r ? { ...r } : null;
  }

  listCards(boardId: string): CanvasCard[] {
    const rows = this.db
      .prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY column_id, position;')
      .all(boardId) as Row[];
    return rows.map(toCard);
  }

  commit(boardId: string, result: OpResult, actor: string, now: string): ActivityEntry | null {
    this.db.exec('BEGIN;');
    try {
      const upsert = this.db.prepare(`
        INSERT INTO cards (id, board_id, title, content, column_id, position, version, locked_by, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title, content = excluded.content, column_id = excluded.column_id,
          position = excluded.position, version = excluded.version, locked_by = excluded.locked_by,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at;
      `);
      for (const c of result.changed) {
        upsert.run(c.id, c.board_id, c.title, c.content, c.column, c.position, c.version, c.locked_by, c.updated_by, c.updated_at);
      }
      const del = this.db.prepare('DELETE FROM cards WHERE id = ?;');
      for (const id of result.removed) del.run(id);

      let entry: ActivityEntry | null = null;
      if (result.audit) {
        entry = {
          id: crypto.randomUUID(),
          board_id: boardId,
          card_id: result.audit.card_id,
          action: result.audit.action,
          actor_name: actor,
          card_title: result.audit.card_title,
          detail: result.audit.detail,
          created_at: now,
        };
        this.db
          .prepare(
            `INSERT INTO mutation_audit (id, board_id, card_id, action, actor_name, card_title, detail, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`
          )
          .run(entry.id, boardId, entry.card_id, entry.action, actor, entry.card_title, entry.detail, now);
      }
      this.db.exec('COMMIT;');
      return entry;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  listActivity(boardId: string, limit: number): ActivityEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM mutation_audit WHERE board_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?;')
      .all(boardId, limit) as Row[];
    return rows.map(toActivity);
  }

  clearLocks(): void {
    this.db.exec('UPDATE cards SET locked_by = NULL WHERE locked_by IS NOT NULL;');
  }

  countCards(boardId?: string): number {
    const r = boardId
      ? this.db.prepare('SELECT COUNT(*) AS c FROM cards WHERE board_id = ?;').get(boardId)
      : this.db.prepare('SELECT COUNT(*) AS c FROM cards;').get();
    return Number((r as Row).c);
  }

  countMutations(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS c FROM mutation_audit;').get() as Row).c);
  }
}
