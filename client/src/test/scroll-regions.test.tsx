import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from '../App';
import { createDemoServices } from '../services/demo';

const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8');

// Selectors of every rule that can scroll its content, read from the stylesheet
// because jsdom cannot measure scrolling.
function scrollSelectors(): string[] {
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(rule)) {
    if (/overflow(-x|-y)?\s*:\s*(auto|scroll)/.test(m[2])) {
      for (const s of m[1].split(',')) out.push(s.trim());
    }
  }
  return out;
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function expectReachable(root: HTMLElement) {
  const selectors = scrollSelectors();
  expect(selectors.length).toBeGreaterThan(0);
  for (const el of root.querySelectorAll<HTMLElement>(selectors.join(','))) {
    const named = (el.getAttribute('aria-label') ?? '').trim() !== '' || el.hasAttribute('aria-labelledby');
    const region = el.getAttribute('role') === 'region' && el.getAttribute('tabindex') === '0' && named;
    // A named dialog that holds focusable controls is already keyboard reachable.
    const dialog = el.getAttribute('role') === 'dialog' && named && el.querySelector(FOCUSABLE) !== null;
    expect(region || dialog, `scroll container ${el.className} is not keyboard reachable`).toBe(true);
  }
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('scrollable regions', () => {
  it('keeps every scroll container reachable by keyboard in each main view', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(<App services={createDemoServices()} />);
    await flush();
    expectReachable(container);

    await user.click(screen.getByRole('button', { name: 'New card' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expectReachable(container);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Write the changelog' }));
    expect(screen.getByRole('dialog', { name: 'Edit card' })).toBeInTheDocument();
    expectReachable(container);
  });
});
