import {
  isErrorResponse,
  JsonRpcErrorCode,
  JsonRpcResponseSchema,
  MessageSchema,
  makeProbeMessage,
  TaskSchema,
} from '@a2a-compliance/schemas';
import { fetchWithTimeout, now } from '../http.js';
import type { CheckResult } from '../report.js';

// Error codes we tolerate from message/send during a compliance probe.
// Agents without a text skill may legitimately reject our probe payload;
// the point of this check is that the endpoint accepts the request shape
// and returns a well-formed response, not that business logic succeeds.
const TOLERATED_SEND_ERROR_CODES: number[] = [
  JsonRpcErrorCode.InvalidParams, // -32602 — agent doesn't like our minimal payload
  JsonRpcErrorCode.InternalError, // -32603 — agent runtime error
  -32005, // ContentTypeNotSupportedError
  -32004, // UnsupportedOperationError
  -32006, // InvalidAgentResponseError
];

export async function messageSendCheck(endpoint: string): Promise<CheckResult> {
  const t0 = now();
  const probe = makeProbeMessage('ping from a2a-compliance');
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'message/send',
    params: { message: probe },
  });

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail(
        'rpc.messageSend.shape',
        'message/send returns a valid JSON-RPC response',
        `response body is not JSON (HTTP ${res.status})`,
        t0,
      );
    }

    const parsed = JsonRpcResponseSchema.safeParse(json);
    if (!parsed.success) {
      return fail(
        'rpc.messageSend.shape',
        'message/send returns a valid JSON-RPC response',
        'response is not a valid JSON-RPC 2.0 envelope',
        t0,
        parsed.error.issues,
      );
    }

    if (isErrorResponse(parsed.data)) {
      const code = parsed.data.error.code;
      const toleratedOk = TOLERATED_SEND_ERROR_CODES.includes(code);
      return {
        id: 'rpc.messageSend.shape',
        title: 'message/send returns a valid JSON-RPC response',
        severity: 'must',
        status: toleratedOk ? 'warn' : 'fail',
        message: toleratedOk
          ? `agent rejected probe with tolerated error ${code}: ${parsed.data.error.message}`
          : `unexpected error code ${code}: ${parsed.data.error.message}`,
        durationMs: now() - t0,
      };
    }

    // Success: result must be a Task or a Message (spec v1.0 allows either).
    const asTask = TaskSchema.safeParse(parsed.data.result);
    const asMessage = MessageSchema.safeParse(parsed.data.result);
    if (asTask.success || asMessage.success) {
      return {
        id: 'rpc.messageSend.shape',
        title: 'message/send returns a valid JSON-RPC response',
        severity: 'must',
        status: 'pass',
        durationMs: now() - t0,
      };
    }

    return fail(
      'rpc.messageSend.shape',
      'message/send returns a valid JSON-RPC response',
      'result is neither a valid Task nor a Message',
      t0,
      { taskIssues: asTask.error?.issues, messageIssues: asMessage.error?.issues },
    );
  } catch (err) {
    return fail(
      'rpc.messageSend.shape',
      'message/send returns a valid JSON-RPC response',
      err instanceof Error ? err.message : String(err),
      t0,
    );
  }
}

/**
 * Probe message/stream and check that the server advertises an SSE stream
 * (Content-Type: text/event-stream). Full frame parsing is deferred — this
 * check catches the common failure mode where servers accept the method but
 * return plain JSON instead of SSE.
 */
export async function messageStreamContentTypeCheck(endpoint: string): Promise<CheckResult> {
  const t0 = now();
  const probe = makeProbeMessage('ping from a2a-compliance (stream)');
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'message/stream',
    params: { message: probe },
  });

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body,
    });

    const ct = res.headers.get('content-type') ?? '';
    const isSse = ct.toLowerCase().includes('text/event-stream');

    // We also allow JSON-RPC error responses (e.g. streaming not supported).
    if (!isSse) {
      // If it's JSON, see if it's a tolerable error.
      let json: unknown;
      try {
        json = JSON.parse(await res.text());
      } catch {
        return fail(
          'rpc.messageStream.contentType',
          'message/stream responds with text/event-stream',
          `got Content-Type: ${ct || '(none)'} and non-JSON body`,
          t0,
        );
      }
      const parsed = JsonRpcResponseSchema.safeParse(json);
      if (parsed.success && isErrorResponse(parsed.data)) {
        return {
          id: 'rpc.messageStream.contentType',
          title: 'message/stream responds with text/event-stream',
          severity: 'should',
          status: 'warn',
          message: `server returned JSON-RPC error ${parsed.data.error.code} instead of SSE — streaming may not be supported`,
          durationMs: now() - t0,
        };
      }
      return fail(
        'rpc.messageStream.contentType',
        'message/stream responds with text/event-stream',
        `got Content-Type: ${ct || '(none)'}`,
        t0,
      );
    }

    // Cancel the stream — we don't need to drain it for this check.
    try {
      await res.body?.cancel();
    } catch {
      // Ignore.
    }

    return {
      id: 'rpc.messageStream.contentType',
      title: 'message/stream responds with text/event-stream',
      severity: 'should',
      status: 'pass',
      durationMs: now() - t0,
    };
  } catch (err) {
    return fail(
      'rpc.messageStream.contentType',
      'message/stream responds with text/event-stream',
      err instanceof Error ? err.message : String(err),
      t0,
    );
  }
}

export async function methodChecks(endpoint: string): Promise<CheckResult[]> {
  return [await messageSendCheck(endpoint), await messageStreamContentTypeCheck(endpoint)];
}

function fail(
  id: string,
  title: string,
  message: string,
  t0: number,
  evidence?: unknown,
): CheckResult {
  return {
    id,
    title,
    severity: 'must',
    status: 'fail',
    message,
    ...(evidence === undefined ? {} : { evidence }),
    durationMs: now() - t0,
  };
}
