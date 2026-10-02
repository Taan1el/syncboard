# ADR 003: Last write wins, with locks on cards being edited

## Status
Accepted

## Context
Two people can move or edit the same card at the same moment. The board should stay usable on a slow connection, and it should never silently lose a text edit someone is in the middle of typing.

## Decision
- Operations are applied in the order the server receives them. A move or an edit is never rejected because the sender's `version` is old. The later write wins and the card's version becomes `max(stored, sent) + 1`. The version is informational, it does not guard writes.
- Opening the edit dialog sends `card_lock`. While a card is locked, another person's move, edit or delete is rejected with a readable error and their screen is resynced with a fresh `board_sync`. The owner can still move or edit it.
- Closing the dialog, deleting the card or losing the connection releases the lock. Server start clears all locks.
- Moves are applied optimistically in the browser. If the server rejects one, the resync puts the card back.
- Positions inside a column are kept dense (0 to n-1). The server renumbers the affected columns on every move, create and delete.

## Consequences
- Simultaneous drags of one card end with whichever move arrived last. Nobody is told that they overwrote someone else, only the activity feed shows both moves.
- Edits are protected by the lock, but a lock is advisory in the sense that a person who never closes the dialog keeps it until their connection drops (up to 45 seconds after a silent disconnect).
- Edits made while the connection is down are not queued. The client shows "Reconnecting", and after it reconnects it rejoins the board and takes the server's state.
- Merging text edits character by character would need a CRDT or operational transform. It is not part of this project.
