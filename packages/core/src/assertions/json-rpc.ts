import {
  A2AErrorCode,
  isErrorResponse,
  JsonRpcErrorCode,
  JsonRpcResponseSchema,
} from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, readCappedText } from '../http.js';
import { redactInText } from '../redact.js';
import type { CheckResult } from '../report.js';
import type { SpecMethods } from '../spec.js';

interface RpcProbe {
  title: string;
  body: string;
  contentType?: string;
  expectedErrorCode?: number;
  acceptableErrorCodes?: number[];
}

async function probe(
  endpoint: string,
  id: string,
  severity: CheckResult['severity'],
  p: RpcProbe,
): Promise<CheckResult> {
  const t0 = now();
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': p.contentType ?? 'application/json' },
      body: p.body,
    });

    const text = await readCappedText(res);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        id,
        title: p.title,
        severity,
        status: 'fail',
        message: `response body is not valid JSON (HTTP ${res.status})`,
        evidence: { status: res.status, body: text.slice(0, 200) },
        durationMs: now() - t0,
      };
    }

    const parsed = JsonRpcResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        id,
        title: p.title,
        severity,
        status: 'fail',
        message: 'response is not a valid JSON-RPC 2.0 envelope',
        evidence: parsed.error.issues,
        durationMs: now() - t0,
      };
    }

    if (!isErrorResponse(parsed.data)) {
      return {
        id,
        title: p.title,
        severity,
        status: 'fail',
        message: 'expected error response, got success',
        evidence: parsed.data,
        durationMs: now() - t0,
      };
    }

    const code = parsed.data.error.code;
    const accepted = p.acceptableErrorCodes ?? [p.expectedErrorCode ?? -1];
    const ok = accepted.includes(code);
    return {
      id,
      title: p.title,
      severity,
      status: ok ? 'pass' : 'fail',
      ...(ok ? {} : { message: `expected error code in [${accepted.join(', ')}], got ${code}` }),
      durationMs: now() - t0,
    };
  } catch (err) {
    return {
      id,
      title: p.title,
      severity,
      status: 'fail',
      message: redactInText(err instanceof Error ? err.message : String(err)),
      durationMs: now() - t0,
    };
  }
}

export async function jsonRpcChecks(
  endpoint: string,
  methods: SpecMethods,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(
    await probe(endpoint, 'rpc.parseError', 'must', {
      title: 'Rejects invalid JSON with -32700 Parse error',
      body: '{ this is not json',
      expectedErrorCode: JsonRpcErrorCode.ParseError,
    }),
  );

  results.push(
    await probe(endpoint, 'rpc.invalidRequest', 'must', {
      title: 'Rejects malformed JSON-RPC envelope with -32600 Invalid Request',
      body: JSON.stringify({ id: 1, method: 'any.method' }),
      expectedErrorCode: JsonRpcErrorCode.InvalidRequest,
    }),
  );

  results.push(
    await probe(endpoint, 'rpc.methodNotFound', 'must', {
      title: 'Returns -32601 for unknown method',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'compliance.probe.nonexistent',
      }),
      expectedErrorCode: JsonRpcErrorCode.MethodNotFound,
    }),
  );

  // Accept InvalidParams alongside TaskNotFoundError — some servers validate
  // the id format before even looking it up.
  results.push(
    await probe(endpoint, 'rpc.tasksGet.notFound', 'should', {
      title: `${methods.get} returns TaskNotFoundError (-32001) for unknown task id`,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: methods.get,
        params: { id: 'compliance-probe-nonexistent-task-id-00000000' },
      }),
      acceptableErrorCodes: [A2AErrorCode.TaskNotFoundError, JsonRpcErrorCode.InvalidParams],
    }),
  );

  // Also accept UnsupportedOperation — resubscribe is genuinely optional per
  // spec, and some implementations don't wire it up at all.
  results.push(
    await probe(endpoint, 'rpc.tasksResubscribe.notFound', 'should', {
      title: `${methods.resubscribe} returns TaskNotFoundError (-32001) for unknown task id`,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: methods.resubscribe,
        params: { id: 'compliance-probe-nonexistent-task-id-00000000' },
      }),
      acceptableErrorCodes: [
        A2AErrorCode.TaskNotFoundError,
        JsonRpcErrorCode.InvalidParams,
        A2AErrorCode.UnsupportedOperationError,
      ],
    }),
  );

  // TaskNotCancelable is the variant when the server found the task but
  // refused to cancel — also acceptable for a probe with a bogus id.
  results.push(
    await probe(endpoint, 'rpc.tasksCancel.notFound', 'should', {
      title: `${methods.cancel} rejects an unknown task id`,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: methods.cancel,
        params: { id: 'compliance-probe-nonexistent-task-id-00000000' },
      }),
      acceptableErrorCodes: [
        A2AErrorCode.TaskNotFoundError,
        A2AErrorCode.TaskNotCancelableError,
        JsonRpcErrorCode.InvalidParams,
      ],
    }),
  );

  return results;
}
