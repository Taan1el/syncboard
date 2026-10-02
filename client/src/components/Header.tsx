import { Plus } from 'lucide-react';
import type { Board } from '../../../shared/types';

interface HeaderProps {
  boards: Board[];
  boardId: string;
  onSelectBoard: (id: string) => void;
  onNewCard: () => void;
}

export function Header({ boards, boardId, onSelectBoard, onNewCard }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-title">
        <h1>SyncBoard</h1>
        <p>A shared kanban board: everyone sees moves, edits and locks as they happen.</p>
      </div>
      <div className="site-actions">
        <div className="field board-field">
          <label htmlFor="board-select">Board</label>
          <select id="board-select" value={boardId} onChange={(e) => onSelectBoard(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNewCard} disabled={!boardId}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          New card
        </button>
      </div>
    </header>
  );
}
