# Roadmap

This file tracks direction. Dated versions are shipped; undated ones are
intent. Nothing here is a promise — open an issue if a line is blocking
you and we'll discuss priority.

## 0.1.x — stability and reach

- Gather real-world reports from probing public A2A endpoints and roll
  the findings back into assertion messages.
- Compatibility fixes for cards found in the wild that fail on trivia
  (extra fields, legacy casings).
- Publish the GitHub Action to the Marketplace once the CLI has a few
  weeks of stable downloads.

## 0.2 — ecosystem depth

- **Authentication probe.** Today we only check the `authentication`
  field in the card. v0.2 will actually try an anonymous request, note
  the challenge, and verify that OAuth discovery metadata is reachable
  if declared.
- **DNS rebinding mitigation in-process.** Custom HTTPS agent that pins
  the resolved IP for the duration of the fetch. Closes the residual
  documented in SECURITY.md.
- **`tasks/pushNotificationConfig/list`** when the v1.0 spec
  standardises it. Today there's no probe — we assume push-config is
  set-then-get only.
- **Batch JSON-RPC** compliance check. Spec allows batch requests.

## 0.3 — beyond assertions

- **Snapshot diff as a first-class report.** Right now it's a CLI
  display + JSON field on the report; could be its own reporter with
  badge + JUnit equivalents.
- **Hosted compliance leaderboard.** Daily probes against every
  endpoint in `awesome-a2a`, public results page.
- **Property-based fuzzing** (fast-check) over the Zod schemas to
  catch the next generation of bypasses before reviewers find them.

## Non-goals

- Replacing `a2aproject/a2a-inspector`. That tool is for interactive
  debugging; we're for automated compliance. Different shape.
- Shipping our own A2A client. We probe, we don't speak.
- Blue-green deploy machinery, orchestration, agent hosting — any of
  those should live in a separate project.

## How to influence

- File issues with a concrete problem you hit.
- PRs for new assertions go via `.github/ISSUE_TEMPLATE/new_check.md`
  first so scope stays bounded.
- Security concerns via SECURITY.md, not a public issue.
