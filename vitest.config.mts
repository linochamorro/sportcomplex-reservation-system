import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./app/__tests__/setup.ts'],
    testTimeout: 20000,
    // Las suites vivas comparten la BD remota (pooler Supabase): en serie
    // evitan saturar el pool y los timeouts intermitentes.
    fileParallelism: false,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 70,
        statements: 70,
        branches: 60,
        functions: 60,
      },
    },
  },
});
