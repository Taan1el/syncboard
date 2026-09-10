import { DatabaseSync } from 'node:sqlite';

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#bae6fd',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL DEFAULT 220,
      height REAL NOT NULL DEFAULT 140,
      version INTEGER NOT NULL DEFAULT 1,
      locked_by TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id);

    CREATE TABLE IF NOT EXISTS mutation_audit (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      card_id TEXT,
      action TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mutations_board ON mutation_audit(board_id, created_at DESC);
  `);
}
