# ADR 003: Optimistic UI Updates and Last-Write-Wins (LWW) Conflict Resolution

## Status
Accepted

## Context
In collaborative visual workspaces, user interactions such as dragging sticky notes across the canvas or typing updates must feel instant and fluid. If the client waits for round-trip server acknowledgment before rendering local changes, user experience degrades noticeably with lag and jitter. Conversely, when multiple peers interact with identical elements concurrently, the system must prevent race conditions, reconcile conflicts deterministically, and prevent accidental overwrites.

## Decision
1. **Optimistic Local Rendering with Eventual Server Convergence**:
   - The React 19 frontend applies local drag offsets and state modifications immediately to the local UI state.
   - Concurrently, mutation payloads (`CARD_MOVE`, `CARD_UPDATE`) are dispatched via WebSocket with client timestamps and monotonic version numbers.

2. **Last-Write-Wins (LWW) with Monotonic Version Guard**:
   - Each card in SQLite contains an integer `version` and ISO `updated_at` timestamp.
   - When conflicting mutations arrive, the server validates timestamps and increments the version counter. The newest timestamp or higher version succeeds.
   - To safeguard against concurrent text editing collisions during critical tasks, users can acquire an exclusive soft-lock (`CARD_LOCK`) on a card, signaling other peers with an avatar indicator and disabling remote dragging until unlocked.

## Consequences
- **Positive**: Zero-latency local interactions for users, 60fps smooth canvas dragging, and deterministic state resolution across all connected peers.
- **Positive**: Prevents ghost updates and handles temporary network spikes gracefully without desynchronization.
- **Trade-off**: For complex collaborative rich-text formatting within a single card, CRDTs (Conflict-free Replicated Data Types like Yjs or Automerge) would provide character-level character merging, which can be layered onto this protocol as requirements expand.
