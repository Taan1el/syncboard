import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AppContext } from '../src/app.js';
import { DEFAULT_BOARD_ID } from '../../shared/sample.js';

let ctx: AppContext;

beforeEach(() => {
  ctx = createApp({ dbPath: ':memory:' });
});
afterEach(() => ctx.db.close());

describe('health and metrics', () => {
  it('reports health', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it('counts boards, cards, activity and connections', async () => {
    ctx.hub.connect('socket-1');
    const res = await request(ctx.app).get('/api/metrics');
    expect(res.body.data).toEqual({ total_boards: 2, total_cards: 13, active_connections: 1, total_mutations: 3 });
  });
});

describe('boards', () => {
  it('lists the seeded boards in creation order', async () => {
    const res = await request(ctx.app).get('/api/boards');
    expect(res.body.data.map((b: { id: string }) => b.id)).toEqual(['board-release', 'board-docs']);
  });

  it('does not seed when asked not to', () => {
    const empty = createApp({ dbPath: ':memory:', seed: false });
    expect(empty.boardService.listBoards()).toEqual([]);
    empty.db.close();
  });

  it('creates a board and trims the title', async () => {
    const res = await request(ctx.app).post('/api/boards').send({ title: '  Roadmap ', description: 'Next quarter' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Roadmap', description: 'Next quarter' });
    const again = await request(ctx.app).get(`/api/boards/${res.body.data.id}`);
    expect(again.body.data.title).toBe('Roadmap');
  });

  it.each([
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 42 }],
    ['title over 120 characters', { title: 'x'.repeat(121) }],
    ['non-string description', { title: 'ok', description: 5 }],
    ['description over 500 characters', { title: 'ok', description: 'y'.repeat(501) }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(ctx.app).post('/api/boards').send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('answers 404 for an unknown board and its sub-resources', async () => {
    for (const path of ['/api/boards/nope', '/api/boards/nope/cards', '/api/boards/nope/activity']) {
      const res = await request(ctx.app).get(path);
      expect(res.status).toBe(404);
    }
    const post = await request(ctx.app).post('/api/boards/nope/cards').send({ title: 'x' });
    expect(post.status).toBe(404);
  });

  it('answers 400 for malformed JSON and 404 for unknown API paths', async () => {
    const bad = await request(ctx.app).post('/api/boards').set('Content-Type', 'application/json').send('{"title":');
    expect(bad.status).toBe(400);
    const missing = await request(ctx.app).get('/api/nothing');
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
  });
});

describe('cards', () => {
  it('lists cards with column and position', async () => {
    const res = await request(ctx.app).get(`/api/boards/${DEFAULT_BOARD_ID}/cards`);
    expect(res.body.data).toHaveLength(9);
    expect(res.body.data[0]).toMatchObject({ board_id: DEFAULT_BOARD_ID, locked_by: null });
    expect(res.body.data.every((c: { column: string }) => ['backlog', 'doing', 'review', 'done'].includes(c.column))).toBe(true);
  });

  it('creates a card at the end of its column and records activity', async () => {
    const res = await request(ctx.app)
      .post(`/api/boards/${DEFAULT_BOARD_ID}/cards`)
      .send({ title: 'Tag the release', content: 'After CI is green.', column: 'review', updated_by: 'Ada' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ column: 'review', position: 2, version: 1, updated_by: 'Ada' });

    const activity = await request(ctx.app).get(`/api/boards/${DEFAULT_BOARD_ID}/activity`);
    expect(activity.body.data[0]).toMatchObject({ action: 'card.created', actor_name: 'Ada', card_title: 'Tag the release', detail: 'review' });
  });

  it('defaults to the backlog column and the API actor', async () => {
    const res = await request(ctx.app).post(`/api/boards/${DEFAULT_BOARD_ID}/cards`).send({ title: 'Plain' });
    expect(res.body.data).toMatchObject({ column: 'backlog', content: '', updated_by: 'API' });
  });

  it.each([
    ['missing title', { content: 'x' }],
    ['blank title', { title: ' ' }],
    ['long title', { title: 'x'.repeat(121) }],
    ['long content', { title: 'ok', content: 'x'.repeat(2001) }],
    ['unknown column', { title: 'ok', column: 'someday' }],
    ['blank author', { title: 'ok', updated_by: ' ' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(ctx.app).post(`/api/boards/${DEFAULT_BOARD_ID}/cards`).send(body);
    expect(res.status).toBe(400);
  });

  it('broadcasts REST-created cards to connected sockets', async () => {
    const sent: string[] = [];
    ctx.hub.connect('s1');
    ctx.hub.receive('s1', { type: 'join_board', board_id: DEFAULT_BOARD_ID, user_name: 'Ada', color: '#112233' });
    ctx.publisher.publish = (deliveries) => {
      for (const d of deliveries) if (d.to.includes('s1')) sent.push(d.msg.type);
    };
    await request(ctx.app).post(`/api/boards/${DEFAULT_BOARD_ID}/cards`).send({ title: 'Live' });
    expect(sent).toEqual(['card_created', 'activity']);
  });
});

describe('activity', () => {
  it('returns newest first and honours limit', async () => {
    const res = await request(ctx.app).get(`/api/boards/${DEFAULT_BOARD_ID}/activity?limit=2`);
    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual(['act-3', 'act-2']);
  });

  it('rejects a non-integer limit', async () => {
    const res = await request(ctx.app).get(`/api/boards/${DEFAULT_BOARD_ID}/activity?limit=abc`);
    expect(res.status).toBe(400);
  });
});
