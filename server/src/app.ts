import express, { Express } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './db/database.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { BoardRepository } from './repositories/board.repository.js';
import { CardRepository } from './repositories/card.repository.js';
import { BoardService } from './services/board.service.js';
import { BoardController } from './controllers/board.controller.js';
import { createApiRouter } from './routes/api.routes.js';

export interface AppContext {
  app: Express;
  db: DatabaseSync;
  boardRepo: BoardRepository;
  cardRepo: CardRepository;
  boardService: BoardService;
  boardController: BoardController;
}

export function createApp(dbPath?: string, shouldSeed = true): AppContext {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const db = createDatabase(dbPath);
  initializeSchema(db);
  if (shouldSeed) {
    seedDatabase(db);
  }

  // Repositories & Services
  const boardRepo = new BoardRepository(db);
  const cardRepo = new CardRepository(db);
  const boardService = new BoardService(boardRepo, cardRepo);
  const boardController = new BoardController(boardService);

  // Mount API
  app.use('/api', createApiRouter(boardController));

  // Serve client bundle in production
  const candidateDistPaths = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
  ];
  const clientDist = candidateDistPaths.find((p) => fs.existsSync(p));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  return {
    app,
    db,
    boardRepo,
    cardRepo,
    boardService,
    boardController,
  };
}
