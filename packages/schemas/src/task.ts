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
