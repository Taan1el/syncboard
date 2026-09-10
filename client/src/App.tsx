import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './services/api';
import {
  Board,
  CanvasCard,
  UserPresence,
  BoardMetrics,
  ServerWsMessage,
} from '../../shared/types';
import { BoardHeader } from './components/BoardHeader';
import { CollaborativeCanvas } from './components/CollaborativeCanvas';
import { BoardMetricsOverview } from './components/BoardMetricsOverview';
import { MultiPeerSimulator } from './components/MultiPeerSimulator';
import { CardEditorModal } from './components/CardEditorModal';
import './App.css';

// Random local user identity for current session
const RANDOM_COLORS = ['#38bdf8', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];
const RANDOM_NAMES = ['Developer Alex', 'Designer Mia', 'Product Lead Karl', 'Engineer Elena', 'Architect Toomas'];

const CURRENT_USER = {
  name: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)],
  color: RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)],
};

export const App: React.FC = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null);
  const [cards, setCards] = useState<CanvasCard[]>([]);
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [metrics, setMetrics] = useState<BoardMetrics>({
    total_boards: 0,
    total_cards: 0,
    active_connections: 0,
    total_mutations: 0,
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [cardToEdit, setCardToEdit] = useState<CanvasCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const wsClientRef = useRef<{ send: (msg: any) => void; close: () => void } | null>(null);
  const lastCursorSend = useRef<number>(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Load available boards and initial metrics
  const loadInitialData = useCallback(async () => {
    try {
      const [boardList, metricsData] = await Promise.all([api.getBoards(), api.getMetrics()]);
      setBoards(boardList);
      setMetrics(metricsData);

      if (boardList.length > 0 && !selectedBoardId) {
        setSelectedBoardId(boardList[0].id);
        setCurrentBoard(boardList[0]);
      }
    } catch (err) {
      console.error('Failed to load boards:', err);
    }
  }, [selectedBoardId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle WebSocket Room Lifecycle
  useEffect(() => {
    if (!selectedBoardId) return;

    // Disconnect existing socket if switching boards
    if (wsClientRef.current) {
      wsClientRef.current.close();
      wsClientRef.current = null;
    }

    const handleWsMessage = (msg: ServerWsMessage) => {
      switch (msg.type) {
        case 'board_sync': {
          setCurrentBoard(msg.board);
          setCards(msg.cards);
          // Filter out self from remote presences list
          setPresences(msg.presences.filter((p) => p.client_id !== msg.client_id));
          break;
        }

        case 'presence_update': {
          setPresences(msg.presences.filter((p) => p.user_name !== CURRENT_USER.name));
          break;
        }

        case 'card_created': {
          setCards((prev) => [...prev, msg.card]);
          showToast(`New card "${msg.card.title}" added by ${msg.card.updated_by}`);
          break;
        }

        case 'card_moved': {
          setCards((prev) =>
            prev.map((c) =>
              c.id === msg.id
                ? { ...c, x: msg.x, y: msg.y, version: msg.version, updated_by: msg.updated_by }
                : c
            )
          );
          break;
        }

        case 'card_updated': {
          setCards((prev) => prev.map((c) => (c.id === msg.card.id ? msg.card : c)));
          showToast(`Card "${msg.card.title}" updated by ${msg.card.updated_by}`);
          break;
        }

        case 'card_locked': {
          setCards((prev) =>
            prev.map((c) => (c.id === msg.id ? { ...c, locked_by: msg.locked_by } : c))
          );
          break;
        }

        case 'card_unlocked': {
          setCards((prev) =>
            prev.map((c) => (c.id === msg.id ? { ...c, locked_by: null } : c))
          );
          break;
        }

        case 'card_deleted': {
          setCards((prev) => prev.filter((c) => c.id !== msg.id));
          showToast('Card deleted from canvas');
          break;
        }

        case 'error': {
          alert(`Sync Error: ${msg.message}`);
          break;
        }
      }
    };

    const ws = api.createWebSocketConnection(
      selectedBoardId,
      CURRENT_USER.name,
      CURRENT_USER.color,
      handleWsMessage,
      setIsConnected
    );

    wsClientRef.current = ws;

    return () => {
      ws.close();
    };
  }, [selectedBoardId]);

  // Collaborative Actions
  const handleMoveCard = (id: string, x: number, y: number, version: number) => {
    // 1. Optimistic Local Update
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, x, y, version: c.version + 1 } : c))
    );

    // 2. Transmit through WebSocket to Room Peers
    wsClientRef.current?.send({
      type: 'card_move',
      id,
      x,
      y,
      version,
    });
  };

  const handleCursorMove = (x: number, y: number) => {
    const now = Date.now();
    // Throttle cursor broadcast to 40ms (~25 fps)
    if (now - lastCursorSend.current > 40) {
      lastCursorSend.current = now;
      wsClientRef.current?.send({
        type: 'cursor_move',
        x,
        y,
      });
    }
  };

  const handleToggleLock = (card: CanvasCard) => {
    if (card.locked_by === CURRENT_USER.name) {
      wsClientRef.current?.send({ type: 'card_unlock', id: card.id });
    } else if (!card.locked_by) {
      wsClientRef.current?.send({ type: 'card_lock', id: card.id });
    }
  };

  const handleDeleteCard = (id: string) => {
    if (!confirm('Are you sure you want to delete this card?')) return;
    wsClientRef.current?.send({ type: 'card_delete', id });
  };

  const handleOpenEdit = (card: CanvasCard) => {
    setCardToEdit(card);
    setIsEditorModalOpen(true);
  };

  const handleOpenCreate = () => {
    setCardToEdit(null);
    setIsEditorModalOpen(true);
  };

  const handleSaveCard = (data: { title: string; content: string; color: string }) => {
    if (cardToEdit) {
      // Edit existing card
      wsClientRef.current?.send({
        type: 'card_update',
        id: cardToEdit.id,
        title: data.title,
        content: data.content,
        color: data.color,
        version: cardToEdit.version,
      });
    } else {
      // Create new card
      wsClientRef.current?.send({
        type: 'card_create',
        title: data.title,
        content: data.content,
        color: data.color,
        x: Math.floor(80 + Math.random() * 260),
        y: Math.floor(80 + Math.random() * 180),
      });
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <BoardHeader
        board={currentBoard}
        boards={boards}
        presences={presences}
        isConnected={isConnected}
        currentUser={CURRENT_USER}
        onSelectBoard={setSelectedBoardId}
        onOpenCreateCard={handleOpenCreate}
      />

      {/* Toast */}
      {toast && <div className="toast-notification">{toast}</div>}

      <main className="dashboard-content">
        {/* Real-time KPI Stats */}
        <BoardMetricsOverview
          metrics={{ ...metrics, total_cards: cards.length }}
          onlineCount={presences.length + 1}
          isConnected={isConnected}
        />

        {/* Multi-Peer Bot Simulator */}
        <MultiPeerSimulator
          cards={cards}
          boardId={selectedBoardId}
          onRefresh={loadInitialData}
        />

        {/* Real-Time Interactive Canvas */}
        <div className="canvas-wrapper-card">
          <div className="canvas-header-bar">
            <span className="canvas-status-tag">
              ⚡ Drag sticky notes to test real-time optimistic sync & conflict resolution
            </span>
            <span className="collaborators-count">
              {presences.length + 1} User{presences.length > 0 ? 's' : ''} in Room
            </span>
          </div>

          <CollaborativeCanvas
            cards={cards}
            presences={presences}
            currentUserName={CURRENT_USER.name}
            onMoveCard={handleMoveCard}
            onEditCard={handleOpenEdit}
            onToggleLock={handleToggleLock}
            onDeleteCard={handleDeleteCard}
            onCursorMove={handleCursorMove}
          />
        </div>
      </main>

      {/* Card Editor / Creator Modal */}
      <CardEditorModal
        isOpen={isEditorModalOpen}
        cardToEdit={cardToEdit}
        onClose={() => setIsEditorModalOpen(false)}
        onSave={handleSaveCard}
      />
    </div>
  );
};
