import { Hub } from '../../../shared/hub';
import type { Delivery } from '../../../shared/hub';
import { MemoryStore } from '../../../shared/memory-store';
import { nextCollaboratorFrames } from '../../../shared/collaborator';
import type { ClientWsMessage } from '../../../shared/types';
import type { ConnectHandlers, Connection, Services } from './types';

export const BOTS = ['Mari', 'Karl', 'Liis'] as const;
export const TICK_MS = 3000;

/**
 * The server's room logic running inside the page. The Hub and MemoryStore are
 * the same code the Node server uses; three scripted collaborators join the
 * board and take turns locking, moving and releasing cards.
 */
class DemoRoom {
  readonly store = new MemoryStore();
  private counter = 0;
  private hub = new Hub(this.store, { newId: () => `card-${++this.counter}` });
  private locals = new Map<string, ConnectHandlers>();
  private botBoard: string | null = null;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextLocal = 0;

  constructor() {
    for (const name of BOTS) this.hub.connect(`bot-${name}`);
  }

  private deliver(deliveries: Delivery[]): void {
    for (const { to, msg } of deliveries) {
      for (const id of to) this.locals.get(id)?.onMessage(msg);
    }
  }

  private seatBots(boardId: string): void {
    if (this.botBoard === boardId) return;
    this.botBoard = boardId;
    for (const name of BOTS) {
      this.deliver(
        this.hub.receive(`bot-${name}`, { type: 'join_board', board_id: boardId, user_name: name, color: '#0b6bcb' })
      );
    }
  }

  private tick(): void {
    if (!this.botBoard) return;
    BOTS.forEach((name, i) => {
      const frames = nextCollaboratorFrames(name, this.step + i, this.store.listCards(this.botBoard!));
      for (const frame of frames) this.deliver(this.hub.receive(`bot-${name}`, frame));
    });
    this.step += 1;
  }

  connect(handlers: ConnectHandlers): Connection {
    const id = `local-${++this.nextLocal}`;
    this.hub.connect(id);
    this.locals.set(id, handlers);
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    queueMicrotask(() => handlers.onStatus('open'));

    return {
      send: (msg: ClientWsMessage) => {
        this.deliver(this.hub.receive(id, msg));
        if (msg.type === 'join_board') this.seatBots(msg.board_id);
      },
      close: () => {
        if (!this.locals.delete(id)) return;
        this.deliver(this.hub.disconnect(id));
        if (this.locals.size === 0) this.stop();
      },
    };
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Services for the GitHub Pages build and for tests: no network involved. */
export function createDemoServices(): Services {
  let room = new DemoRoom();
  return {
    isDemo: true,
    defaultName: 'You',
    loadBoards: async () => room.store.listBoards(),
    connect: (handlers) => room.connect(handlers),
    reset: () => {
      room.stop();
      room = new DemoRoom();
    },
  };
}
