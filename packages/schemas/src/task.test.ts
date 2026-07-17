import { describe, expect, it } from 'vitest';
import { TaskSchema, TaskStateSchema, TaskStatusSchema, TaskV1Schema } from './task.js';

describe('TaskStateSchema', () => {
  it.each([
    'submitted',
    'working',
    'input-required',
    'completed',
    'canceled',
    'failed',
    'rejected',
    'auth-required',
    'unknown',
  ])('accepts %s', (state) => {
    expect(TaskStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects unknown state values', () => {
    expect(TaskStateSchema.safeParse('not-a-state').success).toBe(false);
    expect(TaskStateSchema.safeParse('').success).toBe(false);
    expect(TaskStateSchema.safeParse(null).success).toBe(false);
  });
});

describe('TaskStatusSchema', () => {
  it('accepts a minimal status with just state', () => {
    expect(TaskStatusSchema.safeParse({ state: 'working' }).success).toBe(true);
  });

  it('accepts a full status with timestamp and message', () => {
    expect(
      TaskStatusSchema.safeParse({
        state: 'completed',
        timestamp: '2026-04-17T00:00:00Z',
        message: { role: 'agent', text: 'done' },
      }).success,
    ).toBe(true);
  });

  it('rejects status without state', () => {
    expect(TaskStatusSchema.safeParse({}).success).toBe(false);
  });
});

describe('TaskSchema', () => {
  it('accepts a minimal task', () => {
    expect(
      TaskSchema.safeParse({
        id: 'task-1',
        status: { state: 'submitted' },
      }).success,
    ).toBe(true);
  });

  it('rejects a task with empty id', () => {
    expect(
      TaskSchema.safeParse({
        id: '',
        status: { state: 'submitted' },
      }).success,
    ).toBe(false);
  });

  it('accepts history + artifacts + metadata', () => {
    const full = {
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'working' },
      history: [{ some: 'message' }],
      artifacts: [{ some: 'artifact' }],
      metadata: { custom: 'data' },
    };
    expect(TaskSchema.safeParse(full).success).toBe(true);
  });

  it('rejects task without status', () => {
    expect(TaskSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});

describe('TaskV1Schema (1.0 proto-JSON)', () => {
  it('accepts TASK_STATE_* states', () => {
    const t = { id: 't-1', status: { state: 'TASK_STATE_AUTH_REQUIRED' } };
    expect(TaskV1Schema.safeParse(t).success).toBe(true);
  });

  it('rejects 0.3-style lowercase states', () => {
    const t = { id: 't-1', status: { state: 'auth-required' } };
    expect(TaskV1Schema.safeParse(t).success).toBe(false);
  });
});
