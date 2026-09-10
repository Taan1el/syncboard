import React from 'react';
import { Board, UserPresence } from '../../../shared/types';

interface BoardHeaderProps {
  board: Board | null;
  boards: Board[];
  presences: UserPresence[];
  isConnected: boolean;
  currentUser: { name: string; color: string };
  onSelectBoard: (id: string) => void;
  onOpenCreateCard: () => void;
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  board,
  boards,
  presences,
  isConnected,
  currentUser,
  onSelectBoard,
  onOpenCreateCard,
}) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo">SB</div>
        <div>
          <h1>SyncBoard</h1>
          <p className="header-subtitle">
            Real-Time WebSocket Collaborative Canvas & State Synchronization Engine
          </p>
        </div>
      </div>

      <div className="header-middle">
        <div className="board-selector-wrap">
          <label className="text-xs text-muted">Active Canvas:</label>
          <select
            value={board?.id || ''}
            onChange={(e) => onSelectBoard(e.target.value)}
            className="board-select"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="header-actions">
        {/* Collaborators Avatar Stack */}
        <div className="avatar-stack" title="Active collaborators currently in this room">
          {/* Current User */}
          <div
            className="user-pill self"
            style={{ borderColor: currentUser.color }}
            title={`You (${currentUser.name})`}
          >
            <span className="dot" style={{ backgroundColor: currentUser.color }} />
            <span>{currentUser.name} (You)</span>
          </div>

          {/* Remote Peers */}
          {presences.map((p) => (
            <div
              key={p.client_id}
              className="user-pill remote"
              style={{ borderColor: p.color }}
              title={`Peer (${p.user_name})`}
            >
              <span className="dot" style={{ backgroundColor: p.color }} />
              <span>{p.user_name}</span>
            </div>
          ))}
        </div>

        <div className="live-status">
          <span className={`status-indicator ${isConnected ? 'live' : 'paused'}`} />
          <span>{isConnected ? 'Sync Live' : 'Disconnected'}</span>
        </div>

        <button className="btn btn-primary" onClick={onOpenCreateCard}>
          + Add Card
        </button>
      </div>
    </header>
  );
};
