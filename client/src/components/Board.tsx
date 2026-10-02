import { useState } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { COLUMNS } from '../../../shared/types';
import type { CanvasCard, ColumnId } from '../../../shared/types';
import { cardsInColumn } from '../../../shared/board';
import { dropTarget } from '../lib/move';
import type { MoveKey } from '../lib/move';
import { formatCount } from '../lib/format';

interface BoardProps {
  cards: CanvasCard[];
  userName: string;
  onEdit: (card: CanvasCard) => void;
  onAdd: (column: ColumnId) => void;
  onMove: (id: string, column: ColumnId, index: number) => void;
  onKeyMove: (id: string, key: MoveKey) => void;
}

type Over = { kind: 'row'; id: string; after: boolean } | { kind: 'end'; column: ColumnId } | null;

const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function Board({ cards, userName, onEdit, onAdd, onMove, onKeyMove }: BoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Over>(null);

  const finish = () => {
    setDragId(null);
    setOver(null);
  };

  const drop = (target: { column: ColumnId; index: number } | null) => {
    if (dragId && target) onMove(dragId, target.column, target.index);
    finish();
  };

  const dropAtEnd = (column: ColumnId) => {
    const size = cardsInColumn(cards.filter((c) => c.id !== dragId), column).length;
    drop({ column, index: size });
  };

  return (
    <div className="columns">
      {COLUMNS.map((col) => {
        const list = cardsInColumn(cards, col.id);
        return (
          <section key={col.id} className="column" aria-labelledby={`col-${col.id}`}>
            <header className="column-head">
              <h3 id={`col-${col.id}`}>{col.title}</h3>
              <span className="mono muted" aria-label={formatCount(list.length, 'card')}>
                {list.length}
              </span>
            </header>
            <ul
              className={over?.kind === 'end' && over.column === col.id ? 'rows drop-end' : 'rows'}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (e.target === e.currentTarget) setOver({ kind: 'end', column: col.id });
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropAtEnd(col.id);
              }}
            >
              {list.map((card) => {
                const blocked = Boolean(card.locked_by && card.locked_by !== userName);
                const cls = [
                  'row',
                  dragId === card.id ? 'dragging' : '',
                  over?.kind === 'row' && over.id === card.id ? (over.after ? 'drop-after' : 'drop-before') : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li
                    key={card.id}
                    className={cls}
                    draggable={!blocked}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', card.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(card.id);
                    }}
                    onDragEnd={finish}
                    onDragOver={(e) => {
                      if (!dragId || dragId === card.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setOver({ kind: 'row', id: card.id, after: e.clientY > rect.top + rect.height / 2 });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!dragId) return;
                      const after = over?.kind === 'row' && over.id === card.id ? over.after : false;
                      drop(dropTarget(cards, dragId, card.id, after));
                    }}
                  >
                    <button
                      type="button"
                      className="handle"
                      aria-label={`Move "${card.title}". Arrow keys change column or order.`}
                      disabled={blocked}
                      onKeyDown={(e) => {
                        if (MOVE_KEYS.includes(e.key)) {
                          e.preventDefault();
                          onKeyMove(card.id, e.key as MoveKey);
                        }
                      }}
                    >
                      <GripVertical size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <div className="row-body">
                      <button type="button" className="row-title" disabled={blocked} onClick={() => onEdit(card)}>
                        {card.title}
                      </button>
                      {card.content && <p className="row-text">{card.content}</p>}
                      <p className="row-meta mono">
                        {card.locked_by ? (
                          <span className="lock">
                            <span className="dot dot-warn" aria-hidden="true" />
                            {card.locked_by === userName ? 'You are editing' : `${card.locked_by} is editing`}
                          </span>
                        ) : (
                          <span>
                            v{card.version} by {card.updated_by}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
              {list.length === 0 && <li className="row-empty">No cards in {col.title}.</li>}
            </ul>
            <button type="button" className="btn btn-text" onClick={() => onAdd(col.id)}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Add card
              <span className="sr-only"> to {col.title}</span>
            </button>
          </section>
        );
      })}
    </div>
  );
}
