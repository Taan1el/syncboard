import {
  Board,
  CanvasCard,
  BoardMetrics,
  ClientWsMessage,
  ServerWsMessage,
  CreateBoardDto,
} from '../../../shared/types';

const API_BASE = '/api';

export const api = {
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  async getBoards(): Promise<Board[]> {
    const res = await fetch(`${API_BASE}/boards`);
    const json = await res.json();
    return json.data || [];
  },

  async getBoardById(id: string): Promise<Board> {
    const res = await fetch(`${API_BASE}/boards/${id}`);
    const json = await res.json();
    return json.data;
  },

  async createBoard(dto: CreateBoardDto): Promise<Board> {
    const res = await fetch(`${API_BASE}/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create board');
    return json.data;
  },

  async getCards(boardId: string): Promise<CanvasCard[]> {
    const res = await fetch(`${API_BASE}/boards/${boardId}/cards`);
    const json = await res.json();
    return json.data || [];
  },

  async createCard(
    boardId: string,
    dto: { title: string; content: string; color?: string; x?: number; y?: number; updated_by?: string }
  ): Promise<CanvasCard> {
    const res = await fetch(`${API_BASE}/boards/${boardId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create card');
    return json.data;
  },

  async getMetrics(): Promise<BoardMetrics> {
    const res = await fetch(`${API_BASE}/metrics`);
    const json = await res.json();
    return json.data || { total_boards: 0, total_cards: 0, active_connections: 0, total_mutations: 0 };
  },

  /**
   * Connect to real-time WebSocket room
   */
  createWebSocketConnection(
    boardId: string,
    userName: string,
    color: string,
    onMessage: (msg: ServerWsMessage) => void,
    onStatusChange: (connected: boolean) => void
  ): { send: (msg: ClientWsMessage) => void; close: () => void } {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    let ws: WebSocket | null = null;
    let isClosedExplicitly = false;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        onStatusChange(true);
        // Send join_board
        ws?.send(
          JSON.stringify({
            type: 'join_board',
            board_id: boardId,
            user_name: userName,
            color,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onMessage(parsed);
        } catch (err) {
          console.error('Failed to parse WS payload:', err);
        }
      };

      ws.onclose = () => {
        onStatusChange(false);
        if (!isClosedExplicitly) {
          // Reconnect after 2 seconds
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        onStatusChange(false);
        ws?.close();
      };
    };

    connect();

    return {
      send: (msg: ClientWsMessage) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      },
      close: () => {
        isClosedExplicitly = true;
        ws?.close();
      },
    };
  },
};
