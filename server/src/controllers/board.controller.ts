import type { Request, Response } from 'express';
import { BoardService, NotFoundError } from '../services/board.service.js';
import type { Delivery } from '../../../shared/hub.js';
import { SyncError } from '../../../shared/validate.js';

/** Lets REST handlers push frames to WebSocket clients once the socket layer exists. */
export interface Publisher {
  publish: (deliveries: Delivery[]) => void;
}

export class BoardController {
  constructor(
    private service: BoardService,
    private publisher: Publisher
  ) {}

  private fail(res: Response, err: unknown): void {
    if (err instanceof NotFoundError) {
      res.status(404).json({ success: false, error: err.message });
    } else if (err instanceof SyncError) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      console.error('Unhandled API error:', err);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  list = (_req: Request, res: Response): void => {
    res.json({ success: true, data: this.service.listBoards() });
  };

  getById = (req: Request, res: Response): void => {
    try {
      res.json({ success: true, data: this.service.getBoard(req.params.id) });
    } catch (err) {
      this.fail(res, err);
    }
  };

  create = (req: Request, res: Response): void => {
    try {
      const board = this.service.createBoard(req.body ?? {});
      res.status(201).json({ success: true, data: board });
    } catch (err) {
      this.fail(res, err);
    }
  };

  listCards = (req: Request, res: Response): void => {
    try {
      res.json({ success: true, data: this.service.listCards(req.params.id) });
    } catch (err) {
      this.fail(res, err);
    }
  };

  createCard = (req: Request, res: Response): void => {
    try {
      const { card, deliveries } = this.service.createCard(req.params.id, req.body ?? {});
      this.publisher.publish(deliveries);
      res.status(201).json({ success: true, data: card });
    } catch (err) {
      this.fail(res, err);
    }
  };

  listActivity = (req: Request, res: Response): void => {
    try {
      const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
      if (limit !== undefined && !Number.isInteger(limit)) {
        throw new SyncError('limit must be an integer');
      }
      res.json({ success: true, data: this.service.listActivity(req.params.id, limit) });
    } catch (err) {
      this.fail(res, err);
    }
  };

  getMetrics = (_req: Request, res: Response): void => {
    res.json({ success: true, data: this.service.getMetrics() });
  };
}
