import { z } from 'zod';

// A2A Task state machine — per spec v1.0
export const TaskStateSchema = z.enum([
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
  'rejected',
  'auth-required',
  'unknown',
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const TaskStatusSchema = z.object({
  state: TaskStateSchema,
  message: z.unknown().optional(),
  timestamp: z.string().optional(),
});
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string().min(1),
  contextId: z.string().optional(),
  status: TaskStatusSchema,
  history: z.array(z.unknown()).optional(),
  artifacts: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// Spec 1.0 serialises TaskState with proto enum names.
export const TaskStateV1Schema = z.enum([
  'TASK_STATE_UNSPECIFIED',
  'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_INPUT_REQUIRED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_AUTH_REQUIRED',
]);
export type TaskStateV1 = z.infer<typeof TaskStateV1Schema>;

export const TaskStatusV1Schema = z.object({
  state: TaskStateV1Schema,
  message: z.unknown().optional(),
  timestamp: z.string().optional(),
});
export type TaskStatusV1 = z.infer<typeof TaskStatusV1Schema>;

export const TaskV1Schema = z.object({
  id: z.string().min(1),
  contextId: z.string().optional(),
  status: TaskStatusV1Schema,
  history: z.array(z.unknown()).optional(),
  artifacts: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TaskV1 = z.infer<typeof TaskV1Schema>;
