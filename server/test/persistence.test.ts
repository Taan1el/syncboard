import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db/database.js';
import { initializeSchema, SCHEMA_VERSION } from '../src/db/schema.js';
import { DEFAULT_BOARD_ID } from '../../shared/sample.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncboard-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const join = (ctx: ReturnType<typeof createApp>, id: string, name: string) => {
  ctx.hub.connect(id);
  ctx.hub.receive(id, { type: 'join_board', board_id: DEFAULT_BOARD_ID, user_name: name, color: '#112233' });
};

describe('restart behaviour', () => {
  it('keeps cards, order and activity after the server restarts', () => {
    const file = path.join(dir, 'board.db');
    const first = createApp({ dbPath: file });
    join(first, 's1', 'Ada');
    first.hub.receive('s1', { type: 'card_create', title: 'Survives', content: '', column: 'done' });
    first.hub.receive('s1', { type: 'card_move', id: 'rel-1', column: 'done', index: 0, version: 1 });
    first.db.close();

    const second = createApp({ dbPath: file });
    const cards = second.store.listCards(DEFAULT_BOARD_ID);
    const done = cards.filter((c) => c.column === 'done').sort((a, b) => a.position - b.position);
    expect(done.map((c) => c.title)).toEqual(['Write the changelog', 'Persist boards in SQLite', 'Validate every frame', 'Survives']);
    expect(second.store.listActivity(DEFAULT_BOARD_ID, 2).map((a) => a.action)).toEqual(['card.moved', 'card.created']);
    expect(second.boardService.listBoards()).toHaveLength(2);
    second.db.close();
  });

  it('clears locks on restart because no connection survives it', () => {
    const file = path.join(dir, 'locks.db');
    const first = createApp({ dbPath: file });
    join(first, 's1', 'Ada');
    first.hub.receive('s1', { type: 'card_lock', id: 'rel-1' });
    expect(first.store.listCards(DEFAULT_BOARD_ID).some((c) => c.locked_by === 'Ada')).toBe(true);
    first.db.close();

    const second = createApp({ dbPath: file });
    expect(second.store.listCards(DEFAULT_BOARD_ID).some((c) => c.locked_by)).toBe(false);
    second.db.close();
  });

  it('does not seed twice', () => {
    const file = path.join(dir, 'seed.db');
    createApp({ dbPath: file }).db.close();
    const again = createApp({ dbPath: file });
    expect(again.boardService.listBoards()).toHaveLength(2);
    again.db.close();
  });
});

describe('database file', () => {
  it('uses WAL mode and enforces foreign keys', () => {
    const db = createDatabase(path.join(dir, 'wal.db'));
    initializeSchema(db);
    expect((db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string }).journal_mode).toBe('wal');
    expect(() =>
      db.prepare("INSERT INTO cards (id, board_id, title, content, column_id, position, updated_by, updated_at) VALUES ('c','nope','t','','backlog',0,'a','now');").run()
    ).toThrow();
    db.close();
  });

  it('creates missing parent directories and honours SYNCBOARD_DB', () => {
    const target = path.join(dir, 'nested', 'deeper', 'env.db');
    process.env.SYNCBOARD_DB = target;
    try {
      createDatabase().close();
    } finally {
      delete process.env.SYNCBOARD_DB;
    }
    expect(fs.existsSync(target)).toBe(true);
  });

  it('rebuilds a database created by the free-form canvas version', () => {
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE boards (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, color TEXT, x REAL, y REAL, width REAL, height REAL, version INTEGER, locked_by TEXT, updated_by TEXT, updated_at TEXT);
      INSERT INTO boards VALUES ('board-default', 'Old', '', 'now', 'now');
    `);
    old.close();

    const ctx = createApp({ dbPath: file });
    expect(ctx.boardService.listBoards().map((b) => b.id)).toEqual(['board-release', 'board-docs']);
    expect((ctx.db.prepare('PRAGMA user_version;').get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
    ctx.db.close();
  });
});
