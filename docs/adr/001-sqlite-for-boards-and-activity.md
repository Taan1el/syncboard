# ADR 001: SQLite for boards, cards and activity

## Status
Accepted

## Context
SyncBoard needs boards, cards and an activity feed to survive a server restart, and it should start with `npm run dev` without a separate database to install. Writes are small and come from one Node process.

## Decision
- Use the `node:sqlite` module that ships with Node 22.13 and later (it is still marked experimental), opened in WAL mode with foreign keys on.
- Three tables: `boards`, `cards` and `mutation_audit`. A card row stores its column, its position inside the column, a version counter, the name of whoever holds its lock and who changed it last.
- Every operation runs in one transaction: the changed card rows and the activity row are written together or not at all.
- The schema carries `PRAGMA user_version`. The first version stored free-form x/y cards; opening a database with an older version drops the tables and seeds the sample boards again. There is no data migration.
- The file is `data/syncboard.db` under the working directory, or the path in `SYNCBOARD_DB`. Tests use `:memory:`.

## Consequences
- Nothing to install, and the test suite runs against throwaway in-memory databases.
- One process owns the file. Running two server instances against the same file would give each its own presence and lock state, so the design is single node.
- The experimental module can change between Node releases. CI runs Node 22 and 24 to catch that early.
