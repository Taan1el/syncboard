import { BoardRepository } from '../repositories/board.repository.js';
import { CardRepository } from '../repositories/card.repository.js';
import { Board, CanvasCard, CreateBoardDto } from '../../../shared/types.js';

export class BoardService {
  constructor(
    private boardRepo: BoardRepository,
    private cardRepo: CardRepository
  ) {}

  listBoards(): Board[] {
    return this.boardRepo.listBoards();
  }

  getBoardById(id: string): Board | null {
    return this.boardRepo.getBoardById(id);
  }

  createBoard(dto: CreateBoardDto): Board {
    if (!dto.title.trim()) {
      throw new Error('Board title is required');
    }
    return this.boardRepo.createBoard(dto);
  }

  listCardsByBoard(boardId: string): CanvasCard[] {
    return this.cardRepo.listCardsByBoard(boardId);
  }

  createCard(data: {
    board_id: string;
    title: string;
    content: string;
    color?: string;
    x: number;
    y: number;
    updated_by: string;
  }): CanvasCard {
    const card = this.cardRepo.createCard(data);
    this.cardRepo.recordMutation(data.board_id, card.id, 'card.created', data.updated_by);
    return card;
  }

  moveCard(
    id: string,
    x: number,
    y: number,
    clientVersion: number,
    updatedBy: string
  ): CanvasCard {
    const current = this.cardRepo.getCardById(id);
    if (!current) {
      throw new Error(`Card not found: ${id}`);
    }

    if (current.locked_by && current.locked_by !== updatedBy) {
      throw new Error(`Card is locked for editing by ${current.locked_by}`);
    }

    const nextVersion = Math.max(current.version, clientVersion) + 1;
    const updated = this.cardRepo.updatePosition(id, x, y, nextVersion, updatedBy);
    this.cardRepo.recordMutation(current.board_id, id, 'card.moved', updatedBy);
    return updated;
  }

  updateCard(
    id: string,
    title: string,
    content: string,
    color: string | undefined,
    clientVersion: number,
    updatedBy: string
  ): CanvasCard {
    const current = this.cardRepo.getCardById(id);
    if (!current) {
      throw new Error(`Card not found: ${id}`);
    }

    if (current.locked_by && current.locked_by !== updatedBy) {
      throw new Error(`Card is locked for editing by ${current.locked_by}`);
    }

    const nextVersion = Math.max(current.version, clientVersion) + 1;
    const updated = this.cardRepo.updateContent(id, title, content, color, nextVersion, updatedBy);
    this.cardRepo.recordMutation(current.board_id, id, 'card.updated', updatedBy);
    return updated;
  }

  lockCard(id: string, userName: string): CanvasCard {
    const current = this.cardRepo.getCardById(id);
    if (!current) {
      throw new Error(`Card not found: ${id}`);
    }

    if (current.locked_by && current.locked_by !== userName) {
      throw new Error(`Card is already locked by ${current.locked_by}`);
    }

    const updated = this.cardRepo.setLock(id, userName);
    this.cardRepo.recordMutation(current.board_id, id, 'card.locked', userName);
    return updated;
  }

  unlockCard(id: string, userName: string): CanvasCard {
    const current = this.cardRepo.getCardById(id);
    if (!current) {
      throw new Error(`Card not found: ${id}`);
    }

    const updated = this.cardRepo.setLock(id, null);
    this.cardRepo.recordMutation(current.board_id, id, 'card.unlocked', userName);
    return updated;
  }

  deleteCard(id: string, userName: string): { success: boolean; board_id: string } {
    const current = this.cardRepo.getCardById(id);
    if (!current) {
      throw new Error(`Card not found: ${id}`);
    }

    if (current.locked_by && current.locked_by !== userName) {
      throw new Error(`Cannot delete card locked by ${current.locked_by}`);
    }

    const boardId = current.board_id;
    const deleted = this.cardRepo.deleteCard(id);
    if (deleted) {
      this.cardRepo.recordMutation(boardId, id, 'card.deleted', userName);
    }

    return { success: deleted, board_id: boardId };
  }

  getMetrics(activeConnections = 0) {
    const dbMetrics = this.cardRepo.getMetrics();
    return {
      ...dbMetrics,
      active_connections: activeConnections,
    };
  }
}
