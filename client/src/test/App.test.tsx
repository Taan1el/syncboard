import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createDemoServices, TICK_MS } from '../services/demo';
import type { ConnectHandlers, Services } from '../services/types';
import type { ClientWsMessage } from '../../../shared/types';

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function setup(services: Services = createDemoServices()) {
  const user = userEvent.setup({ delay: null });
  render(<App services={services} />);
  await flush();
  return { user, services };
}

const column = (name: string) => within(screen.getByRole('region', { name }));

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('demo board', () => {
  it('shows the demo bar, the sample cards and the collaborators', async () => {
    await setup();
    expect(screen.getByText('Demo: everything runs in your browser with sample data.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Release 1.0' })).toBeInTheDocument();
    expect(column('Backlog').getByText('Write the changelog')).toBeInTheDocument();
    expect(column('Done').getByText('Persist boards in SQLite')).toBeInTheDocument();
    expect(screen.getByText('4 people here')).toBeInTheDocument();
    expect(screen.getByText('Mari')).toBeInTheDocument();
    expect(screen.getByText('You (you)')).toBeInTheDocument();
    expect(screen.getByText('9 cards')).toBeInTheDocument();
  });

  it('adds a card to the chosen column and lists it in the activity feed', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Add card to In review' }));
    const dialog = within(screen.getByRole('dialog', { name: 'New card' }));
    await user.type(dialog.getByLabelText('Title'), 'Check the mobile layout');
    await user.click(dialog.getByRole('button', { name: 'Add card' }));
    await flush();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(column('In review').getByText('Check the mobile layout')).toBeInTheDocument();
    expect(screen.getByText('You added "Check the mobile layout" to In review')).toBeInTheDocument();
  });

  it('does not submit a card without a title', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'New card' }));
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument();
    expect(screen.getByText('9 cards')).toBeInTheDocument();
  });

  it('moves a card with the arrow keys on its handle', async () => {
    const { user } = await setup();
    const handle = screen.getByRole('button', { name: /Move "Write the changelog"/ });
    handle.focus();
    await user.keyboard('{ArrowRight}');
    await flush();

    expect(column('Backlog').queryByText('Write the changelog')).not.toBeInTheDocument();
    expect(column('In progress').getByText('Write the changelog')).toBeInTheDocument();
    expect(screen.getByText('You moved "Write the changelog" to In progress')).toBeInTheDocument();
    expect(screen.getByText('Moved "Write the changelog" to In progress, position 1.')).toBeInTheDocument();
  });

  it('keeps a card in place when an arrow key has nowhere to go', async () => {
    const { user } = await setup();
    const handle = screen.getByRole('button', { name: /Move "Write the changelog"/ });
    handle.focus();
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    expect(column('Backlog').getByText('Write the changelog')).toBeInTheDocument();
    expect(screen.queryAllByText(/^You moved/)).toHaveLength(0);
  });

  it('edits a card, holding the lock only while the dialog is open', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Write the changelog' }));
    expect(screen.getByText('You are editing')).toBeInTheDocument();

    const dialog = within(screen.getByRole('dialog', { name: 'Edit card' }));
    const title = dialog.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Write the release notes');
    await user.click(dialog.getByRole('button', { name: 'Save card' }));
    await flush();

    expect(column('Backlog').getByText('Write the release notes')).toBeInTheDocument();
    expect(screen.queryByText('You are editing')).not.toBeInTheDocument();
    expect(screen.getByText('You edited "Write the release notes"')).toBeInTheDocument();
  });

  it('releases the lock when the dialog is cancelled', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Write the changelog' }));
    await user.keyboard('{Escape}');
    await flush();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('You are editing')).not.toBeInTheDocument();
  });

  it('deletes a card only after a second confirmation', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Write the changelog' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Delete card' }));
    expect(screen.getByText('9 cards')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Delete for everyone' }));
    await flush();

    expect(screen.queryByText('Write the changelog', { selector: 'button' })).not.toBeInTheDocument();
    expect(screen.getByText('8 cards')).toBeInTheDocument();
  });

  it('shows a card locked by a collaborator and refuses to open it', async () => {
    const { user } = await setup();
    await flush(TICK_MS);
    const note = screen.getAllByText(/ is editing$/)[0];
    expect(note).toBeInTheDocument();

    const row = note.closest('li') as HTMLElement;
    const title = within(row).getAllByRole('button')[1];
    expect(title).toBeDisabled();
    await user.click(title).catch(() => undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches boards', async () => {
    const { user } = await setup();
    await user.selectOptions(screen.getByLabelText('Board'), 'Docs and site');
    await flush();
    expect(screen.getByRole('heading', { name: 'Docs and site' })).toBeInTheDocument();
    expect(column('Backlog').getByText('Explain the conflict rules')).toBeInTheDocument();
    expect(screen.getByText('4 cards')).toBeInTheDocument();
  });

  it('applies a new name to the room', async () => {
    const { user } = await setup();
    const input = screen.getByLabelText('Your name');
    await user.clear(input);
    await user.type(input, 'Toomas{Enter}');
    await flush();
    expect(screen.getByText('Toomas (you)')).toBeInTheDocument();
    expect(window.localStorage.getItem('syncboard.name')).toBe('Toomas');
  });

  it('restores the sample data on reset', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'New card' }));
    await user.type(screen.getByLabelText('Title'), 'Temporary card');
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    await flush();
    expect(screen.getByText('10 cards')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset sample data' }));
    await flush();
    expect(screen.getByText('9 cards')).toBeInTheDocument();
    expect(screen.queryByText('Temporary card')).not.toBeInTheDocument();
  });
});

describe('server mode', () => {
  function fakeServices() {
    const sent: ClientWsMessage[] = [];
    let handlers!: ConnectHandlers;
    const services: Services = {
      isDemo: false,
      defaultName: 'Guest',
      loadBoards: async () => [
        { id: 'b1', title: 'Board one', description: 'First', created_at: '', updated_at: '' },
      ],
      connect: (h) => {
        handlers = h;
        queueMicrotask(() => h.onStatus('open'));
        return { send: (m) => void sent.push(m), close: () => undefined };
      },
    };
    return { services, sent, handlers: () => handlers };
  }

  it('hides the demo bar and joins the first board once connected', async () => {
    const f = fakeServices();
    await setup(f.services);
    expect(screen.queryByText(/Demo:/)).not.toBeInTheDocument();
    expect(f.sent[0]).toMatchObject({ type: 'join_board', board_id: 'b1', user_name: 'Guest' });
  });

  it('shows the server message and asks for a fresh sync after an error', async () => {
    const f = fakeServices();
    await setup(f.services);
    const before = f.sent.length;
    act(() => f.handlers().onMessage({ type: 'error', message: 'Cannot move "X": Mari is editing it' }));
    expect(screen.getByText('Cannot move "X": Mari is editing it')).toBeInTheDocument();
    expect(f.sent.length).toBe(before + 1);
    expect(f.sent[before]).toMatchObject({ type: 'join_board' });

    await flush(5000);
    expect(screen.queryByText('Cannot move "X": Mari is editing it')).not.toBeInTheDocument();
  });

  it('rejoins the board after the connection comes back', async () => {
    const f = fakeServices();
    await setup(f.services);
    act(() => f.handlers().onStatus('reconnecting', 2000));
    expect(screen.getByText('Reconnecting in 2 seconds')).toBeInTheDocument();
    const before = f.sent.length;
    act(() => f.handlers().onStatus('open'));
    expect(f.sent.length).toBe(before + 1);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
