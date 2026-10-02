import { createDemoServices } from './demo';
import { createWsServices } from './ws';
import type { Services } from './types';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

/** The Pages build runs the demo room in the browser, everything else talks to the server. */
export const defaultServices: Services = isDemoMode ? createDemoServices() : createWsServices();

export type { Services } from './types';
