import React, { useState, useEffect } from 'react';
import { CanvasCard } from '../../../shared/types';

interface CardEditorModalProps {
  isOpen: boolean;
  cardToEdit: CanvasCard | null;
  onClose: () => void;
  onSave: (data: { title: string; content: string; color: string }) => void;
}

const COLOR_PRESETS = [
  { name: 'Sky Blue', hex: '#bae6fd' },
  { name: 'Mint Green', hex: '#bbf7d0' },
  { name: 'Warm Yellow', hex: '#fef08a' },
  { name: 'Lavender', hex: '#e9d5ff' },
  { name: 'Peach', hex: '#fed7aa' },
  { name: 'Rose', hex: '#fbcfe8' },
];

export const CardEditorModal: React.FC<CardEditorModalProps> = ({
  isOpen,
  cardToEdit,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0].hex);

  useEffect(() => {
    if (cardToEdit) {
      setTitle(cardToEdit.title);
      setContent(cardToEdit.content);
      setColor(cardToEdit.color);
    } else {
      setTitle('');
      setContent('');
      setColor(COLOR_PRESETS[0].hex);
    }
  }, [cardToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title, content, color });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{cardToEdit ? 'Edit Canvas Card' : 'Create New Sticky Card'}</h3>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Card Title / Initiative</label>
            <input
              type="text"
              placeholder="e.g. Distributed Consensus Engine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label>Card Content / Description</label>
            <textarea
              rows={4}
              placeholder="Add technical specification, requirements, or architecture notes..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label>Card Color Theme</label>
            <div className="color-presets-row">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`color-preset-btn ${color === c.hex ? 'selected' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {cardToEdit ? 'Save Changes' : 'Create Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
