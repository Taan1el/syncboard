import { useState } from 'react';
import type { UserPresence } from '../../../shared/types';
import type { ConnectionStatus } from '../services/types';
import { formatCount, initials, pluralize } from '../lib/format';

interface PresenceStripProps {
  presences: UserPresence[];
  clientId: string | null;
  status: ConnectionStatus;
  retryInMs?: number;
  name: string;
  onRename: (name: string) => void;
}

function statusText(status: ConnectionStatus, retryInMs?: number): string {
  if (status === 'open') return 'Connected';
  if (status === 'connecting') return 'Connecting';
  const secs = Math.max(1, Math.round((retryInMs ?? 0) / 1000));
  return `Reconnecting in ${secs} ${pluralize(secs, 'second')}`;
}

export function PresenceStrip({ presences, clientId, status, retryInMs, name, onRename }: PresenceStripProps) {
  const [draft, setDraft] = useState(name);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = draft.trim();
    if (next && next !== name) onRename(next);
  };

  return (
    <section className="presence" aria-label="People on this board">
      <div className="presence-people">
        <span className="presence-count">{formatCount(presences.length, 'person', 'people')} here</span>
        <ul className="presence-list">
          {presences.map((p) => {
            const me = p.client_id === clientId;
            return (
              <li key={p.client_id} className="person">
                <span className="avatar" aria-hidden="true">
                  {initials(p.user_name)}
                  <span className={p.editing ? 'dot dot-warn' : 'dot dot-ok'} />
                </span>
                <span className="person-name">
                  {p.user_name}
                  {me ? ' (you)' : ''}
                </span>
                {p.editing && <span className="person-note">editing</span>}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="presence-side">
        <span className="conn">
          <span className={status === 'open' ? 'dot dot-ok' : 'dot dot-warn'} aria-hidden="true" />
          {statusText(status, retryInMs)}
        </span>
        <form className="name-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="your-name">Your name</label>
            <input
              id="your-name"
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
            />
          </div>
        </form>
      </div>
    </section>
  );
}
