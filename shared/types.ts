export const COLUMNS = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'doing', title: 'In progress' },
  { id: 'review', title: 'In review' },
  { id: 'done', title: 'Done' },
] as const;

export type ColumnId = (typeof COLUMNS)[number]['id'];

export const LIMITS = {
  titleMax: 120,
  contentMax: 2000,
  nameMax: 40,
  idMax: 64,
} as const;

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
  column: ColumnId;
  /** Zero-based index inside the column. Kept dense: 0..n-1 with no gaps. */
  position: number;
  /** Counts accepted changes to the card. Informational, it never rejects a write. */
  version: number;
  locked_by: string | null;
  updated_by: string;
  updated_at: string;
}

export interface UserPresence {
  client_id: string;
  user_name: string;
  color: string;
  /** Id of the card this person has open for editing, if any. */
  editing: string | null;
  last_seen: string;
}

export type ActivityAction = 'card.created' | 'card.moved' | 'card.updated' | 'card.deleted';

export interface ActivityEntry {
  id: string;
  board_id: string;
  card_id: string | null;
  action: ActivityAction;
  actor_name: string;
  card_title: string;
  /** Column id for created and moved cards, empty otherwise. */
  detail: string;
  created_at: string;
}

export type ClientWsMessage =
  | { type: 'join_board'; board_id: string; user_name: string; color: string }
  | { type: 'card_create'; title: string; content: string; column: ColumnId }
  | { type: 'card_move'; id: string; column: ColumnId; index: number; version: number }
  | { type: 'card_update'; id: string; title: string; content: string; version: number }
  | { type: 'card_lock'; id: string }
  | { type: 'card_unlock'; id: string }
  | { type: 'card_delete'; id: string }
  | { type: 'heartbeat' };

export type ServerWsMessage =
  | {
      type: 'board_sync';
      board: Board;
      cards: CanvasCard[];
      presences: UserPresence[];
      activity: ActivityEntry[];
      client_id: string;
      user_name: string;
    }
  | { type: 'presence_update'; presences: UserPresence[] }
  | { type: 'card_created'; card: CanvasCard }
  | {
      type: 'card_moved';
      id: string;
      column: ColumnId;
      index: number;
      version: number;
      updated_by: string;
      updated_at: string;
    }
  | { type: 'card_updated'; card: CanvasCard }
  | { type: 'card_locked'; id: string; locked_by: string }
  | { type: 'card_unlocked'; id: string }
  | { type: 'card_deleted'; id: string }
  | { type: 'activity'; entry: ActivityEntry }
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
