import { z } from 'zod';

// Message & Part — per A2A spec v1.0
// A Message is the primary payload of message/send and message/stream.

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
