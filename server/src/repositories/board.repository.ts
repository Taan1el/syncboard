import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import type { Board, CreateBoardDto } from '../../../shared/types.js';

export class BoardRepository {
  constructor(private db: DatabaseSync) {}

  listBoards(): Board[] {
    const rows = this.db.prepare('SELECT * FROM boards ORDER BY created_at ASC, rowid ASC;').all() as unknown as Board[];
    return rows.map((r) => ({ ...r }));
  }

  getBoardById(id: string): Board | null {
    const r = this.db.prepare('SELECT * FROM boards WHERE id = ?;').get(id) as Board | undefined;
    return r ? { ...r } : null;
  }

  createBoard(dto: { title: string; description: string }): Board {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO boards (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?);')
      .run(id, dto.title, dto.description, now, now);
    return this.getBoardById(id)!;
  }
}

export type { CreateBoardDto };
