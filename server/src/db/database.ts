import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Opens the SQLite file. Order of precedence: the `dbPath` argument, the
 * SYNCBOARD_DB environment variable, then `data/syncboard.db` under the
 * current working directory. Pass ':memory:' for a throwaway database.
 */
export function createDatabase(dbPath?: string): DatabaseSync {
  const finalPath = dbPath ?? process.env.SYNCBOARD_DB ?? path.resolve(process.cwd(), 'data', 'syncboard.db');

  if (finalPath !== ':memory:') {
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  }

  const db = new DatabaseSync(finalPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  return db;
}
