import { Router } from 'express';
import { BoardController } from '../controllers/board.controller.js';

export function createApiRouter(boardController: BoardController): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  router.get('/boards', boardController.list);
  router.post('/boards', boardController.create);
  router.get('/boards/:id', boardController.getById);
  router.get('/boards/:id/cards', boardController.listCards);
  router.post('/boards/:id/cards', boardController.createCard);
  router.get('/boards/:id/activity', boardController.listActivity);
  router.get('/metrics', boardController.getMetrics);

  // Unknown API paths answer in JSON instead of falling through to the client bundle.
  router.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  return router;
}
