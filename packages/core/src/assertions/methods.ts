import {
  isErrorResponse,
  JsonRpcErrorCode,
  JsonRpcResponseSchema,
  MessageSchema,
  makeProbeMessage,
  TaskSchema,
} from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, readCappedText } from '../http.js';
import type { CheckResult } from '../report.js';
import type { SpecMethods } from '../spec.js';

// Error codes we tolerate from the "send" method during a compliance probe.
// Agents without a text skill may legitimately reject our probe payload;
// the point of this check is that the endpoint accepts the request shape
// and returns a well-formed response, not that business logic succeeds.
const TOLERATED_SEND_ERROR_CODES: number[] = [
  JsonRpcErrorCode.InvalidParams,
  JsonRpcErrorCode.InternalError,
  -32005,
  -32004,
  -32006,
];

function sendParams(methodName: string): Record<string, unknown> {
  // v0.3's tasks/send expects {id, message}; v1.0's message/send expects {message}.
  // Both accept our probe message; the v0.3 agent will just ignore extra fields.
  const probe = makeProbeMessage('ping from a2a-compliance');
  return methodName === 'tasks/send'
    ? { id: 'compliance-probe-task-id-00000000', message: probe }
    : { message: probe };
}

export async function messageSendCheck(
  endpoint: string,
  methods: SpecMethods,
): Promise<CheckResult> {
  const t0 = now();
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: methods.send,
    params: sendParams(methods.send),
  });

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const text = await readCappedText(res);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail(
        'rpc.messageSend.shape',
        `${methods.send} returns a valid JSON-RPC response`,
        `response body is not JSON (HTTP ${res.status})`,
        t0,
      );
    }

    const parsed = JsonRpcResponseSchema.safeParse(json);
    if (!parsed.success) {
      return fail(
        'rpc.messageSend.shape',
        `${methods.send} returns a valid JSON-RPC response`,
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
        title: `${methods.send} returns a valid JSON-RPC response`,
        severity: 'must',
        status: toleratedOk ? 'warn' : 'fail',
        message: toleratedOk
          ? `agent rejected probe with tolerated error ${code}: ${parsed.data.error.message}`
          : `unexpected error code ${code}: ${parsed.data.error.message}`,
        durationMs: now() - t0,
      };
    }

    const asTask = TaskSchema.safeParse(parsed.data.result);
    const asMessage = MessageSchema.safeParse(parsed.data.result);
    if (asTask.success || asMessage.success) {
      return {
        id: 'rpc.messageSend.shape',
        title: `${methods.send} returns a valid JSON-RPC response`,
        severity: 'must',
        status: 'pass',
        durationMs: now() - t0,
      };
    }

    return fail(
      'rpc.messageSend.shape',
      `${methods.send} returns a valid JSON-RPC response`,
      'result is neither a valid Task nor a Message',
      t0,
      { taskIssues: asTask.error?.issues, messageIssues: asMessage.error?.issues },
    );
  } catch (err) {
    return fail(
      'rpc.messageSend.shape',
      `${methods.send} returns a valid JSON-RPC response`,
      err instanceof Error ? err.message : String(err),
      t0,
    );
  }
}

export async function messageStreamContentTypeCheck(
  endpoint: string,
  methods: SpecMethods,
): Promise<CheckResult> {
  const t0 = now();
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: methods.stream,
    params: sendParams(methods.send),
  });

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body,
    });

    const ct = res.headers.get('content-type') ?? '';
    const isSse = ct.toLowerCase().includes('text/event-stream');

    if (!isSse) {
      let json: unknown;
      try {
        json = JSON.parse(await readCappedText(res));
      } catch {
        return fail(
          'rpc.messageStream.contentType',
          `${methods.stream} responds with text/event-stream`,
          `got Content-Type: ${ct || '(none)'} and non-JSON body`,
          t0,
        );
      }
      const parsed = JsonRpcResponseSchema.safeParse(json);
      if (parsed.success && isErrorResponse(parsed.data)) {
        return {
          id: 'rpc.messageStream.contentType',
          title: `${methods.stream} responds with text/event-stream`,
          severity: 'should',
          status: 'warn',
          message: `server returned JSON-RPC error ${parsed.data.error.code} instead of SSE — streaming may not be supported`,
          durationMs: now() - t0,
        };
      }
      return fail(
        'rpc.messageStream.contentType',
        `${methods.stream} responds with text/event-stream`,
        `got Content-Type: ${ct || '(none)'}`,
        t0,
      );
    }

    try {
      await res.body?.cancel();
    } catch {
      // Ignore — stream wasn't consumable.
    }

    return {
      id: 'rpc.messageStream.contentType',
      title: `${methods.stream} responds with text/event-stream`,
      severity: 'should',
      status: 'pass',
      durationMs: now() - t0,
    };
  } catch (err) {
    return fail(
      'rpc.messageStream.contentType',
      `${methods.stream} responds with text/event-stream`,
      err instanceof Error ? err.message : String(err),
      t0,
    );
  }
}

export async function methodChecks(endpoint: string, methods: SpecMethods): Promise<CheckResult[]> {
  return [
    await messageSendCheck(endpoint, methods),
    await messageStreamContentTypeCheck(endpoint, methods),
  ];
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
