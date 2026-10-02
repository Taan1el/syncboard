import type { BoardRepository } from '../repositories/board.repository.js';
import type { SqliteStore } from '../repositories/sqlite-store.js';
import type { Hub } from '../../../shared/hub.js';
import { ACTIVITY_LIMIT } from '../../../shared/hub.js';
import type { ActivityEntry, Board, BoardMetrics, CanvasCard, CreateBoardDto } from '../../../shared/types.js';
import { SyncError, isColumnId, validateContent, validateName, validateTitle } from '../../../shared/validate.js';
import type { Delivery } from '../../../shared/hub.js';

const DESCRIPTION_MAX = 500;

export class NotFoundError extends Error {}

export class BoardService {
  constructor(
    private boards: BoardRepository,
    private store: SqliteStore,
    private hub: Hub
  ) {}

  listBoards(): Board[] {
    return this.boards.listBoards();
  }

  getBoard(id: string): Board {
    const board = this.boards.getBoardById(id);
    if (!board) throw new NotFoundError('Board not found');
    return board;
  }

  createBoard(dto: CreateBoardDto): Board {
    const title = validateTitle(dto?.title);
    const description = dto.description === undefined ? '' : validateContent(dto.description);
    if (description.length > DESCRIPTION_MAX) {
      throw new SyncError(`description must be at most ${DESCRIPTION_MAX} characters`);
    }
    return this.boards.createBoard({ title, description });
  }

  listCards(boardId: string): CanvasCard[] {
    this.getBoard(boardId);
    return this.store.listCards(boardId);
  }

  listActivity(boardId: string, limit = ACTIVITY_LIMIT): ActivityEntry[] {
    this.getBoard(boardId);
    return this.store.listActivity(boardId, Math.min(Math.max(limit, 1), 100));
  }

  /** Creates a card from a REST request. Returns the card and the frames to broadcast. */
  createCard(
    boardId: string,
    input: { title: unknown; content: unknown; column: unknown; updated_by: unknown }
  ): { card: CanvasCard; deliveries: Delivery[] } {
    this.getBoard(boardId);
    const actor = input.updated_by === undefined ? 'API' : validateName(input.updated_by, 'updated_by');
    const column = input.column ?? 'backlog';
    if (!isColumnId(column)) throw new SyncError('column must be one of backlog, doing, review, done');
    const deliveries = this.hub.run(boardId, actor, {
      type: 'create',
      title: input.title as string,
      content: (input.content ?? '') as string,
      column,
    });
    const created = deliveries[0].msg;
    if (created.type !== 'card_created') throw new Error('Unexpected hub result');
    return { card: created.card, deliveries };
  }

  getMetrics(): BoardMetrics {
    return {
      total_boards: this.boards.listBoards().length,
      total_cards: this.store.countCards(),
      active_connections: this.hub.connectionCount(),
      total_mutations: this.store.countMutations(),
    };
  }
}
