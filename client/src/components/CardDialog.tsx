import { useEffect, useRef, useState } from 'react';
import { COLUMNS, LIMITS } from '../../../shared/types';
import type { CanvasCard, ColumnId } from '../../../shared/types';

export interface CardDraft {
  title: string;
  content: string;
  column: ColumnId;
}

interface CardDialogProps {
  /** The card being edited, or null when creating one. */
  card: CanvasCard | null;
  column: ColumnId;
  onSave: (draft: CardDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CardDialog({ card, column, onSave, onDelete, onClose }: CardDialogProps) {
  const [title, setTitle] = useState(card?.title ?? '');
  const [content, setContent] = useState(card?.content ?? '');
  const [col, setCol] = useState<ColumnId>(card?.column ?? column);
  const [confirming, setConfirming] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = panel.current.querySelectorAll<HTMLElement>('input, select, textarea, button:not([disabled])');
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), content: content.trim(), column: col });
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={keyDown}
      >
        <h2 id="dialog-title">{card ? 'Edit card' : 'New card'}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="card-title">Title</label>
            <input
              id="card-title"
              ref={titleRef}
              value={title}
              maxLength={LIMITS.titleMax}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="card-content">Details</label>
            <textarea
              id="card-content"
              rows={4}
              value={content}
              maxLength={LIMITS.contentMax}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="card-column">Column</label>
            <select id="card-column" value={col} onChange={(e) => setCol(e.target.value as ColumnId)}>
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary">
              {card ? 'Save card' : 'Add card'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            {card && !confirming && (
              <button type="button" className="btn btn-text btn-danger" onClick={() => setConfirming(true)}>
                Delete card
              </button>
            )}
            {card && confirming && (
              <>
                <button type="button" className="btn btn-danger" onClick={onDelete}>
                  Delete for everyone
                </button>
                <button type="button" className="btn btn-text" onClick={() => setConfirming(false)}>
                  Keep card
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
