import React, { useState } from 'react';
import { CanvasCard } from '../../../shared/types';

interface MultiPeerSimulatorProps {
  cards: CanvasCard[];
  boardId: string;
  onRefresh: () => void;
}

export const MultiPeerSimulator: React.FC<MultiPeerSimulatorProps> = ({
  cards,
  boardId,
  onRefresh,
}) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [logMessage, setLogMessage] = useState<string | null>(null);

  const simulateRemotePeer = (
    peerName: string,
    color: string,
    actionFn: (ws: WebSocket) => void
  ) => {
    setIsSimulating(true);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join_board',
          board_id: boardId,
          user_name: peerName,
          color,
        })
      );

      setTimeout(() => {
        actionFn(ws);
        setTimeout(() => {
          ws.close();
          setIsSimulating(false);
          onRefresh();
        }, 1200);
      }, 300);
    };

    ws.onerror = () => {
      setIsSimulating(false);
    };
  };

  const handleSimulateMove = () => {
    if (cards.length === 0) return;
    const target = cards[0];
    const newX = target.x + (Math.random() > 0.5 ? 40 : -40);
    const newY = target.y + (Math.random() > 0.5 ? 40 : -40);

    setLogMessage(`Collaborator 'Kaspar' moving card "${target.title}" via WebSocket...`);
    simulateRemotePeer('Kaspar Kuus', '#10b981', (ws) => {
      ws.send(
        JSON.stringify({
          type: 'card_move',
          id: target.id,
          x: Math.max(30, newX),
          y: Math.max(30, newY),
          version: target.version,
        })
      );
    });
  };

  const handleSimulateCursor = () => {
    setLogMessage("Collaborator 'Liis' transmitting real-time mouse trajectory...");
    simulateRemotePeer('Liis Tamm', '#f59e0b', (ws) => {
      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        const x = 200 + Math.sin(step * 0.5) * 150;
        const y = 150 + Math.cos(step * 0.5) * 80;
        ws.send(JSON.stringify({ type: 'cursor_move', x: Math.round(x), y: Math.round(y) }));
        if (step > 8) clearInterval(interval);
      }, 80);
    });
  };

  const handleSimulateNewCard = () => {
    setLogMessage("Collaborator 'Markus' adding real-time architecture card...");
    simulateRemotePeer('Markus Sepp', '#a855f7', (ws) => {
      ws.send(
        JSON.stringify({
          type: 'card_create',
          title: `Telemetry Pipeline Refactor #${Math.floor(Math.random() * 100)}`,
          content: 'Migrate WebSocket buffer to binary ArrayBuffer stream for 4x throughput.',
          color: '#e9d5ff',
          x: Math.floor(60 + Math.random() * 300),
          y: Math.floor(100 + Math.random() * 200),
        })
      );
    });
  };

  return (
    <div className="card simulator-card">
      <div className="card-header">
        <div>
          <h3>Multi-Peer Real-Time Collaboration Sandbox</h3>
          <p className="subtitle">
            Simulate concurrent remote teammates editing, moving cards, and transmitting cursors via WebSocket rooms
          </p>
        </div>
        <div className="simulator-buttons">
          <button
            className="btn btn-outline-success btn-sm"
            onClick={handleSimulateMove}
            disabled={isSimulating || cards.length === 0}
          >
            👥 Simulate Peer Card Move
          </button>
          <button
            className="btn btn-outline-warning btn-sm"
            onClick={handleSimulateCursor}
            disabled={isSimulating}
          >
            🖱️ Simulate Remote Cursor
          </button>
          <button
            className="btn btn-outline-purple btn-sm"
            onClick={handleSimulateNewCard}
            disabled={isSimulating}
          >
            ➕ Peer Post Sticky Note
          </button>
        </div>
      </div>

      {logMessage && (
        <div className="simulator-log">
          <span className="pulse-dot" />
          <span>{logMessage}</span>
        </div>
      )}
    </div>
  );
};
