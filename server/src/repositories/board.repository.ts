import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { Board, CreateBoardDto } from '../../../shared/types.js';

export class BoardRepository {
  constructor(private db: DatabaseSync) {}

  listBoards(): Board[] {
    const stmt = this.db.prepare('SELECT * FROM boards ORDER BY created_at DESC;');
    const rows = stmt.all() as any[];

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  getBoardById(id: string): Board | null {
    const stmt = this.db.prepare('SELECT * FROM boards WHERE id = ?;');
    const r = stmt.get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  createBoard(dto: CreateBoardDto): Board {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO boards (id, title, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?);
    `);

    stmt.run(id, dto.title, dto.description || '', nowIso, nowIso);
    return this.getBoardById(id)!;
  }
}
