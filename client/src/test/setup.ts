import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Testing Library only advances fake timers on its own when a `jest` global
// exists. Vitest has none, so expose the one method it needs.
Object.assign(globalThis, { jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) } });
