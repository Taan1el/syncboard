import { vi } from 'vitest';
import { configureAxe } from 'vitest-axe';

// WCAG 2 A and AA rules. jsdom computes no colors or layout, so color-contrast
// and region (full-page landmark) are off here; contrast is verified separately
// from computed values.
export const axe = configureAxe({
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

// axe schedules its work with timers, so run it on the real clock.
export async function check(container: Element) {
  vi.useRealTimers();
  return axe(container);
}
