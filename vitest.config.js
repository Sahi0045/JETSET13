import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'resources/js'),
    },
  },
});
