import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/real-repos.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**/*.ts'],
      thresholds: {
        statements: 50,
        branches: 70,
        functions: 70,
        lines: 50,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
