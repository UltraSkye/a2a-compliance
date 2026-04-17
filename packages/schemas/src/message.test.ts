import { describe, expect, it } from 'vitest';
import { MessageSchema, makeProbeMessage, PartSchema } from './message.js';

describe('PartSchema discriminated union', () => {
  it('accepts a text part', () => {
    expect(PartSchema.safeParse({ kind: 'text', text: 'hi' }).success).toBe(true);
  });
  it('accepts a data part', () => {
    expect(PartSchema.safeParse({ kind: 'data', data: { x: 1 } }).success).toBe(true);
  });
  it('rejects unknown kind', () => {
    expect(PartSchema.safeParse({ kind: 'image', url: 'x' }).success).toBe(false);
  });
});

describe('MessageSchema', () => {
  it('accepts a minimal valid user message', () => {
    const m = {
      role: 'user',
      parts: [{ kind: 'text', text: 'hello' }],
      messageId: 'abc',
    };
    expect(MessageSchema.safeParse(m).success).toBe(true);
  });

  it('rejects a message with no parts', () => {
    const m = { role: 'user', parts: [], messageId: 'abc' };
    expect(MessageSchema.safeParse(m).success).toBe(false);
  });
});

describe('makeProbeMessage', () => {
  it('produces a schema-valid message with a UUID', () => {
    const m = makeProbeMessage('hi');
    expect(MessageSchema.safeParse(m).success).toBe(true);
    expect(m.messageId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
