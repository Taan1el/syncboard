import { applyOp } from './board.js';
import type { CardOp, OpResult } from './board.js';
import { LIMITS } from './types.js';
import type {
  ActivityEntry,
  Board,
  CanvasCard,
  ClientWsMessage,
  ServerWsMessage,
  UserPresence,
} from './types.js';
import { SyncError, parseClientMessage } from './validate.js';

/**
 * Where a board's cards and activity live. The server backs this with SQLite,
 * the in-browser demo and the tests use MemoryStore.
 */
export interface Store {
  getBoard(id: string): Board | null;
  listCards(boardId: string): CanvasCard[];
  /** Persists the rows an operation touched and returns the activity entry, if any. */
  commit(boardId: string, result: OpResult, actor: string, now: string): ActivityEntry | null;
  listActivity(boardId: string, limit: number): ActivityEntry[];
  /** Called once when a hub starts: nobody is connected, so no lock can be valid. */
  clearLocks(): void;
}

export interface Delivery {
  to: string[];
  msg: ServerWsMessage;
}

interface HubClient {
  id: string;
  boardId?: string;
  name?: string;
  color?: string;
  lastSeen: number;
  locks: Set<string>;
}

export interface HubOptions {
  now?: () => number;
  newId?: () => string;
}

export const ACTIVITY_LIMIT = 30;

/**
 * Transport-independent room logic: who is on which board, who holds which
 * lock, and what every operation turns into. The caller moves frames between
 * sockets and `receive`, and delivers whatever comes back.
 */
export class Hub {
  private clients = new Map<string, HubClient>();
  private now: () => number;
  private newId: () => string;

  constructor(private store: Store, options: HubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => globalThis.crypto.randomUUID());
    this.store.clearLocks();
  }

  connect(clientId: string): void {
    this.clients.set(clientId, { id: clientId, lastSeen: this.now(), locks: new Set() });
  }

  connectionCount(): number {
    return this.clients.size;
  }

  /** Ids of connections that have sent nothing for longer than `maxAgeMs`. */
  staleClients(maxAgeMs: number): string[] {
    const cutoff = this.now() - maxAgeMs;
    return [...this.clients.values()].filter((c) => c.lastSeen < cutoff).map((c) => c.id);
  }

  presences(boardId: string): UserPresence[] {
    const list: UserPresence[] = [];
    for (const c of this.clients.values()) {
      if (c.boardId === boardId && c.name) {
        list.push({
          client_id: c.id,
          user_name: c.name,
          color: c.color ?? '#0b6bcb',
          editing: [...c.locks][0] ?? null,
          last_seen: new Date(c.lastSeen).toISOString(),
        });
      }
    }
    return list;
  }

  private members(boardId: string): string[] {
    return [...this.clients.values()].filter((c) => c.boardId === boardId).map((c) => c.id);
  }

  private uniqueName(boardId: string, requested: string, selfId: string): string {
    const taken = new Set(
      [...this.clients.values()]
        .filter((c) => c.boardId === boardId && c.id !== selfId && c.name)
        .map((c) => c.name)
    );
    if (!taken.has(requested)) return requested;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = requested.slice(0, LIMITS.nameMax - suffix.length) + suffix;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /** Handles one decoded frame from a client and returns what to send to whom. */
  receive(clientId: string, raw: unknown): Delivery[] {
    const client = this.clients.get(clientId);
    if (!client) return [];
    client.lastSeen = this.now();
    let msg: ClientWsMessage;
    try {
      msg = parseClientMessage(raw);
      return this.handle(client, msg);
    } catch (err) {
      if (err instanceof SyncError) {
        return [{ to: [clientId], msg: { type: 'error', message: err.message } }];
      }
      throw err;
    }
  }

  private handle(client: HubClient, msg: ClientWsMessage): Delivery[] {
    if (msg.type === 'heartbeat') return [];
    if (msg.type === 'join_board') return this.join(client, msg);
    if (!client.boardId || !client.name) throw new SyncError('Join a board first');

    switch (msg.type) {
      case 'card_create':
        return this.operate(client, { type: 'create', title: msg.title, content: msg.content, column: msg.column });
      case 'card_move':
        return this.operate(client, {
          type: 'move',
          id: msg.id,
          column: msg.column,
          index: msg.index,
          version: msg.version,
        });
      case 'card_update':
        return this.operate(client, {
          type: 'update',
          id: msg.id,
          title: msg.title,
          content: msg.content,
          version: msg.version,
        });
      case 'card_lock':
        return this.operate(client, { type: 'lock', id: msg.id });
      case 'card_unlock':
        return this.operate(client, { type: 'unlock', id: msg.id });
      case 'card_delete':
        return this.operate(client, { type: 'delete', id: msg.id });
    }
  }

  private join(client: HubClient, msg: Extract<ClientWsMessage, { type: 'join_board' }>): Delivery[] {
    const board = this.store.getBoard(msg.board_id);
    if (!board) throw new SyncError(`Board not found: ${msg.board_id}`);

    const out: Delivery[] = [];
    if (client.boardId && client.boardId !== msg.board_id) {
      out.push(...this.leave(client));
    }
    client.boardId = msg.board_id;
    client.name = this.uniqueName(msg.board_id, msg.user_name, client.id);
    client.color = msg.color;

    out.push({
      to: [client.id],
      msg: {
        type: 'board_sync',
        board,
        cards: this.store.listCards(board.id),
        presences: this.presences(board.id),
        activity: this.store.listActivity(board.id, ACTIVITY_LIMIT),
        client_id: client.id,
        user_name: client.name,
      },
    });
    out.push(this.presenceDelivery(board.id));
    return out;
  }

  private presenceDelivery(boardId: string): Delivery {
    return { to: this.members(boardId), msg: { type: 'presence_update', presences: this.presences(boardId) } };
  }

  private operate(client: HubClient, op: CardOp): Delivery[] {
    const boardId = client.boardId!;
    const actor = client.name!;
    const deliveries = this.run(boardId, actor, op);

    if (op.type === 'lock') client.locks.add(op.id);
    if (op.type === 'unlock' || op.type === 'delete') {
      for (const c of this.clients.values()) c.locks.delete(op.id);
    }
    if (op.type === 'lock' || op.type === 'unlock' || op.type === 'delete') {
      deliveries.push(this.presenceDelivery(boardId));
    }
    return deliveries;
  }

  /**
   * Applies one operation to a board, persists it and returns the broadcast.
   * Also used by the REST API, which has no socket of its own.
   */
  run(boardId: string, actor: string, op: CardOp): Delivery[] {
    if (!this.store.getBoard(boardId)) throw new SyncError(`Board not found: ${boardId}`);
    const cards = this.store.listCards(boardId);
    const nowIso = new Date(this.now()).toISOString();
    const result = applyOp(cards, op, actor, nowIso, this.newId, boardId);
    const entry = this.store.commit(boardId, result, actor, nowIso);

    const to = this.members(boardId);
    const out: Delivery[] = [{ to, msg: result.event }];
    if (entry) out.push({ to, msg: { type: 'activity', entry } });
    return out;
  }

  /** Drops a connection: releases its locks and tells the rest of the board. */
  disconnect(clientId: string): Delivery[] {
    const client = this.clients.get(clientId);
    if (!client) return [];
    const out = this.leave(client);
    this.clients.delete(clientId);
    return out;
  }

  private leave(client: HubClient): Delivery[] {
    const boardId = client.boardId;
    if (!boardId) return [];
    const out: Delivery[] = [];
    const locks = [...client.locks];
    client.locks.clear();
    client.boardId = undefined;
    for (const id of locks) {
      try {
        const cards = this.store.listCards(boardId);
        const card = cards.find((c) => c.id === id);
        if (!card || card.locked_by !== client.name) continue;
        out.push(...this.run(boardId, client.name!, { type: 'unlock', id }));
      } catch (err) {
        if (!(err instanceof SyncError)) throw err;
      }
    }
    // Recipients are computed after the client left, so it never hears about itself.
    for (const d of out) d.to = d.to.filter((id) => id !== client.id);
    out.push(this.presenceDelivery(boardId));
    return out;
  }
}
