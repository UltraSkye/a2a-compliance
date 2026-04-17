# Security Policy

## Supported versions

Only the latest published minor on the main branch receives security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Instead, email the maintainers or use GitHub's private vulnerability
reporting ([Security → Report a vulnerability][advisory]). Include:

- A clear description of the issue and attack impact
- Reproduction steps or a minimal proof-of-concept
- Affected package(s) and version(s)
- Any suggested mitigations

[advisory]: https://github.com/UltraSkye/a2a-compliance/security/advisories/new

We aim to acknowledge within **3 business days** and issue a coordinated
disclosure with a fix within **14 days** for high-severity reports.

## Threat model for this tool

`a2a-compliance` exists to probe A2A protocol endpoints. Because of that,
several classes of bug are particularly interesting for this project:

- **SSRF via agent card discovery** — an attacker-controlled card URL
  redirecting our client into the local network. Mitigated by
  `assertions/security.ts` refusing private IP resolution, and by the
  web API rejecting private-space targets at the ingress. Bypasses
  (e.g. via DNS rebinding after TOCTOU, open-redirect through 30x) are
  in scope.
- **OOM via oversized responses** — mitigated by `readCappedText` at
  2 MB default. Cases where the cap can be bypassed are in scope.
- **Command or prompt injection through the CLI / report output** — the
  tool never executes scraped content, but reports are viewed in
  humans' terminals and render in the web UI. Bugs that let a hostile
  endpoint escape ANSI / HTML boundaries are in scope.
- **Credential exposure** — we do not accept credentials today. If a
  future release adds auth, reports leaking them to disk or to stdout
  are in scope.

Out of scope: DoS via one-off slow agents (timeouts are user-tunable),
social engineering, or misuse by an operator who already has shell
access.

## Known residual risks

- **DNS rebinding (TOCTOU).** `ssrfCheckForUrl` resolves a hostname at
  check time; the actual HTTP connection happens milliseconds later
  against whatever DNS returns then. A malicious authoritative DNS can
  answer with a public IP for the check, then a private IP for the
  fetch. No user-space fix short of bypassing libc resolution and
  pinning to the checked address.
  Mitigation: run the hosted dashboard inside a network namespace that
  blocks egress to RFC 1918 / link-local / carrier-NAT ranges. Docker:
  `--network none` with an explicit allowlist egress proxy, or an AWS
  security group / GCP firewall rule denying 10/8, 172.16/12,
  192.168/16, 169.254/16 on the container's egress interface.

## Previously-residual, now closed

- **SSRF after 30x redirect** — fixed in 0.1.0. `fetchWithTimeout`
  follows redirects manually and re-applies `ssrfCheckForUrl` to every
  hop's Location header. A public target that 302s to
  `169.254.169.254` is refused with a clear error instead of quietly
  landing us on cloud metadata.
