# ADR 002: WebSocket rooms, presence and heartbeats

## Status
Accepted

## Context
People on the same board should see moves, edits, locks and who else is present without reloading. The same room logic also has to run in the browser for the GitHub Pages demo, where there is no server.

## Decision
- Room logic lives in `shared/hub.ts` as a `Hub` class with no I/O. `hub.receive(clientId, frame)` returns a list of `{ to, msg }` deliveries; the caller sends them. The Node server wraps the Hub in `ws` sockets, the demo wraps it in plain function calls with three scripted collaborators.
- A connection joins one board with `join_board` and receives a `board_sync` (cards, presence, last 30 activity entries). Joining another board leaves the first.
- Every accepted operation is broadcast to everyone on the board, including the sender. The sender applies its own move optimistically first; applying the confirmation again is harmless.
- Frames are validated in `shared/validate.ts`. A bad frame gets an `error` frame to the sender only and changes nothing.
- Clients send a `heartbeat` every 15 seconds. The server closes connections that have sent nothing for 45 seconds, which releases their locks.
- Presence shows name, colour and whether the person has a card open. There are no live cursors.

## Consequences
- The server, the demo and the tests exercise one implementation of the rules.
- Presence and locks are in memory per process. After a server restart every lock is cleared and clients reconnect and receive a fresh `board_sync`.
- Several servers behind a load balancer would need a shared bus for broadcasts. That is not built.
