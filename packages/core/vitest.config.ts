import { defineConfig } from 'vitest/config';

// Coverage thresholds lock in the minimums we actually reached on this
// branch. Regressions below any of these fail `npx vitest run --coverage`
// and the CI job that uses it. Bump the floors when you raise coverage
// for real.
//
// The functions threshold is 93 rather than 95 because the undici
// `dispatcher.connect.lookup` callback in dns-pin.ts can only be
// exercised by opening a real socket — something unit tests shouldn't
// do. It's covered by the e2e script instead (scripts/e2e.sh).
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 93,
        lines: 92,
      },
    },
  },
});
