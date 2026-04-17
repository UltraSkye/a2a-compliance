---
name: Bug report
about: Something a2a-compliance did (or did not do) that is wrong
labels: bug
---

### What happened

<!-- One sentence. -->

### What you expected

<!-- One sentence. -->

### Reproduction

```bash
# Paste the exact CLI invocation or the POST /api/check body you used.
npx @a2a-compliance/cli@latest run https://agent.example.com
```

If the issue is triggered by a specific endpoint, please include
`/.well-known/agent-card.json` contents (redact anything sensitive).

### Environment

- `a2a-compliance` version:
- Node version (`node -v`):
- OS:
- How you ran it: CLI / web dashboard / GitHub Action / Docker

### Report / logs

<!-- `--json` output or relevant CLI output. Paste inside a code fence. -->
