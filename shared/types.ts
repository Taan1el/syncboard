export interface Board {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasCard {
  id: string;
  board_id: string;
  title: string;
  content: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  version: number; // Logical clock for LWW conflict resolution
  locked_by?: string | null;
  updated_by: string;
  updated_at: string;
}

export interface UserPresence {
  client_id: string;
  user_name: string;
  color: string;
  cursor_x: number;
  cursor_y: number;
  last_seen: string;
}

export type ClientWsMessage =
  | { type: 'join_board'; board_id: string; user_name: string; color: string }
  | { type: 'cursor_move'; x: number; y: number }
  | { type: 'card_create'; title: string; content: string; color?: string; x: number; y: number }
  | { type: 'card_move'; id: string; x: number; y: number; version: number }
  | { type: 'card_update'; id: string; title: string; content: string; color?: string; version: number }
  | { type: 'card_lock'; id: string }
  | { type: 'card_unlock'; id: string }
  | { type: 'card_delete'; id: string }
  | { type: 'heartbeat' };

export type ServerWsMessage =
  | { type: 'board_sync'; board: Board; cards: CanvasCard[]; presences: UserPresence[]; client_id: string }
  | { type: 'presence_update'; presences: UserPresence[] }
  | { type: 'card_created'; card: CanvasCard }
  | { type: 'card_moved'; id: string; x: number; y: number; version: number; updated_by: string }
  | { type: 'card_updated'; card: CanvasCard }
  | { type: 'card_locked'; id: string; locked_by: string }
  | { type: 'card_unlocked'; id: string }
  | { type: 'card_deleted'; id: string }
  | { type: 'error'; message: string };

export interface BoardMetrics {
  total_boards: number;
  total_cards: number;
  active_connections: number;
  total_mutations: number;
}

export interface CreateBoardDto {
  title: string;
  description?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
