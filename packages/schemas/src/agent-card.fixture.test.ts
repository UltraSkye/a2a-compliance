import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentCardSchema } from './agent-card.js';

// Lock in that examples/agent-cards/minimal.json keeps matching the schema.
// Documentation and tests should not silently drift apart.
const FIXTURE_URL = new URL('../../../examples/agent-cards/minimal.json', import.meta.url);

describe('examples/agent-cards/minimal.json', () => {
  it('parses cleanly against AgentCardSchema', () => {
    const raw = readFileSync(fileURLToPath(FIXTURE_URL), 'utf8');
    const parsed = AgentCardSchema.safeParse(JSON.parse(raw));
    expect(parsed.success).toBe(true);
  });
});
