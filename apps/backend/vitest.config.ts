import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Resolve the workspace packages from source so tests run without building
// packages/*/dist first (their package.json `main` points at dist/).
const packagesDir = path.resolve(__dirname, '../../packages');

export default defineConfig({
  resolve: {
    alias: {
      '@pulseweave/database': path.join(packagesDir, 'database/src/index.ts'),
      '@pulseweave/types': path.join(packagesDir, 'types/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      all: true,
      thresholds: {
        lines: 40,
        functions: 65,
        branches: 60,
        statements: 40,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',
        'src/scripts/**',
        'src/types/**',
        'src/routes/**',
        'src/test/**',
      ],
    },
  },
});
