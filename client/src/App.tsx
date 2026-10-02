import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { COLUMNS } from '../../shared/types';
import type { Board as BoardInfo, CanvasCard, ColumnId, ServerWsMessage } from '../../shared/types';
import { defaultServices } from './services';
import type { Connection, ConnectionStatus, Services } from './services/types';
import { boardReducer, emptyState } from './lib/state';
import { planKeyMove } from './lib/move';
import type { MoveKey } from './lib/move';
import { formatCount } from './lib/format';
import { DemoBar } from './components/DemoBar';
import { Header } from './components/Header';
import { PresenceStrip } from './components/PresenceStrip';
import { Board } from './components/Board';
import { ActivityRail } from './components/ActivityRail';
import { CardDialog } from './components/CardDialog';
import type { CardDraft } from './components/CardDialog';

const NAME_KEY = 'syncboard.name';
const TOAST_MS = 5000;
const COLORS = ['#0b6bcb', '#1a7346', '#9a5700', '#6b4bc4', '#b3261e'];

function readName(fallback: string): string {
  try {
    return window.localStorage.getItem(NAME_KEY) || fallback;
  } catch {
    return fallback;
  }
}

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

type Dialog = { card: CanvasCard | null; column: ColumnId } | null;

export function App({ services = defaultServices }: { services?: Services }) {
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [boardId, setBoardId] = useState('');
  const [state, dispatch] = useReducer(boardReducer, emptyState);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [retryInMs, setRetryInMs] = useState<number | undefined>();
  const [name, setName] = useState(() => readName(services.defaultName));
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [session, setSession] = useState(0);

  const conn = useRef<Connection | null>(null);
  const live = useRef({ boardId, name });
  live.current = { boardId, name };
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const join = useCallback(() => {
    const { boardId: id, name: who } = live.current;
    if (id) conn.current?.send({ type: 'join_board', board_id: id, user_name: who, color: colorFor(who) });
  }, []);

  useEffect(() => {
    let cancelled = false;
    services
      .loadBoards()
      .then((list) => {
        if (cancelled) return;
        setBoards(list);
        setBoardId((current) => current || list[0]?.id || '');
      })
      .catch(() => say('Could not load the board list.'));
    return () => {
      cancelled = true;
    };
  }, [services, session, say]);

  useEffect(() => {
    const c = services.connect({
      onMessage: (msg: ServerWsMessage) => {
        if (msg.type === 'error') {
          say(msg.message);
          join();
          return;
        }
        dispatch({ kind: 'server', msg });
      },
      onStatus: (s, retry) => {
        setStatus(s);
        setRetryInMs(retry);
      },
    });
    conn.current = c;
    return () => {
      c.close();
      conn.current = null;
    };
  }, [services, session, say, join]);

  // Join on every (re)connect and whenever the board or the name changes.
  useEffect(() => {
    if (status === 'open' && boardId) join();
  }, [status, boardId, name, session, join]);

  const me = state.userName ?? name;

  const move = (id: string, column: ColumnId, index: number) => {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return;
    dispatch({ kind: 'move', id, column, index });
    conn.current?.send({ type: 'card_move', id, column, index, version: card.version });
  };

  const keyMove = (id: string, key: MoveKey) => {
    const target = planKeyMove(state.cards, id, key);
    const card = state.cards.find((c) => c.id === id);
    if (!target || !card) return;
    move(id, target.column, target.index);
    const title = COLUMNS.find((c) => c.id === target.column)?.title ?? target.column;
    say(`Moved "${card.title}" to ${title}, position ${target.index + 1}.`);
  };

  const openEdit = (card: CanvasCard) => {
    if (card.locked_by && card.locked_by !== me) {
      say(`${card.locked_by} is editing "${card.title}".`);
      return;
    }
    conn.current?.send({ type: 'card_lock', id: card.id });
    setDialog({ card, column: card.column });
  };

  const closeDialog = () => {
    if (dialog?.card) conn.current?.send({ type: 'card_unlock', id: dialog.card.id });
    setDialog(null);
  };

  const save = (draft: CardDraft) => {
    const card = dialog?.card;
    if (!card) {
      conn.current?.send({ type: 'card_create', title: draft.title, content: draft.content, column: draft.column });
      setDialog(null);
      return;
    }
    conn.current?.send({ type: 'card_update', id: card.id, title: draft.title, content: draft.content, version: card.version });
    if (draft.column !== card.column) {
      const size = state.cards.filter((c) => c.column === draft.column).length;
      move(card.id, draft.column, size);
    }
    closeDialog();
  };

  const remove = () => {
    if (dialog?.card) conn.current?.send({ type: 'card_delete', id: dialog.card.id });
    setDialog(null);
  };

  const rename = (next: string) => {
    try {
      window.localStorage.setItem(NAME_KEY, next);
    } catch {
      // Private mode: the name just lasts for this tab.
    }
    setName(next);
  };

  const reset = () => {
    services.reset?.();
    dispatch({ kind: 'clear' });
    setBoardId('');
    setDialog(null);
    setSession((n) => n + 1);
  };

  const boardInfo = state.board ?? boards.find((b) => b.id === boardId) ?? null;

  return (
    <>
      {services.isDemo && <DemoBar onReset={reset} />}
      <div className="container page">
        <Header
          boards={boards}
          boardId={boardId}
          onSelectBoard={setBoardId}
          onNewCard={() => setDialog({ card: null, column: 'backlog' })}
        />
        <PresenceStrip
          presences={state.presences}
          clientId={state.clientId}
          status={status}
          retryInMs={retryInMs}
          name={name}
          onRename={rename}
        />
        <main className="workspace">
          <div className="board-head">
            <h2>{boardInfo?.title ?? 'Board'}</h2>
            <p>{boardInfo?.description}</p>
            <span className="mono muted">{formatCount(state.cards.length, 'card')}</span>
          </div>
          <Board
            cards={state.cards}
            userName={me}
            onEdit={openEdit}
            onAdd={(column) => setDialog({ card: null, column })}
            onMove={move}
            onKeyMove={keyMove}
          />
          <ActivityRail entries={state.activity} open={activityOpen} onToggle={() => setActivityOpen((o) => !o)} />
        </main>
      </div>
      {dialog && (
        <CardDialog
          key={dialog.card?.id ?? 'new'}
          card={dialog.card}
          column={dialog.column}
          onSave={save}
          onDelete={remove}
          onClose={closeDialog}
        />
      )}
      <output className={toast ? 'toast toast-on' : 'toast'}>{toast}</output>
    </>
  );
}
