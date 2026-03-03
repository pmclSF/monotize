import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/real-repos.test.ts', '**/._*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**/*.ts',
        // CLI command files are thin orchestration wrappers tested via E2E
        // subprocess tests; v8 cannot track coverage across process boundaries.
        'src/commands/**/*.ts',
        // CLI entry point — only runs as subprocess; v8 cannot track.
        'src/index.ts',
        // Barrel re-export files and pure type definitions have no logic to test.
        'src/analyzers/index.ts',
        'src/resolvers/index.ts',
        'src/strategies/index.ts',
        'src/utils/index.ts',
        'src/server/types.ts',
        // macOS resource fork files on external volumes
        '**/._*',
      ],
      thresholds: {
        statements: 93,
        branches: 90,
        functions: 96,
        lines: 93,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
