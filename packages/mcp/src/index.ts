#!/usr/bin/env node
/**
 * Model Context Protocol server for @a2a-compliance.
 *
 * Exposes the compliance probe + catalog as tools that any MCP-capable
 * client can invoke (Claude Desktop, Cursor, Codex, Aider, Windsurf,
 * Cline, Continue, etc). The tool set mirrors the CLI so integration is
 * zero-friction: a model that already "knows how to run the CLI" can
 * call the same operations natively through this adapter.
 *
 * Transport is stdio — the MCP client spawns us as a subprocess. No
 * network listener, no auth surface. Every outbound probe still goes
 * through @a2a-compliance/core's hardened `fetchWithTimeout` (SSRF,
 * size cap, redirect re-check).
 */
import {
  CHECK_CATALOG,
  explain,
  listCheckIds,
  runCardChecks,
  runFullChecks,
  ssrfCheckForUrl,
} from '@a2a-compliance/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VERSION } from './version.js';

function text(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text: body }] };
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: '@a2a-compliance/mcp', version: VERSION },
    {
      instructions:
        'Compliance test kit and security audit for A2A (Agent2Agent) protocol endpoints. Use `run_compliance` for a full probe; `validate_agent_card` for a card-only run; `list_checks` / `explain_check` to introspect the catalog; `ssrf_check_url` to gate URL inputs before dispatching other tools at them.',
    },
  );

  server.registerTool(
    'run_compliance',
    {
      title: 'Run A2A compliance probe',
      description:
        'Full compliance run against an A2A endpoint: agent card validation, JSON-RPC 2.0 conformance, method probes (message/send, message/stream, tasks/*), push-notification config (capability-gated), security (SSRF, TLS, CORS, DNS-rebinding), auth (anon-challenge, OIDC discovery). Returns a ComplianceReport with per-check status + a compliance tier (NON_COMPLIANT / MANDATORY / RECOMMENDED / FULL_FEATURED).',
      inputSchema: {
        url: z
          .string()
          .url()
          .describe(
            'Base URL of the A2A endpoint. The tool appends /.well-known/agent-card.json for discovery.',
          ),
        skipProtocol: z.boolean().optional().describe('Skip live JSON-RPC probes (card-only run).'),
        skipSecurity: z.boolean().optional().describe('Skip SSRF/TLS/CORS security checks.'),
        skipAuth: z
          .boolean()
          .optional()
          .describe('Skip auth probe (anon-challenge + OIDC discovery).'),
      },
    },
    async ({ url, skipProtocol, skipSecurity, skipAuth }) => {
      const report = await runFullChecks(url, {
        ...(skipProtocol === undefined ? {} : { skipProtocol }),
        ...(skipSecurity === undefined ? {} : { skipSecurity }),
        ...(skipAuth === undefined ? {} : { skipAuth }),
      });
      return text(report);
    },
  );

  server.registerTool(
    'validate_agent_card',
    {
      title: 'Validate A2A agent card',
      description:
        'Card-only compliance run. Faster than run_compliance when you only care about the agent card at /.well-known/agent-card.json (reachability, JSON, schema, Content-Type, URL shape, skills, protocolVersion).',
      inputSchema: {
        url: z.string().url().describe('Base URL of the A2A endpoint.'),
      },
    },
    async ({ url }) => text(await runCardChecks(url)),
  );

  server.registerTool(
    'list_checks',
    {
      title: 'List every compliance check',
      description:
        'Returns the full check catalog as a JSON array: id, category, severity, title, description, optional specRef. Useful for an agent that needs to reason about which checks to filter before calling run_compliance.',
      inputSchema: {},
    },
    async () => {
      const ids = listCheckIds();
      const entries = ids.map((id) => CHECK_CATALOG[id]);
      return text(entries);
    },
  );

  server.registerTool(
    'explain_check',
    {
      title: 'Explain a single check id',
      description:
        'Return the catalog entry for one check id (e.g. "sec.ssrf", "rpc.messageSend.shape"). Includes a link back to the relevant A2A / JSON-RPC spec section.',
      inputSchema: {
        id: z
          .string()
          .describe('The dotted check id, as printed by list_checks or a prior run_compliance.'),
      },
    },
    async ({ id }) => {
      const meta = explain(id);
      if (!meta) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `unknown check id: ${id}` }],
        };
      }
      return text(meta);
    },
  );

  server.registerTool(
    'ssrf_check_url',
    {
      title: 'SSRF-check a URL before fetching',
      description:
        'Resolve a URL and refuse it when the resolved IP is in loopback, RFC 1918, link-local, CGNAT, ULA, or the cloud-metadata address 169.254.169.254. Usable by any MCP client as an ingress guard before passing a user-supplied URL to a fetcher.',
      inputSchema: {
        url: z.string().describe('URL to check.'),
      },
    },
    async ({ url }) => text(await ssrfCheckForUrl(url)),
  );

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Allow `import { buildServer }` from tests without triggering main().
// Matches the dist-url check used elsewhere in the workspace.
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] !== undefined &&
    import.meta.url.endsWith(process.argv[1].split('/').pop() ?? ''));
if (isMainModule) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(msg);
    process.exit(1);
  });
}
