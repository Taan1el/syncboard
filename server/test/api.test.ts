import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { WebSocketService } from '../src/services/websocket.service.js';

describe('SyncBoard Real-Time State Synchronization Engine', () => {
  let app: any;
  let boardService: any;
  let server: http.Server;
  let port: number;
  let wss: WebSocketServer;

  beforeEach(async () => {
    const context = createApp(':memory:', true);
    app = context.app;
    boardService = context.boardService;

    server = http.createServer(app);
    wss = new WebSocketServer({ server, path: '/ws' });
    new WebSocketService(wss, boardService);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('Health check and REST API', () => {
    it('returns healthy status and timestamp', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('lists seeded collaborative boards', async () => {
      const res = await request(app).get('/api/boards');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].title).toContain('Sprint 42');
    });

    it('creates a new collaborative board', async () => {
      const res = await request(app).post('/api/boards').send({
        title: 'Q4 Product Roadmap Canvas',
        description: 'Cross-functional initiatives and system milestones',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Q4 Product Roadmap Canvas');
    });

    it('lists cards belonging to a board', async () => {
      const boardRes = await request(app).get('/api/boards');
      const boardId = boardRes.body.data[0].id;

      const res = await request(app).get(`/api/boards/${boardId}/cards`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
      expect(res.body.data[0]).toHaveProperty('x');
      expect(res.body.data[0]).toHaveProperty('version');
    });

    it('creates a new card via REST endpoint', async () => {
      const boardRes = await request(app).get('/api/boards');
      const boardId = boardRes.body.data[0].id;

      const newCard = {
        title: 'Automated E2E Playwright Suite',
        content: 'Configure headless browser regression tests in GitHub Actions.',
        color: '#fbcfe8',
        x: 120,
        y: 180,
        updated_by: 'QA Lead',
      };

      const res = await request(app).post(`/api/boards/${boardId}/cards`).send(newCard);
      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Automated E2E Playwright Suite');
      expect(res.body.data.version).toBe(1);
    });
  });

  describe('BoardService conflict resolution and card locks', () => {
    it('moves card and increments logical clock version (Last-Write-Wins)', () => {
      const boards = boardService.listBoards();
      const cards = boardService.listCardsByBoard(boards[0].id);
      const card = cards[0];

      const moved = boardService.moveCard(card.id, 450, 320, card.version, 'Sander Sepp');
      expect(moved.x).toBe(450);
      expect(moved.y).toBe(320);
      expect(moved.version).toBe(card.version + 1);
      expect(moved.updated_by).toBe('Sander Sepp');
    });

    it('prevents other users from editing locked cards', () => {
      const boards = boardService.listBoards();
      const cards = boardService.listCardsByBoard(boards[0].id);
      const card = cards[1];

      // Laura locks the card
      boardService.lockCard(card.id, 'Laura Tamm');

      // Erik attempts to move the locked card -> must throw error
      expect(() => {
        boardService.moveCard(card.id, 200, 200, card.version, 'Erik Kallas');
      }).toThrow(/locked for editing by Laura Tamm/);

      // Laura moves her own locked card -> succeeds
      const moved = boardService.moveCard(card.id, 200, 200, card.version, 'Laura Tamm');
      expect(moved.x).toBe(200);

      // Laura unlocks
      boardService.unlockCard(card.id, 'Laura Tamm');

      // Now Erik can move it
      const erikMove = boardService.moveCard(card.id, 220, 220, moved.version, 'Erik Kallas');
      expect(erikMove.x).toBe(220);
    });

    it('deletes card and records audit entry', () => {
      const boards = boardService.listBoards();
      const card = boardService.createCard({
        board_id: boards[0].id,
        title: 'Temporary Scratch Card',
        content: 'To be removed immediately',
        x: 10,
        y: 10,
        updated_by: 'Tester',
      });

      const delResult = boardService.deleteCard(card.id, 'Tester');
      expect(delResult.success).toBe(true);

      const allCards = boardService.listCardsByBoard(boards[0].id);
      expect(allCards.some((c: any) => c.id === card.id)).toBe(false);
    });
  });

  describe('WebSocket Real-Time Synchronization Protocol', () => {
    it('synchronizes board state and presences on join_board', async () => {
      const boards = boardService.listBoards();
      const boardId = boards[0].id;

      const ws = new WebSocket(`ws://localhost:${port}/ws`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'join_board',
              board_id: boardId,
              user_name: 'Collaborator Alice',
              color: '#10b981',
            })
          );
        });

        ws.on('message', (data: string) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'board_sync') {
            expect(msg.board.id).toBe(boardId);
            expect(Array.isArray(msg.cards)).toBe(true);
            expect(msg.cards.length).toBeGreaterThanOrEqual(4);
            expect(msg.presences).toBeDefined();
            ws.close();
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });

    it('broadcasts card movement across connected room peers in real time', async () => {
      const boards = boardService.listBoards();
      const boardId = boards[0].id;
      const initialCards = boardService.listCardsByBoard(boardId);
      const targetCard = initialCards[0];

      const client1 = new WebSocket(`ws://localhost:${port}/ws`);
      const client2 = new WebSocket(`ws://localhost:${port}/ws`);

      // 1. Both join board
      await Promise.all([
        new Promise<void>((res) => {
          client1.on('open', () => {
            client1.send(
              JSON.stringify({ type: 'join_board', board_id: boardId, user_name: 'Peer 1', color: '#38bdf8' })
            );
            res();
          });
        }),
        new Promise<void>((res) => {
          client2.on('open', () => {
            client2.send(
              JSON.stringify({ type: 'join_board', board_id: boardId, user_name: 'Peer 2', color: '#f59e0b' })
            );
            res();
          });
        }),
      ]);

      // Small delay to ensure joined
      await new Promise((r) => setTimeout(r, 60));

      // 2. Client 2 listens for card_moved broadcast from Client 1
      const movePromise = new Promise<void>((resolve) => {
        client2.on('message', (data: string) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'card_moved') {
            expect(msg.id).toBe(targetCard.id);
            expect(msg.x).toBe(550);
            expect(msg.y).toBe(380);
            expect(msg.updated_by).toBe('Peer 1');
            resolve();
          }
        });
      });

      // 3. Client 1 sends card_move
      client1.send(
        JSON.stringify({
          type: 'card_move',
          id: targetCard.id,
          x: 550,
          y: 380,
          version: targetCard.version,
        })
      );

      await movePromise;

      client1.close();
      client2.close();
    });
  });

  describe('Board Metrics & Telemetry', () => {
    it('returns aggregated board mutation KPIs', async () => {
      const res = await request(app).get('/api/metrics');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('total_boards');
      expect(res.body.data).toHaveProperty('total_cards');
      expect(res.body.data).toHaveProperty('total_mutations');
    });
  });
});
