import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'], coverage: { provider: 'v8', reporter: ['text', 'html'] } },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
