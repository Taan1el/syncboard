# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Automated accessibility tests (axe, WCAG 2 A and AA rules) for the board, the edit and new card dialogs and the activity rail, plus a check that every drag handle has a name and works from the keyboard. Color contrast is verified outside jsdom. The checks found no violations in the current UI, so no product code changed.

## [1.0.0] - 2026-10-02

### Added
- Kanban boards with four columns (Backlog, In progress, In review, Done), replacing the free-form x/y canvas of the first commits. Cards keep a dense position inside their column.
- Drag and drop between and within columns, plus arrow-key moves on each card's handle and a column select in the edit dialog.
- Card locks: opening a card locks it for other people, and closing the dialog, deleting the card or dropping the connection releases it. The server clears every lock when it starts.
- A presence strip showing who is on the board and who has a card open, and an activity feed with the last 30 changes (stored in SQLite).
- Frame validation with readable errors for unknown message types, long titles, bad column ids and malformed versions.
- `GET /api/boards/:id/activity`, and `POST /api/boards/:id/cards` now goes through the same rules and broadcasts to connected clients.
- Heartbeats every 15 seconds; the server closes connections that stay silent for 45 seconds.
- Reconnect with backoff (1 s up to 10 s) and a fresh board sync after every reconnect.
- A shared room hub (`shared/hub.ts`) used by the server, the tests and the browser demo, with an in-memory store.
- GitHub Pages demo that runs the hub in the browser with sample boards and three scripted collaborators, a demo bar and a "Reset sample data" control.
- Server tests for the board rules, validation, hub, REST routes, persistence across a restart and live WebSocket sessions; client tests with React Testing Library and fake timers.
- Pages workflow, a `build:pages` script, a CI matrix on Node 22 and 24 that also runs `build:pages`, and a Docker build job.
- MIT license, package metadata, `.env.example` files for the client and the server, and rewritten decision records.
- Self-hosted Epilogue, Karla and Inconsolata fonts and a new interface: columns under heavy rules, rows instead of cards, a presence strip and an activity rail.

### Fixed
- The Docker image started `server/dist/index.js`, which the build never produced. It now runs the compiled server and serves the built client.
- `.gitignore` only matched `data/*.db` at the repository root, while the server run through npm writes its database under `server/data`. The database file and its WAL files are now ignored everywhere.
- An old database from the free-form canvas version is detected through `PRAGMA user_version` and rebuilt instead of failing on the new card shape.
- A rejected move or edit now shows the server's message in the page and restores the server's version of the board, instead of a browser alert and a board that had drifted.
- The README no longer lists live cursors, sub-millisecond latency and 60 fps dragging, which the code never provided or measured.
