import { describe, expect, it } from 'vitest';
import { buildServer } from './index.js';

describe('buildServer', () => {
  it('returns an McpServer instance with the expected tools registered', async () => {
    const server = buildServer();
    // McpServer's internals aren't public API, but every tool registration
    // goes through the shared Server.tool() registry, so we assert behaviour
    // by exercising the client-facing tools/list handler. The SDK ships an
    // in-memory transport for exactly this kind of round-trip test.
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' }, {});
    await Promise.all([client.connect(clientT), server.connect(serverT)]);

    const { tools } = await client.listTools();
    const names = tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([
      'explain_check',
      'list_checks',
      'run_compliance',
      'ssrf_check_url',
      'validate_agent_card',
    ]);

    // Exercise one tool end-to-end: explain_check for a known id.
    const explainRes = await client.callTool({
      name: 'explain_check',
      arguments: { id: 'sec.ssrf' },
    });
    const explainContent = explainRes.content as Array<{ type: string; text: string }>;
    expect(explainContent[0]?.text).toContain('sec.ssrf');
    expect(explainContent[0]?.text).toContain('security');

    // And the error path.
    const unknownRes = await client.callTool({
      name: 'explain_check',
      arguments: { id: 'nope.does.not.exist' },
    });
    expect(unknownRes.isError).toBe(true);

    await client.close();
  });
});
