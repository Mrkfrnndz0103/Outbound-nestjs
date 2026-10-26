import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: ['**/e2e/**', '**/node_modules/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith('/src/lib/api.ts')) {
            return 'api';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.e2b.app', '.soc5outboundops.app', '.trycloudflare.com', 'localhost.lambdatest.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
