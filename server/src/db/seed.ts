import { DatabaseSync } from 'node:sqlite';
import { sampleActivity, sampleBoards, sampleCards } from '../../../shared/sample.js';

/** Fills an empty database with the same sample boards the browser demo uses. */
export function seedDatabase(db: DatabaseSync): void {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM boards;').get() as { count: number };
  if (count > 0) return;

  const insertBoard = db.prepare(
    'INSERT INTO boards (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?);'
  );
  for (const b of sampleBoards()) {
    insertBoard.run(b.id, b.title, b.description, b.created_at, b.updated_at);
  }

  const insertCard = db.prepare(`
    INSERT INTO cards (id, board_id, title, content, column_id, position, version, locked_by, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);
  `);
  for (const c of sampleCards()) {
    insertCard.run(c.id, c.board_id, c.title, c.content, c.column, c.position, c.version, c.updated_by, c.updated_at);
  }

  const insertActivity = db.prepare(`
    INSERT INTO mutation_audit (id, board_id, card_id, action, actor_name, card_title, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);
  for (const a of sampleActivity()) {
    insertActivity.run(a.id, a.board_id, a.card_id, a.action, a.actor_name, a.card_title, a.detail, a.created_at);
  }
}
