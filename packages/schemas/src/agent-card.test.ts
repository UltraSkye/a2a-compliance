import { describe, expect, it } from 'vitest';
import { AgentCardSchema } from './agent-card.js';

const minimal = {
  name: 'test-agent',
  url: 'https://agent.example.com/a2a',
  version: '1.0.0',
  capabilities: { streaming: true },
  skills: [{ id: 'echo', name: 'Echo' }],
};

describe('AgentCardSchema', () => {
  it('accepts a minimally valid card', () => {
    const parsed = AgentCardSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
  });

  it('rejects card without skills', () => {
    const parsed = AgentCardSchema.safeParse({ ...minimal, skills: [] });
    expect(parsed.success).toBe(false);
  });

  it('rejects card with non-URL url field', () => {
    const parsed = AgentCardSchema.safeParse({ ...minimal, url: 'not-a-url' });
    expect(parsed.success).toBe(false);
  });
});
