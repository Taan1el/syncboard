import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export function seedDatabase(db: DatabaseSync): void {
  const check = db.prepare('SELECT COUNT(*) as count FROM boards;').get() as { count: number };
  if (check.count > 0) return;

  const now = new Date().toISOString();
  const boardId = 'board-default';

  db.prepare(`
    INSERT INTO boards (id, title, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?);
  `).run(
    boardId,
    'Sprint 42 Architecture & Reliability Board',
    'Real-time collaborative planning canvas for Baltic engineering initiatives',
    now,
    now
  );

  const insertCard = db.prepare(`
    INSERT INTO cards (
      id, board_id, title, content, color, x, y, width, height, version, locked_by, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);
  `);

  insertCard.run(
    crypto.randomUUID(),
    boardId,
    'SEPA Instant Settlement Gateway',
    'Integrate instant EUR payment rail with real-time idempotency checks and ledger reconciliation.',
    '#bae6fd',
    50,
    60,
    240,
    150,
    1,
    'Laura Tamm',
    now
  );

  insertCard.run(
    crypto.randomUUID(),
    boardId,
    'Audit Hash Chain Verification Cron',
    'Automate nightly cryptographic SHA-256 block traversal to ensure zero ledger tampering.',
    '#e9d5ff',
    330,
    60,
    240,
    150,
    1,
    'Erik Kallas',
    now
  );

  insertCard.run(
    crypto.randomUUID(),
    boardId,
    'Kubernetes Ingress Rate Limiting',
    'Deploy sliding-window token bucket middleware at ingress layer to mitigate DDoS spikes.',
    '#fef08a',
    50,
    250,
    240,
    150,
    1,
    'Sander Sepp',
    now
  );

  insertCard.run(
    crypto.randomUUID(),
    boardId,
    'Zero-Downtime SQLite Replicated Backups',
    'Implement snapshot replication using WAL checkpoints for instant disaster recovery.',
    '#bbf7d0',
    330,
    250,
    240,
    150,
    1,
    'Maria Kukk',
    now
  );
}
