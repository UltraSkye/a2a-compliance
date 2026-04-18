import { defineConfig } from 'vitest/config';

// Coverage thresholds lock in the minimums we actually reached on this
// branch. Regressions below any of these fail `npx vitest run --coverage`
// and the CI job that uses it. Bump the floors when you raise coverage
// for real.
//
// Two modules are deliberately undercovered here:
//
//   - dns-pin.ts — the undici `dispatcher.connect.lookup` callback
//     can only be exercised by opening a real socket, something unit
//     tests shouldn't do. Exercised by scripts/e2e.sh instead.
//
//   - telemetry.ts — the `with-span` branches only execute when the
//     optional `@opentelemetry/api` dep is installed in the host
//     process. It isn't, by design, so most of the module's branches
//     are never hit from the unit-test environment.
//
// Floors reflect the post-v0.3 reality. Bump them when coverage goes
// up for real.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 88,
        branches: 80,
        functions: 91,
        lines: 89,
      },
    },
  },
});
