import express, { Express } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './db/database.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { BoardRepository } from './repositories/board.repository.js';
import { SqliteStore } from './repositories/sqlite-store.js';
import { BoardService } from './services/board.service.js';
import { BoardController } from './controllers/board.controller.js';
import type { Publisher } from './controllers/board.controller.js';
import { createApiRouter } from './routes/api.routes.js';
import { Hub } from '../../shared/hub.js';
import type { Delivery } from '../../shared/hub.js';

export interface AppContext {
  app: Express;
  db: DatabaseSync;
  store: SqliteStore;
  hub: Hub;
  boardService: BoardService;
  /** The WebSocket layer sets `publish` so REST writes reach connected clients. */
  publisher: Publisher;
}

export interface AppOptions {
  /** SQLite file, ':memory:' for a throwaway database. Defaults to SYNCBOARD_DB or data/syncboard.db. */
  dbPath?: string;
  seed?: boolean;
  /** Directory with the built client. Defaults to client/dist next to the working directory. */
  clientDist?: string;
}

export function createApp(options: AppOptions = {}): AppContext {
  const { dbPath, seed = true } = options;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const db = createDatabase(dbPath);
  initializeSchema(db);
  if (seed) seedDatabase(db);

  const boards = new BoardRepository(db);
  const store = new SqliteStore(db);
  const hub = new Hub(store);
  const boardService = new BoardService(boards, store, hub);
  const publisher: Publisher = { publish: (_d: Delivery[]) => {} };
  const controller = new BoardController(boardService, publisher);

  app.use('/api', createApiRouter(controller));

  const candidates = [
    options.clientDist,
    process.env.CLIENT_DIST,
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
  ].filter((p): p is string => Boolean(p));
  const clientDist = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Malformed JSON bodies and anything else Express raises end up here.
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.status && err.status >= 400 && err.status < 500) {
      res.status(err.status).json({ success: false, error: 'Invalid request body' });
      return;
    }
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  });

  return { app, db, store, hub, boardService, publisher };
}
