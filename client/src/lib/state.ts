import type { ActivityEntry, Board, CanvasCard, ColumnId, ServerWsMessage, UserPresence } from '../../../shared/types';
import { applyServerMessage, moveWithin } from '../../../shared/board';
import { ACTIVITY_LIMIT } from '../../../shared/hub';

export interface BoardState {
  board: Board | null;
  cards: CanvasCard[];
  presences: UserPresence[];
  activity: ActivityEntry[];
  clientId: string | null;
  userName: string | null;
}

export type BoardAction =
  | { kind: 'server'; msg: ServerWsMessage }
  | { kind: 'move'; id: string; column: ColumnId; index: number }
  | { kind: 'clear' };

export const emptyState: BoardState = {
  board: null,
  cards: [],
  presences: [],
  activity: [],
  clientId: null,
  userName: null,
};

/**
 * Applies a server frame with the same reducer the server and the demo use,
 * or a local optimistic move. The server's confirmation of a move is applied
 * on top and is harmless to repeat.
 */
export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  if (action.kind === 'clear') return emptyState;
  if (action.kind === 'move') {
    return { ...state, cards: moveWithin(state.cards, action.id, action.column, action.index) };
  }
  const msg = action.msg;
  switch (msg.type) {
    case 'board_sync':
      return {
        board: msg.board,
        cards: applyServerMessage([], msg),
        presences: msg.presences,
        activity: msg.activity,
        clientId: msg.client_id,
        userName: msg.user_name,
      };
    case 'presence_update':
      return { ...state, presences: msg.presences };
    case 'activity':
      if (state.activity.some((a) => a.id === msg.entry.id)) return state;
      return { ...state, activity: [msg.entry, ...state.activity].slice(0, ACTIVITY_LIMIT) };
    case 'error':
      return state;
    default:
      return { ...state, cards: applyServerMessage(state.cards, msg) };
  }
}
