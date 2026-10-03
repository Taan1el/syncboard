import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { App } from '../App';
import { createDemoServices } from '../services/demo';
import { check } from './axe';

expect.extend(matchers);

declare module 'vitest' {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function setup() {
  const user = userEvent.setup({ delay: null });
  const { container } = render(<App services={createDemoServices()} />);
  await flush();
  return { user, container };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('accessibility', () => {
  it('has no violations on the board', async () => {
    const { container } = await setup();
    expect(await check(container)).toHaveNoViolations();
  });

  it('gives every drag handle an accessible name and a keyboard move', async () => {
    const { user } = await setup();
    const handles = screen.getAllByRole('button', { name: /^Move "/ });
    expect(handles).toHaveLength(9);
    handles[0].focus();
    await user.keyboard('{ArrowRight}');
    await flush();
    expect(screen.getByText(/^Moved ".*" to In progress/)).toBeInTheDocument();
  });

  it('has no violations in the edit card dialog', async () => {
    const { user, container } = await setup();
    await user.click(screen.getByRole('button', { name: 'Write the changelog' }));
    expect(screen.getByRole('dialog', { name: 'Edit card' })).toBeInTheDocument();
    expect(await check(container)).toHaveNoViolations();
  });

  it('has no violations in the new card dialog', async () => {
    const { user, container } = await setup();
    await user.click(screen.getByRole('button', { name: 'New card' }));
    expect(await check(container)).toHaveNoViolations();
  });

  it('has no violations with the activity rail open', async () => {
    const { user, container } = await setup();
    await user.click(screen.getByRole('button', { name: 'Add card to In review' }));
    await user.type(screen.getByLabelText('Title'), 'Check the mobile layout');
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    await flush();
    await user.click(screen.getByRole('button', { name: /^Show activity/ }));
    expect(screen.getByRole('button', { name: 'Hide activity' })).toHaveAttribute('aria-expanded', 'true');
    expect(await check(container)).toHaveNoViolations();
  });
});
