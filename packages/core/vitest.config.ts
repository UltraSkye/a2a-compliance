import { defineConfig } from 'vitest/config';

// Coverage thresholds lock in the minimums we actually reached in 0.1.0.
// Regressions below any of these will fail `npx vitest run --coverage` and
// the CI job that uses it. Bump the floors when you raise coverage for real.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85,
      },
    },
  },
});
