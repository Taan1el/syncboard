# ADR 002: WebSocket Room Pub/Sub Protocol and Presence Heartbeat Tracking

## Status
Accepted

## Context
Interactive multi-user canvas applications require bi-directional streaming for:
- Live cursor movements with high frequency and minimal overhead.
- Peer join/leave lifecycle notifications and real-time active user rosters.
- Card state mutations (creation, dragging, text editing, deletion, locking) broadcasted instantly to all other clients in the same workspace room.
- Heartbeat detection to cleanly purge stale peer cursors and presence avatars when clients unexpectedly disconnect or experience network partitions.

## Decision
1. **Lightweight WebSocket Engine (`ws`) with Room Pub/Sub**:
   - Utilize native Node.js HTTP upgrade to WebSocket protocol (`/ws`).
   - Group connected clients into virtual room channels (`boardId`).
   - Route incoming peer messages (`CLIENT_JOIN`, `CURSOR_MOVE`, `CARD_CREATE`, `CARD_MOVE`, `CARD_UPDATE`, `CARD_DELETE`, `CARD_LOCK`) strictly to other active subscribers in that room, omitting the sender to prevent echo feedback loops.

2. **Ephemeral Presence and Cursor Tracking**:
   - Store active client presence (`userId`, `userName`, `color`, `cursorX`, `cursorY`, `lastHeartbeat`) in memory keyed by room.
   - Run a periodic 30-second stale peer cleaner that removes inactive sockets and broadcasts updated peer lists.
   - On connection teardown (socket close/error), immediately notify remaining room participants with a `USER_LEFT` event and release any card locks owned by that user.

## Consequences
- **Positive**: Direct sub-10ms peer synchronization with zero polling latency and minimal bandwidth consumption compared to REST polling or Server-Sent Events.
- **Positive**: Clean separation between ephemeral volatile events (cursor movements) and durable persisted events (card creations, position saves).
- **Trade-off**: In a distributed multi-server cluster, a Redis Pub/Sub adapter would be introduced to bridge room broadcasts across node boundaries.
