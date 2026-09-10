import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../App';
import { Board, CanvasCard, BoardMetrics } from '../../../shared/types';

const mockBoard: Board = {
  id: 'b-1',
  title: 'Sprint 42 Architecture & Reliability Board',
  description: 'Collaborative planning canvas',
  created_at: '2026-09-10T10:00:00Z',
  updated_at: '2026-09-10T10:00:00Z',
};

const mockCards: CanvasCard[] = [
  {
    id: 'c-1',
    board_id: 'b-1',
    title: 'SEPA Instant Settlement Gateway',
    content: 'Integrate instant EUR payment rail with real-time idempotency.',
    color: '#bae6fd',
    x: 60,
    y: 80,
    width: 240,
    height: 150,
    version: 1,
    locked_by: null,
    updated_by: 'Laura Tamm',
    updated_at: '2026-09-10T10:00:00Z',
  },
  {
    id: 'c-2',
    board_id: 'b-1',
    title: 'Kubernetes Ingress Rate Limiting',
    content: 'Deploy token bucket middleware at ingress layer.',
    color: '#fef08a',
    x: 320,
    y: 80,
    width: 240,
    height: 150,
    version: 2,
    locked_by: null,
    updated_by: 'Sander Sepp',
    updated_at: '2026-09-10T10:00:00Z',
  },
];

const mockMetrics: BoardMetrics = {
  total_boards: 1,
  total_cards: 2,
  active_connections: 1,
  total_mutations: 14,
};

class MockWebSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    setTimeout(() => {
      this.onopen?.();
      // Emulate initial sync
      this.onmessage?.({
        data: JSON.stringify({
          type: 'board_sync',
          board: mockBoard,
          cards: mockCards,
          presences: [
            {
              client_id: 'remote-1',
              user_name: 'Erik Kallas',
              color: '#10b981',
              cursor_x: 240,
              cursor_y: 180,
              last_seen: '2026-09-10T10:00:00Z',
            },
          ],
          client_id: 'local-self',
        }),
      });
    }, 10);
  }

  send = vi.fn();
  close = vi.fn();
}

describe('SyncBoard Collaborative Canvas Client Component', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/boards')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [mockBoard] }) });
        }
        if (url.includes('/api/metrics')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockMetrics }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      })
    );
  });

  it('renders application header title and active board', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /SyncBoard/i })).toBeInTheDocument();
    expect(screen.getByText(/Real-Time WebSocket Collaborative Canvas/i)).toBeInTheDocument();
  });

  it('renders board metrics overview cards', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Canvas Cards')).toBeInTheDocument();
      expect(screen.getByText('Online Collaborators')).toBeInTheDocument();
      expect(screen.getByText('State Mutations')).toBeInTheDocument();
    });
  });

  it('renders sticky notes on the collaborative canvas', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('SEPA Instant Settlement Gateway')).toBeInTheDocument();
      expect(screen.getByText('Kubernetes Ingress Rate Limiting')).toBeInTheDocument();
      expect(screen.getByText(/Deploy token bucket middleware/i)).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
    });
  });

  it('renders remote peer in avatar stack and on canvas cursor list', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Erik Kallas').length).toBeGreaterThan(0);
    });
  });

  it('renders multi-peer simulator test buttons', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Simulate Peer Card Move/i)).toBeInTheDocument();
      expect(screen.getByText(/Simulate Remote Cursor/i)).toBeInTheDocument();
    });
  });

  it('opens card creation modal on button click', async () => {
    render(<App />);

    const addBtn = screen.getByRole('button', { name: /\+ Add Card/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Create New Sticky Card')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e\.g\. Distributed Consensus Engine/i)).toBeInTheDocument();
    });
  });
});
