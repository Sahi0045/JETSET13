import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // Root-level coverage (spans all projects)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['backend/**/*.js', 'frontend/src/**/*.{js,jsx}'],
      exclude: ['node_modules', 'tests', 'dist', '**/*.config.*'],
    },
    // Multi-environment setup via projects
    projects: [
      {
        // ── Frontend (React components, hooks, utils) ─────────
        test: {
          name: 'frontend',
          environment: 'jsdom',
          setupFiles: ['./tests/setup.js'],
          include: [
            'tests/components/**/*.test.{js,jsx}',
            'tests/utils/**/*.test.{js,jsx}',
          ],
        },
        resolve: {
          alias: {
            '@': path.resolve('./frontend/src'),
            axios: path.resolve('./frontend/src/utils/axiosShim.js')
          },
        },
      },
      {
        // ── Backend (controllers, models, services) ───────────
        test: {
          name: 'backend',
          environment: 'node',
          setupFiles: ['./tests/backend/setup.js'],
          include: [
            'tests/backend/**/*.test.js',
            'tests/services/**/*.test.js',
          ],
        },
      },
      {
        // ── Integration (full API routes via supertest) ───────
        test: {
          name: 'integration',
          environment: 'node',
          setupFiles: ['./tests/backend/setup.js'],
          include: ['tests/integration/**/*.test.js'],
          // Integration tests hit the DB so run serially
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
