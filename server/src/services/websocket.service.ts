import { WebSocket, WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { BoardService } from './board.service.js';
import { ClientWsMessage, ServerWsMessage, UserPresence } from '../../../shared/types.js';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  boardId?: string;
  userName?: string;
  color?: string;
  cursorX: number;
  cursorY: number;
  lastSeen: number;
}

export class WebSocketService {
  private clients = new Map<string, ConnectedClient>();

  constructor(
    private wss: WebSocketServer,
    private boardService: BoardService
  ) {
    this.init();
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = crypto.randomUUID();
      const client: ConnectedClient = {
        id: clientId,
        ws,
        cursorX: 0,
        cursorY: 0,
        lastSeen: Date.now(),
      };

      this.clients.set(clientId, client);

      ws.on('message', (raw: string) => {
        try {
          const message: ClientWsMessage = JSON.parse(raw.toString());
          this.handleClientMessage(client, message);
        } catch (err: any) {
          this.send(ws, { type: 'error', message: err.message || 'Invalid JSON format' });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(client);
      });

      ws.on('error', () => {
        this.handleDisconnect(client);
      });
    });
  }

  private handleClientMessage(client: ConnectedClient, msg: ClientWsMessage) {
    client.lastSeen = Date.now();

    switch (msg.type) {
      case 'join_board': {
        client.boardId = msg.board_id;
        client.userName = msg.user_name;
        client.color = msg.color;

        const board = this.boardService.getBoardById(msg.board_id);
        if (!board) {
          this.send(client.ws, { type: 'error', message: `Board not found: ${msg.board_id}` });
          return;
        }

        const cards = this.boardService.listCardsByBoard(msg.board_id);
        const presences = this.getBoardPresences(msg.board_id);

        // 1. Send full initial snapshot to joined client
        this.send(client.ws, {
          type: 'board_sync',
          board,
          cards,
          presences,
          client_id: client.id,
        });

        // 2. Broadcast updated presence roster to other peers in room
        this.broadcastToBoard(client.boardId, {
          type: 'presence_update',
          presences,
        });
        break;
      }

      case 'cursor_move': {
        if (!client.boardId) return;
        client.cursorX = msg.x;
        client.cursorY = msg.y;

        const presences = this.getBoardPresences(client.boardId);
        this.broadcastToBoard(
          client.boardId,
          {
            type: 'presence_update',
            presences,
          },
          client.id
        ); // Skip sender for cursor to reduce noise
        break;
      }

      case 'card_create': {
        if (!client.boardId || !client.userName) return;
        const card = this.boardService.createCard({
          board_id: client.boardId,
          title: msg.title,
          content: msg.content,
          color: msg.color,
          x: msg.x,
          y: msg.y,
          updated_by: client.userName,
        });

        this.broadcastToBoard(client.boardId, {
          type: 'card_created',
          card,
        });
        break;
      }

      case 'card_move': {
        if (!client.boardId || !client.userName) return;
        const updated = this.boardService.moveCard(
          msg.id,
          msg.x,
          msg.y,
          msg.version,
          client.userName
        );

        this.broadcastToBoard(client.boardId, {
          type: 'card_moved',
          id: updated.id,
          x: updated.x,
          y: updated.y,
          version: updated.version,
          updated_by: updated.updated_by,
        });
        break;
      }

      case 'card_update': {
        if (!client.boardId || !client.userName) return;
        const updated = this.boardService.updateCard(
          msg.id,
          msg.title,
          msg.content,
          msg.color,
          msg.version,
          client.userName
        );

        this.broadcastToBoard(client.boardId, {
          type: 'card_updated',
          card: updated,
        });
        break;
      }

      case 'card_lock': {
        if (!client.boardId || !client.userName) return;
        const card = this.boardService.lockCard(msg.id, client.userName);
        this.broadcastToBoard(client.boardId, {
          type: 'card_locked',
          id: card.id,
          locked_by: client.userName,
        });
        break;
      }

      case 'card_unlock': {
        if (!client.boardId || !client.userName) return;
        const card = this.boardService.unlockCard(msg.id, client.userName);
        this.broadcastToBoard(client.boardId, {
          type: 'card_unlocked',
          id: card.id,
        });
        break;
      }

      case 'card_delete': {
        if (!client.boardId || !client.userName) return;
        const res = this.boardService.deleteCard(msg.id, client.userName);
        if (res.success) {
          this.broadcastToBoard(client.boardId, {
            type: 'card_deleted',
            id: msg.id,
          });
        }
        break;
      }

      case 'heartbeat': {
        // Keeps connection alive
        break;
      }
    }
  }

  private handleDisconnect(client: ConnectedClient) {
    this.clients.delete(client.id);

    if (client.boardId) {
      const presences = this.getBoardPresences(client.boardId);
      this.broadcastToBoard(client.boardId, {
        type: 'presence_update',
        presences,
      });
    }
  }

  private getBoardPresences(boardId: string): UserPresence[] {
    const list: UserPresence[] = [];
    for (const c of this.clients.values()) {
      if (c.boardId === boardId && c.userName) {
        list.push({
          client_id: c.id,
          user_name: c.userName,
          color: c.color || '#38bdf8',
          cursor_x: c.cursorX,
          cursor_y: c.cursorY,
          last_seen: new Date(c.lastSeen).toISOString(),
        });
      }
    }
    return list;
  }

  public broadcastToBoard(boardId: string, msg: ServerWsMessage, skipClientId?: string) {
    const payload = JSON.stringify(msg);
    for (const c of this.clients.values()) {
      if (c.boardId === boardId && c.id !== skipClientId && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerWsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public getActiveConnectionCount(): number {
    return this.clients.size;
  }
}
