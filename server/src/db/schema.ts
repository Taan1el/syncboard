import { DatabaseSync } from 'node:sqlite';

/** Bumped whenever a table changes shape. Stored in PRAGMA user_version. */
export const SCHEMA_VERSION = 2;

export function initializeSchema(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  if (row.user_version < SCHEMA_VERSION) {
    // Version 1 stored free-form x/y canvas cards. Cards are now kanban rows,
    // so the old tables are dropped and the sample boards are seeded again.
    db.exec('DROP TABLE IF EXISTS mutation_audit; DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS boards;');
  }

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
      column_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      locked_by TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id, column_id, position);

    CREATE TABLE IF NOT EXISTS mutation_audit (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      card_id TEXT,
      action TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      card_title TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mutations_board ON mutation_audit(board_id, created_at DESC);
  `);

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}
