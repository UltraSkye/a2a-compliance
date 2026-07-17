import { describe, expect, it } from 'vitest';
import {
  MessageSchema,
  MessageV1Schema,
  makeProbeMessage,
  makeProbeMessageV1,
  PartSchema,
  SendMessageResponseV1Schema,
} from './message.js';

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

describe('MessageV1Schema (1.0 proto-JSON)', () => {
  it('accepts a proto-JSON message with a text part', () => {
    const m = { messageId: 'm-1', role: 'ROLE_USER', parts: [{ text: 'hi' }] };
    expect(MessageV1Schema.safeParse(m).success).toBe(true);
  });

  it('rejects 0.3-style lowercase roles and kind-discriminated parts', () => {
    const m = { messageId: 'm-1', role: 'user', parts: [{ kind: 'text', text: 'hi' }] };
    expect(MessageV1Schema.safeParse(m).success).toBe(false);
  });

  it('rejects a part with zero or multiple content fields', () => {
    expect(
      MessageV1Schema.safeParse({ messageId: 'm', role: 'ROLE_AGENT', parts: [{}] }).success,
    ).toBe(false);
    expect(
      MessageV1Schema.safeParse({
        messageId: 'm',
        role: 'ROLE_AGENT',
        parts: [{ text: 'a', url: 'https://x.example' }],
      }).success,
    ).toBe(false);
  });
});

describe('SendMessageResponseV1Schema', () => {
  it('accepts {task} and {message} wrappers', () => {
    const task = { id: 't-1', status: { state: 'TASK_STATE_WORKING' } };
    const message = { messageId: 'm-1', role: 'ROLE_AGENT', parts: [{ text: 'pong' }] };
    expect(SendMessageResponseV1Schema.safeParse({ task }).success).toBe(true);
    expect(SendMessageResponseV1Schema.safeParse({ message }).success).toBe(true);
  });

  it('rejects a bare 0.3-style Task', () => {
    const bare = { id: 't-1', status: { state: 'submitted' } };
    expect(SendMessageResponseV1Schema.safeParse(bare).success).toBe(false);
  });
});

describe('makeProbeMessageV1', () => {
  it('produces a schema-valid 1.0 message', () => {
    const m = makeProbeMessageV1('hi');
    expect(MessageV1Schema.safeParse(m).success).toBe(true);
    expect(m.role).toBe('ROLE_USER');
  });
});
