import { z } from 'zod';
import { TaskV1Schema } from './task.js';

// Message & Part — 0.3 wire format (kind-discriminated parts, lowercase
// roles) plus the 1.0 proto-JSON variants further down.

export const MessageRoleSchema = z.enum(['user', 'agent']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const TextPartSchema = z.object({
  kind: z.literal('text'),
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TextPart = z.infer<typeof TextPartSchema>;

export const FilePartSchema = z.object({
  kind: z.literal('file'),
  file: z.object({
    name: z.string().optional(),
    mimeType: z.string().optional(),
    bytes: z.string().optional(),
    uri: z.string().url().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type FilePart = z.infer<typeof FilePartSchema>;

export const DataPartSchema = z.object({
  kind: z.literal('data'),
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type DataPart = z.infer<typeof DataPartSchema>;

export const PartSchema = z.discriminatedUnion('kind', [
  TextPartSchema,
  FilePartSchema,
  DataPartSchema,
]);
export type Part = z.infer<typeof PartSchema>;

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  parts: z.array(PartSchema).min(1),
  messageId: z.string().min(1),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

/** Either a Task or a Message may be returned by message/send. */
export function makeProbeMessage(text: string): Message {
  return {
    role: 'user',
    parts: [{ kind: 'text', text }],
    messageId: crypto.randomUUID(),
  };
}

// Spec 1.0 proto-JSON wire format: roles are proto enum names and Part
// is a oneof carrying exactly one of text | raw | url | data.

export const MessageRoleV1Schema = z.enum(['ROLE_USER', 'ROLE_AGENT']);
export type MessageRoleV1 = z.infer<typeof MessageRoleV1Schema>;

const PART_V1_CONTENT_KEYS = ['text', 'raw', 'url', 'data'] as const;

export const PartV1Schema = z
  .object({
    text: z.string().optional(),
    raw: z.string().optional(),
    url: z.string().optional(),
    data: z.unknown().optional(),
    filename: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((p) => PART_V1_CONTENT_KEYS.filter((k) => p[k] !== undefined).length === 1, {
    message: 'part must set exactly one of text, raw, url, data',
  });
export type PartV1 = z.infer<typeof PartV1Schema>;

export const MessageV1Schema = z.object({
  messageId: z.string().min(1),
  role: MessageRoleV1Schema,
  parts: z.array(PartV1Schema).min(1),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extensions: z.array(z.string()).optional(),
  referenceTaskIds: z.array(z.string()).optional(),
});
export type MessageV1 = z.infer<typeof MessageV1Schema>;

/** SendMessage result — a oneof wrapper, unlike 0.3's bare Task | Message. */
export const SendMessageResponseV1Schema = z.union([
  z.object({ task: TaskV1Schema }),
  z.object({ message: MessageV1Schema }),
]);
export type SendMessageResponseV1 = z.infer<typeof SendMessageResponseV1Schema>;

export function makeProbeMessageV1(text: string): MessageV1 {
  return {
    messageId: crypto.randomUUID(),
    role: 'ROLE_USER',
    parts: [{ text }],
  };
}
