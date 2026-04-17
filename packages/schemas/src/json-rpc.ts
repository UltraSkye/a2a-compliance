import { z } from 'zod';

// JSON-RPC 2.0 envelope — https://www.jsonrpc.org/specification
// A2A uses JSON-RPC 2.0 over HTTP for all methods.

export const JsonRpcIdSchema = z.union([z.string(), z.number().int(), z.null()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
  id: JsonRpcIdSchema.optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

// JSON-RPC 2.0 responses MUST include exactly one of `result` or `error`.
// Because `z.unknown()` accepts an absent field, using a union of two closed
// shapes ends up ambiguous. We instead validate the envelope and enforce the
// "exactly one" rule via `.refine`.
export const JsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: JsonRpcIdSchema,
    result: z.unknown().optional(),
    error: JsonRpcErrorSchema.optional(),
  })
  .refine((r) => 'result' in r !== 'error' in r, {
    message: 'JSON-RPC response must have exactly one of `result` or `error`',
  });
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

// Reserved JSON-RPC 2.0 error codes
export const JsonRpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

// A2A-specific error codes (per spec v1.0)
export const A2AErrorCode = {
  TaskNotFoundError: -32001,
  TaskNotCancelableError: -32002,
  PushNotificationNotSupportedError: -32003,
  UnsupportedOperationError: -32004,
  ContentTypeNotSupportedError: -32005,
  InvalidAgentResponseError: -32006,
} as const;

export function isErrorResponse(
  r: JsonRpcResponse,
): r is JsonRpcResponse & { error: JsonRpcError } {
  return 'error' in r && r.error !== undefined;
}
