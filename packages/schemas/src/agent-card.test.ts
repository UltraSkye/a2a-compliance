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

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/plain,hi'],
    ['file:', 'file:///etc/passwd'],
    ['mailto:', 'mailto:foo@example.com'],
    ['gopher:', 'gopher://example.com/0foo'],
    ['ftp:', 'ftp://example.com/a'],
  ])('rejects %s scheme for the url field', (_name, url) => {
    const parsed = AgentCardSchema.safeParse({ ...minimal, url });
    expect(parsed.success).toBe(false);
  });

  it('rejects the same dangerous schemes for provider.url', () => {
    const parsed = AgentCardSchema.safeParse({
      ...minimal,
      provider: { organization: 'x', url: 'javascript:alert(1)' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects dangerous schemes for documentationUrl', () => {
    const parsed = AgentCardSchema.safeParse({
      ...minimal,
      documentationUrl: 'file:///etc/passwd',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts both http and https', () => {
    expect(AgentCardSchema.safeParse({ ...minimal, url: 'http://example.com/a2a' }).success).toBe(
      true,
    );
    expect(AgentCardSchema.safeParse({ ...minimal, url: 'https://example.com/a2a' }).success).toBe(
      true,
    );
  });
});
