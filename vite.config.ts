import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration for Divly.
 * In local development (`npm run dev`), Vite serves React on port 5173
 * and proxies all `/api/*` requests (including SSE `/api/events`) to Express on 3001.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
  },
});
