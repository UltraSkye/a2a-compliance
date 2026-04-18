# @a2a-compliance/mcp

> **[Model Context Protocol](https://modelcontextprotocol.io) server for
> the A2A (Agent2Agent) protocol compliance test kit.** Lets Claude
> Desktop, Cursor, Codex, Aider, Cline, Windsurf, Continue, and any other
> MCP-capable client invoke `run_compliance` / `validate_agent_card` /
> `list_checks` / `explain_check` / `ssrf_check_url` as native tools —
> no REST, no API keys, no shell-out.

[![npm](https://img.shields.io/npm/v/%40a2a-compliance%2Fmcp.svg)](https://www.npmjs.com/package/@a2a-compliance/mcp)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/UltraSkye/a2a-compliance/blob/main/LICENSE)

Part of [`a2a-compliance`](https://github.com/UltraSkye/a2a-compliance).
For CLI use, install
[`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli)
instead.

## Install

The server is published on npm and designed to be launched by an MCP
client via `npx`:

```bash
# sanity check
npx @a2a-compliance/mcp
# ^ waits on stdio for an MCP client — Ctrl+C to exit
```

## Configure your MCP client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "a2a-compliance": {
      "command": "npx",
      "args": ["-y", "@a2a-compliance/mcp"]
    }
  }
}
```

Restart Claude Desktop. The tools appear in the tool picker ("⚒" icon)
as `run_compliance`, `validate_agent_card`, `list_checks`,
`explain_check`, `ssrf_check_url`.

### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "a2a-compliance": {
      "command": "npx",
      "args": ["-y", "@a2a-compliance/mcp"]
    }
  }
}
```

### Codex / Cline / Windsurf / Continue

Same shape — invoke via `npx @a2a-compliance/mcp` with stdio transport.
Any MCP client that supports the public spec will work.

## Tools exposed

| Name | Input | What it does |
|---|---|---|
| `run_compliance` | `{ url, skipProtocol?, skipSecurity?, skipAuth? }` | Full compliance run — agent card + JSON-RPC + method set + auth + security. Returns a `ComplianceReport` with per-check status and a compliance tier (`NON_COMPLIANT` / `MANDATORY` / `RECOMMENDED` / `FULL_FEATURED`). |
| `validate_agent_card` | `{ url }` | Card-only, faster. |
| `list_checks` | `{}` | Returns the full check catalog: id, category, severity, title, description, optional `specRef` pointing back into the A2A / JSON-RPC spec. |
| `explain_check` | `{ id }` | Returns the catalog entry for one check id. |
| `ssrf_check_url` | `{ url }` | Ingress guard — refuses private-space resolutions. Usable by other MCP tools before they fetch user-supplied URLs. |

## Example prompts

- *"Check whether `https://agent.example.com` is a compliant A2A agent
  and tell me what's wrong."*
- *"List every A2A compliance check in the security category."*
- *"Why does `sec.ssrf` exist? Explain it."*
- *"Before you fetch this URL, SSRF-check it."*

## Security

- stdio-only transport — no network listener, no auth surface.
- Every outbound probe uses `@a2a-compliance/core`'s hardened HTTP
  client: 10 s timeout, 2 MB body cap, per-redirect SSRF re-check, and
  DNS-rebinding pin (close-the-TOCTOU lookup through undici).
- The `ssrf_check_url` tool is exposed specifically so an MCP host can
  sanitise URLs it received from a user before handing them to any
  fetching tool — including this one.

## See also

- 🏠 [Repository + full docs](https://github.com/UltraSkye/a2a-compliance)
- 🔌 [`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli) — command-line use
- 🧱 [`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core) — library form
- 🛡️ [A2A Security Top 10](https://github.com/UltraSkye/a2a-compliance/blob/main/docs/A2A_SECURITY_TOP_10.md)
- 📜 [Model Context Protocol spec](https://modelcontextprotocol.io)

## License

MIT.
