# SyncBoard 🎨⚡
> **Real-Time Collaborative Canvas, Live WebSocket Room Pub/Sub Engine & State Synchronization Platform**  
> *Engineered for High-Frequency Spatial Collaboration, Optimistic UI & Distributed Presence*

[![CI Pipeline](https://img.shields.io/badge/CI-Passing-10b981.svg?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?style=flat-square)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933.svg?style=flat-square)](#)
[![Database](https://img.shields.io/badge/Database-SQLite%20WAL%20(Native)-003B57.svg?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square)](#)
[![WebSocket](https://img.shields.io/badge/Protocol-WebSocket%20(ws)-010101.svg?style=flat-square)](#)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ed.svg?style=flat-square)](#)

---

## ⚡ 2-Minute Product Overview
**SyncBoard** is an enterprise-grade real-time collaborative whiteboard and sticky-note canvas. Designed with a custom bi-directional WebSocket room protocol, it powers multi-user spatial collaboration with sub-10ms peer synchronization, remote cursor tracking, optimistic Last-Write-Wins (LWW) conflict resolution, soft card locking, and durable SQLite WAL persistence.

### Core Capabilities
1. **Bi-Directional WebSocket Room Pub/Sub**: Native Node.js `ws` gateway grouping clients into isolated room channels (`boardId`). Dispatches live mutations across connected peers while suppressing sender echo.
2. **Real-Time Presence & Remote Cursors**: Streams high-frequency pointer vectors with user identity tags, color assignments, and automated 30-second stale heartbeat reaping.
3. **Optimistic Spatial Dragging & Conflict Guard**: Immediate 60fps local rendering with monotonic version checks and Last-Write-Wins (LWW) convergence. Includes soft card locking (`CARD_LOCK`) to prevent concurrent text edits.
4. **Native Relational Persistence**: Zero-external-dependency Node 24 `node:sqlite` database in Write-Ahead Logging (WAL) mode ensuring sub-millisecond snapshots and transactional state durability.
5. **Interactive Peer Simulator**: Built directly into the client interface so engineers can launch automated virtual peers ("Alice", "Bob") in one click to watch live cursor trajectories, card movements, and real-time color syncing without needing a second browser or device.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client ["Frontend (React 19 + TypeScript + Vite)"]
        UI[SyncBoard Workspace]
        Canvas[Infinite 2D Spatial Canvas]
        Presence[Peer Roster & Cursor Layer]
        Cards[Draggable Sticky Cards]
        Simulator[Virtual Peer Simulator]
        
        UI --> Canvas
        Canvas --> Cards
        Canvas --> Presence
        UI --> Simulator
    end

    subgraph Server ["Backend (Node.js 24 + Express + Native ws + SQLite WAL)"]
        HTTP[Express HTTP API /api]
        WS[WebSocket Engine /ws]
        RoomMgr[Room Pub/Sub Manager]
        BoardSvc[Board & Card Service]
        PresenceSvc[Presence & Heartbeat Tracker]
        
        HTTP --> BoardSvc
        WS --> RoomMgr
        RoomMgr --> PresenceSvc
        RoomMgr --> BoardSvc
    end

    subgraph Storage ["Relational Storage"]
        DB[(SQLite WAL Database)]
        B[boards]
        C[cards]
        
        BoardSvc --> B
        BoardSvc --> C
    end

    Canvas <-->|WebSocket Frames (ws://localhost:4000/ws)| WS
    Simulator <-->|Simulated Sockets| WS
    UI -->|REST Hydration /api/boards| HTTP
```

---

## 🚀 Quick Start (Zero-Config)

### Prerequisites
- Node.js 24+ (uses native `node:sqlite`)
- npm 10+

### Local Development
```bash
# 1. Clone repository
git clone https://github.com/Taan1el/syncboard.git
cd syncboard

# 2. Install workspace dependencies
npm install

# 3. Start backend server and frontend Vite dev server concurrently
npm run dev

# Backend & WebSocket runs at: http://localhost:4000
# Frontend runs at:           http://localhost:5173
```

### Running Automated Tests
```bash
# Run all unit and integration tests (17 passing, including live WebSocket tests)
npm test

# Run TypeScript type-checks and linting across workspaces
npm run lint

# Build production bundles
npm run build
```

### Docker Deployment
```bash
# Spin up production container with persistent SQLite volume
docker compose up --build
# Open http://localhost:4000 in your browser
```

---

## 📡 Protocol & REST API Reference

### WebSocket Message Protocol (`ws://localhost:4000/ws`)

| Action | Direction | Payload Description |
|---|---|---|
| `CLIENT_JOIN` | Client &rarr; Server | `{ boardId, user: { id, name, color } }` to subscribe to room |
| `ROOM_STATE` | Server &rarr; Client | Hydrated canvas cards and currently active peer roster |
| `CURSOR_MOVE` | Bi-directional | High-frequency `{ x, y }` spatial coordinates of the cursor |
| `CARD_CREATE` | Bi-directional | New card properties `{ id, title, content, color, x, y, width, height }` |
| `CARD_MOVE` | Bi-directional | Position mutation `{ id, x, y, version }` |
| `CARD_UPDATE` | Bi-directional | Text/color update `{ id, title, content, color, version }` |
| `CARD_LOCK` | Bi-directional | Soft-lock acquisition `{ id, lockedBy }` |
| `CARD_DELETE` | Bi-directional | Card removal `{ id }` |
| `PEER_JOINED` | Server &rarr; Client | Notification of new participant entering the room |
| `USER_LEFT` | Server &rarr; Client | Notification and cursor purge when peer disconnects |
| `HEARTBEAT` | Client &rarr; Server | Liveness ping to prevent timeout disconnection |

### REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Healthcheck and active timestamp |
| `GET` | `/api/boards` | List all available collaborative boards |
| `POST` | `/api/boards` | Create a new collaborative board |
| `GET` | `/api/boards/:id` | Retrieve board details and metadata |
| `GET` | `/api/boards/:id/cards` | Retrieve all persistent cards for a board |

---

## 📐 Architecture Decision Records (ADRs)

Detailed architectural rationale:
- [ADR 001: Native SQLite WAL and Relational Canvas Persistence](docs/adr/001-native-sqlite-wal-and-relational-canvas-persistence.md)
- [ADR 002: WebSocket Room Pub/Sub Protocol and Presence Heartbeat Tracking](docs/adr/002-websocket-room-pubsub-and-presence-heartbeat-protocol.md)
- [ADR 003: Optimistic UI Updates and Last-Write-Wins (LWW) Conflict Resolution](docs/adr/003-optimistic-ui-updates-and-last-write-wins-conflict-resolution.md)

---

## 🧪 Verification & Quality Checklist

- [x] **17 Automated Tests Passing** (11 backend integration tests with live WebSocket client connections + 6 React component tests).
- [x] **Zero External Database Overhead**: Powered by Node 24 native SQLite WAL mode.
- [x] **WebSocket Echo Suppression**: Room pub/sub broadcasts state only to other peers in the room.
- [x] **Full TypeScript Strict Compliance**: End-to-end type safety sharing `shared/types.ts` between client and server.
- [x] **Multi-Stage Docker & Compose**: Production container with health check and persistent data volume.
