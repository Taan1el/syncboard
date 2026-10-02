/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run build:pages` builds with --mode pages: assets are served from
// /syncboard/ on GitHub Pages and the client runs the in-browser demo instead
// of connecting to the server.
export default defineConfig(({ mode }) => {
  const isPagesBuild = mode === 'pages';
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    base: isPagesBuild ? '/syncboard/' : '/',
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(isPagesBuild ? 'true' : 'false'),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/ws': { target: target.replace(/^http/, 'ws'), ws: true },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
