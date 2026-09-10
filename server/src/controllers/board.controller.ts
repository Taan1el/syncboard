import { Request, Response } from 'express';
import { BoardService } from '../services/board.service.js';
import { WebSocketService } from '../services/websocket.service.js';

export class BoardController {
  constructor(
    private boardService: BoardService,
    private wsService?: WebSocketService
  ) {}

  list = (_req: Request, res: Response): void => {
    try {
      const boards = this.boardService.listBoards();
      res.json({ success: true, data: boards });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  getById = (req: Request, res: Response): void => {
    try {
      const board = this.boardService.getBoardById(req.params.id);
      if (!board) {
        res.status(404).json({ success: false, error: 'Board not found' });
        return;
      }
      res.json({ success: true, data: board });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  create = (req: Request, res: Response): void => {
    try {
      const { title, description } = req.body;
      if (!title) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }
      const board = this.boardService.createBoard({ title, description });
      res.status(201).json({ success: true, data: board });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  listCards = (req: Request, res: Response): void => {
    try {
      const cards = this.boardService.listCardsByBoard(req.params.id);
      res.json({ success: true, data: cards });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  createCard = (req: Request, res: Response): void => {
    try {
      const { title, content, color, x, y, updated_by } = req.body;
      if (!title || !content) {
        res.status(400).json({ success: false, error: 'title and content are required' });
        return;
      }

      const card = this.boardService.createCard({
        board_id: req.params.id,
        title,
        content,
        color,
        x: x ?? 100,
        y: y ?? 100,
        updated_by: updated_by || 'Anonymous',
      });

      if (this.wsService) {
        this.wsService.broadcastToBoard(req.params.id, {
          type: 'card_created',
          card,
        });
      }

      res.status(201).json({ success: true, data: card });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  getMetrics = (_req: Request, res: Response): void => {
    try {
      const activeConnections = this.wsService ? this.wsService.getActiveConnectionCount() : 0;
      const metrics = this.boardService.getMetrics(activeConnections);
      res.json({ success: true, data: metrics });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
