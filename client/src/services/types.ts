import type { Board, ClientWsMessage, ServerWsMessage } from '../../../shared/types';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

export interface ConnectHandlers {
  onMessage: (msg: ServerWsMessage) => void;
  /** `retryInMs` is set while waiting to reconnect. */
  onStatus: (status: ConnectionStatus, retryInMs?: number) => void;
}

export interface Connection {
  send: (msg: ClientWsMessage) => void;
  close: () => void;
}

/** Everything the app needs from the outside: the board list and one live connection. */
export interface Services {
  isDemo: boolean;
  defaultName: string;
  loadBoards: () => Promise<Board[]>;
  connect: (handlers: ConnectHandlers) => Connection;
  /** Demo only: restore the sample data. */
  reset?: () => void;
}
