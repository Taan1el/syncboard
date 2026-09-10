import React, { useRef, useState } from 'react';
import { CanvasCard, UserPresence } from '../../../shared/types';

interface CollaborativeCanvasProps {
  cards: CanvasCard[];
  presences: UserPresence[];
  currentUserName: string;
  onMoveCard: (id: string, x: number, y: number, version: number) => void;
  onEditCard: (card: CanvasCard) => void;
  onToggleLock: (card: CanvasCard) => void;
  onDeleteCard: (id: string) => void;
  onCursorMove: (x: number, y: number) => void;
}

export const CollaborativeCanvas: React.FC<CollaborativeCanvasProps> = ({
  cards,
  presences,
  currentUserName,
  onMoveCard,
  onEditCard,
  onToggleLock,
  onDeleteCard,
  onCursorMove,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    onCursorMove(x, y);

    if (draggingCardId) {
      const card = cards.find((c) => c.id === draggingCardId);
      if (card) {
        const newX = Math.max(10, Math.round(x - dragOffset.x));
        const newY = Math.max(10, Math.round(y - dragOffset.y));
        onMoveCard(card.id, newX, newY, card.version);
      }
    }
  };

  const handleMouseDownCard = (e: React.MouseEvent, card: CanvasCard) => {
    if (card.locked_by && card.locked_by !== currentUserName) {
      alert(`Card is locked for editing by ${card.locked_by}`);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDraggingCardId(card.id);
    setDragOffset({
      x: mouseX - card.x,
      y: mouseY - card.y,
    });
  };

  const handleMouseUp = () => {
    setDraggingCardId(null);
  };

  return (
    <div
      ref={canvasRef}
      className="canvas-container"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Background Dot Grid */}
      <div className="canvas-grid-pattern" />

      {/* Remote User Cursors */}
      {presences.map((p) => (
        <div
          key={p.client_id}
          className="remote-cursor"
          style={{
            transform: `translate(${p.cursor_x}px, ${p.cursor_y}px)`,
            transition: 'transform 0.08s linear',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke={p.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill={p.color} />
          </svg>
          <span className="cursor-label" style={{ backgroundColor: p.color }}>
            {p.user_name}
          </span>
        </div>
      ))}

      {/* Canvas Cards */}
      {cards.map((card) => {
        const isLockedByOther = card.locked_by && card.locked_by !== currentUserName;
        const isLockedByMe = card.locked_by === currentUserName;
        const isDragging = draggingCardId === card.id;

        return (
          <div
            key={card.id}
            className={`canvas-card ${isDragging ? 'is-dragging' : ''} ${
              isLockedByOther ? 'is-locked-other' : ''
            }`}
            style={{
              transform: `translate(${card.x}px, ${card.y}px)`,
              backgroundColor: card.color,
              width: `${card.width}px`,
              minHeight: `${card.height}px`,
              cursor: isLockedByOther ? 'not-allowed' : 'grab',
            }}
            onMouseDown={(e) => handleMouseDownCard(e, card)}
          >
            <div className="card-top-bar">
              <span className="card-version-pill">v{card.version}</span>
              {isLockedByOther && (
                <span className="lock-tag" title={`Locked by ${card.locked_by}`}>
                  🔒 {card.locked_by}
                </span>
              )}
              {isLockedByMe && <span className="lock-tag me">🔒 You</span>}

              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-card-action"
                  onClick={() => onToggleLock(card)}
                  title={isLockedByMe ? 'Unlock Card' : 'Lock Card'}
                >
                  {isLockedByMe ? '🔓' : '🔒'}
                </button>
                <button
                  className="btn-card-action"
                  onClick={() => onEditCard(card)}
                  title="Edit content & color"
                  disabled={Boolean(isLockedByOther)}
                >
                  ✏️
                </button>
                <button
                  className="btn-card-action danger"
                  onClick={() => onDeleteCard(card.id)}
                  title="Delete Card"
                  disabled={Boolean(isLockedByOther)}
                >
                  ✕
                </button>
              </div>
            </div>

            <h4 className="card-title">{card.title}</h4>
            <p className="card-content">{card.content}</p>

            <div className="card-footer">
              <span className="text-xs text-muted">Edited by {card.updated_by}</span>
            </div>
          </div>
        );
      })}

      {cards.length === 0 && (
        <div className="canvas-empty-state">
          <span>📋</span>
          <p>No cards on canvas yet. Click "+ Add Card" above to create one.</p>
        </div>
      )}
    </div>
  );
};
