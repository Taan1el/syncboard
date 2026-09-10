import React from 'react';
import { BoardMetrics } from '../../../shared/types';

interface BoardMetricsOverviewProps {
  metrics: BoardMetrics;
  onlineCount: number;
  isConnected: boolean;
}

export const BoardMetricsOverview: React.FC<BoardMetricsOverviewProps> = ({
  metrics,
  onlineCount,
  isConnected,
}) => {
  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <span className="metric-label">Canvas Cards</span>
        <span className="metric-value text-accent">{metrics.total_cards}</span>
        <span className="metric-sub">Synchronized sticky nodes</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Online Collaborators</span>
        <span className="metric-value text-success">{onlineCount}</span>
        <span className="metric-sub">Active WebSocket room peers</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">State Mutations</span>
        <span className="metric-value text-purple">{metrics.total_mutations}</span>
        <span className="metric-sub">Move & edit sync events</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Sync Protocol</span>
        <div className="protocol-status">
          <span className={`status-pill ${isConnected ? 'pill-connected' : 'pill-disconnected'}`}>
            {isConnected ? '● WebSocket Live' : '○ Reconnecting...'}
          </span>
        </div>
        <span className="metric-sub">Sub-millisecond pub/sub broadcast</span>
      </div>
    </div>
  );
};
