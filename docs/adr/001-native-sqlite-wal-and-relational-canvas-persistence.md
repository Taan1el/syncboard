# ADR 001: Native SQLite WAL and Relational Canvas Persistence

## Status
Accepted

## Context
Real-time collaborative whiteboards and agile story mapping canvases demand low-latency reads, reliable persistence of board metadata and spatial card elements (coordinates, dimensions, colors, locks, versions), and transactional consistency. Traditional collaborative tools either store canvas state strictly in ephemeral memory (causing data loss on restart) or rely on complex document stores requiring external cluster setup.

For SyncBoard, we required:
1. Zero-dependency local developer execution (`npm run dev` running immediately without external databases or Docker containers).
2. Strict relational schema integrity for boards and card elements, foreign key cascading deletion, and sub-millisecond query latency.
3. Crash resilience and concurrent read/write support during high-frequency collaborative movements.

## Decision
1. **Node.js 24 Native `node:sqlite` with WAL Mode**:
   - Utilize Node.js's built-in `DatabaseSync` engine running in Write-Ahead Logging (`PRAGMA journal_mode = WAL;`).
   - Enforce relational constraints with `PRAGMA foreign_keys = ON;`.
   - Separate relational entities into `boards` (room metadata, dimensions, timestamps) and `cards` (spatial position, dimensions, color, content, locked status, optimistic version counter).

2. **Transactional State Mutations**:
   - Repository operations (`createCard`, `updateCardPosition`, `deleteCard`, `lockCard`) execute prepared statements with deterministic version increments.
   - Initial board state hydration loads all cards in a single relational join query during client WebSocket room subscription.

## Consequences
- **Positive**: Sub-millisecond snapshot queries and persistence with zero external infrastructure dependencies.
- **Positive**: Test suite runs against ephemeral `:memory:` SQLite instances with instant teardown and 100% test isolation.
- **Trade-off**: For horizontal multi-node scaling across server clusters, the SQLite layer can be substituted with PostgreSQL or replicated via Litestream/LiteFS.
