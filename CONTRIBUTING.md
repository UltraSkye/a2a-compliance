# Contributing

## Before filing

- For proposed new checks, open a GitHub issue first and reference the
  relevant section of the [A2A spec][spec]. We want each check tied to a
  specific MUST / SHOULD so reviewers can judge scope.
- Security-relevant checks: please email the maintainers rather than
  filing a public issue until coordinated disclosure is possible.

[spec]: https://a2a-protocol.org/latest/specification/

## Dev setup

```bash
git clone <this-repo>
cd a2a-compliance
pnpm install
pnpm build
pnpm test
```

## Adding a check

1. Add or extend a Zod schema in `packages/schemas/src/` if the check
   needs structural validation.
2. Add an assertion in `packages/core/src/assertions/`. One function per
   logical group. Return `CheckResult[]`.
3. Wire it into the runner in `packages/core/src/runner.ts`.
4. Add a unit test. Use `fetch` mocks; don't hit the network in tests.
5. Document the check id in the README or architecture doc.

Keep check ids stable once published — downstream CI filters depend on
them.

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
`test:`. Scope is optional but useful: `feat(core): add tasks/get check`.

## Code style

Biome handles formatting and linting. Run `pnpm lint:fix` before pushing.
