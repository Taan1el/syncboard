import { History } from 'lucide-react';
import type { ActivityEntry } from '../../../shared/types';
import { describeActivity } from '../../../shared/board';
import { formatCount, formatTime } from '../lib/format';

interface ActivityRailProps {
  entries: ActivityEntry[];
  open: boolean;
  onToggle: () => void;
}

export function ActivityRail({ entries, open, onToggle }: ActivityRailProps) {
  return (
    <aside className="rail" data-open={open}>
      <button type="button" className="btn rail-toggle" aria-expanded={open} aria-controls="activity-list" onClick={onToggle}>
        <History size={16} strokeWidth={1.75} aria-hidden="true" />
        {open ? 'Hide activity' : `Show activity (${entries.length})`}
      </button>
      <div className="rail-body">
        <div className="rail-head">
          <h2>Activity</h2>
          <span className="mono muted">{formatCount(entries.length, 'change')}, UTC</span>
        </div>
        {entries.length === 0 ? (
          <p className="muted">Nothing has changed on this board yet.</p>
        ) : (
          <ol id="activity-list" className="feed">
            {entries.map((e) => (
              <li key={e.id}>
                <time className="mono" dateTime={e.created_at}>
                  {formatTime(e.created_at)}
                </time>
                <span>{describeActivity(e)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
