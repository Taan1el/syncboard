import type { ActivityEntry, Board, CanvasCard, ColumnId } from './types.js';

export const DEFAULT_BOARD_ID = 'board-release';
export const DOCS_BOARD_ID = 'board-docs';

const STAMP = '2026-10-01T09:00:00.000Z';

export function sampleBoards(): Board[] {
  return [
    {
      id: DEFAULT_BOARD_ID,
      title: 'Release 1.0',
      description: 'What is left before the first tagged release.',
      created_at: STAMP,
      updated_at: STAMP,
    },
    {
      id: DOCS_BOARD_ID,
      title: 'Docs and site',
      description: 'Writing and screenshots for the public pages.',
      created_at: STAMP,
      updated_at: STAMP,
    },
  ];
}

type Seed = [id: string, title: string, content: string, column: ColumnId, by: string];

const RELEASE_CARDS: Seed[] = [
  ['rel-1', 'Write the changelog', 'List what was added and fixed since the first commit, checked against git log.', 'backlog', 'Mari'],
  ['rel-2', 'Pin the Node version in CI', 'Run the matrix on Node 22 and 24 and keep the engines field in step.', 'backlog', 'Karl'],
  ['rel-3', 'Rate limit card creation', 'One client can create cards as fast as it can send frames. Cap it per connection.', 'backlog', 'Mari'],
  ['rel-4', 'Release locks when a socket drops', 'A closed tab must not leave a card locked for everyone else.', 'doing', 'Karl'],
  ['rel-5', 'Reconnect with backoff', 'Retry after 1 s, then double up to 10 s, and rejoin the board on every reconnect.', 'doing', 'Liis'],
  ['rel-6', 'Keyboard moves for cards', 'Arrow keys on the drag handle move a card between and within columns.', 'review', 'Liis'],
  ['rel-7', 'Activity feed', 'Show the last 30 changes with who made them, newest first.', 'review', 'Mari'],
  ['rel-8', 'Persist boards in SQLite', 'Cards and activity survive a server restart.', 'done', 'Karl'],
  ['rel-9', 'Validate every frame', 'Reject unknown message types, long titles and bad column ids with a readable error.', 'done', 'Liis'],
];

const DOCS_CARDS: Seed[] = [
  ['doc-1', 'Explain the conflict rules', 'Say plainly that the last write wins and that a lock blocks other people.', 'backlog', 'Mari'],
  ['doc-2', 'Add a protocol table', 'One row per frame with direction and payload.', 'doing', 'Liis'],
  ['doc-3', 'Take desktop screenshots', 'Board, edit dialog and mobile view.', 'review', 'Karl'],
  ['doc-4', 'Describe the Docker setup', 'Single container, one volume for the database file.', 'done', 'Karl'],
];

export function sampleCards(): CanvasCard[] {
  const out: CanvasCard[] = [];
  const counts: Record<string, number> = {};
  const add = (boardId: string, seeds: Seed[]) => {
    for (const [id, title, content, column, by] of seeds) {
      const key = `${boardId}:${column}`;
      const position = counts[key] ?? 0;
      counts[key] = position + 1;
      out.push({
        id,
        board_id: boardId,
        title,
        content,
        column,
        position,
        version: 1,
        locked_by: null,
        updated_by: by,
        updated_at: STAMP,
      });
    }
  };
  add(DEFAULT_BOARD_ID, RELEASE_CARDS);
  add(DOCS_BOARD_ID, DOCS_CARDS);
  return out;
}

export function sampleActivity(): ActivityEntry[] {
  const rows: [string, string, ActivityEntry['action'], string, string, string, string][] = [
    ['act-3', 'rel-7', 'card.moved', 'Mari', 'Activity feed', 'review', '2026-10-01T09:42:00.000Z'],
    ['act-2', 'rel-8', 'card.moved', 'Karl', 'Persist boards in SQLite', 'done', '2026-10-01T09:30:00.000Z'],
    ['act-1', 'rel-5', 'card.created', 'Liis', 'Reconnect with backoff', 'backlog', '2026-10-01T09:05:00.000Z'],
  ];
  return rows.map(([id, card_id, action, actor_name, card_title, detail, created_at]) => ({
    id,
    board_id: DEFAULT_BOARD_ID,
    card_id,
    action,
    actor_name,
    card_title,
    detail,
    created_at,
  }));
}
