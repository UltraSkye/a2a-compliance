import {
  isErrorResponse,
  JsonRpcErrorCode,
  JsonRpcResponseSchema,
  MessageSchema,
  makeProbeMessage,
  makeProbeMessageV1,
  SendMessageResponseV1Schema,
  TaskSchema,
} from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, type ProbeOptions, readCappedText } from '../http.js';
import { redactInText } from '../redact.js';
import type { CheckResult } from '../report.js';
import type { SpecProfile } from '../spec.js';

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

function sendParams(profile: SpecProfile): Record<string, unknown> {
  // 0.2's tasks/send expects {id, message}; 0.3+ send methods expect
  // {message}. 1.0 additionally switched Message to the proto-JSON shape.
  if (profile.version === '1.0') {
    return { message: makeProbeMessageV1('ping from a2a-compliance') };
  }
  const probe = makeProbeMessage('ping from a2a-compliance');
  return profile.version === '0.2'
    ? { id: 'compliance-probe-task-id-00000000', message: probe }
    : { message: probe };
}

interface SendResultVerdict {
  ok: boolean;
  evidence?: unknown;
}

function validateSendResult(profile: SpecProfile, result: unknown): SendResultVerdict {
  if (profile.version === '1.0') {
    const parsed = SendMessageResponseV1Schema.safeParse(result);
    return parsed.success ? { ok: true } : { ok: false, evidence: parsed.error.issues };
  }
  const asTask = TaskSchema.safeParse(result);
  const asMessage = MessageSchema.safeParse(result);
  if (asTask.success || asMessage.success) return { ok: true };
  return {
    ok: false,
    evidence: { taskIssues: asTask.error?.issues, messageIssues: asMessage.error?.issues },
  };
}

export async function messageSendCheck(
  endpoint: string,
  profile: SpecProfile,
  po: ProbeOptions = {},
): Promise<CheckResult> {
  const t0 = now();
  const methods = profile.methods;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: methods.send,
    params: sendParams(profile),
  });

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...profile.headers },
      body,
      ...(po.pinDns === undefined ? {} : { pinDns: po.pinDns }),
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
      // parsed.data.error.message is agent-controlled; redact embedded URLs
      // before it lands in reports.
      const agentMsg = redactInText(parsed.data.error.message);
      return {
        id: 'rpc.messageSend.shape',
        title: `${methods.send} returns a valid JSON-RPC response`,
        severity: 'must',
        status: toleratedOk ? 'warn' : 'fail',
        message: toleratedOk
          ? `agent rejected probe with tolerated error ${code}: ${agentMsg}`
          : `unexpected error code ${code}: ${agentMsg}`,
        durationMs: now() - t0,
      };
    }

    const verdict = validateSendResult(profile, parsed.data.result);
    if (verdict.ok) {
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
      profile.version === '1.0'
        ? 'result is not a valid SendMessageResponse ({task} or {message})'
        : 'result is neither a valid Task nor a Message',
      t0,
      verdict.evidence,
    );
  } catch (err) {
    return fail(
      'rpc.messageSend.shape',
      `${methods.send} returns a valid JSON-RPC response`,
      redactInText(err instanceof Error ? err.message : String(err)),
      t0,
    );
  }
}

export interface CapabilityHints {
  streaming?: boolean;
}

export async function messageStreamContentTypeCheck(
  endpoint: string,
  profile: SpecProfile,
  hints: CapabilityHints = {},
  po: ProbeOptions = {},
): Promise<CheckResult> {
  const t0 = now();
  const methods = profile.methods;
  // False-advertising detection: if the card declared streaming, a
  // non-conforming stream response is a MUST-level failure rather than
  // a SHOULD-level warning. If the capability is absent we keep the
  // lighter SHOULD so opportunistic probing still runs without punishing
  // agents that never claimed support.
  const severity: CheckResult['severity'] = hints.streaming === true ? 'must' : 'should';
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: methods.stream,
    params: sendParams(profile),
  });

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...profile.headers,
      },
      body,
      ...(po.pinDns === undefined ? {} : { pinDns: po.pinDns }),
    });

    const ct = res.headers.get('content-type') ?? '';
    const isSse = ct.toLowerCase().includes('text/event-stream');

    if (!isSse) {
      let json: unknown;
      try {
        json = JSON.parse(await readCappedText(res));
      } catch {
        return {
          id: 'rpc.messageStream.contentType',
          title: `${methods.stream} responds with text/event-stream`,
          severity,
          status: 'fail',
          message: `got Content-Type: ${ct || '(none)'} and non-JSON body`,
          durationMs: now() - t0,
        };
      }
      const parsed = JsonRpcResponseSchema.safeParse(json);
      if (parsed.success && isErrorResponse(parsed.data)) {
        // Declared streaming + no SSE + error is false advertising, not a
        // warning. Otherwise still warn so opportunistic probing is soft.
        return {
          id: 'rpc.messageStream.contentType',
          title: `${methods.stream} responds with text/event-stream`,
          severity,
          status: hints.streaming === true ? 'fail' : 'warn',
          message: `server returned JSON-RPC error ${parsed.data.error.code} instead of SSE — streaming may not be supported`,
          durationMs: now() - t0,
        };
      }
      return {
        id: 'rpc.messageStream.contentType',
        title: `${methods.stream} responds with text/event-stream`,
        severity,
        status: 'fail',
        message: `got Content-Type: ${ct || '(none)'}`,
        durationMs: now() - t0,
      };
    }

    try {
      await res.body?.cancel();
    } catch {
      // Ignore — stream wasn't consumable.
    }

    return {
      id: 'rpc.messageStream.contentType',
      title: `${methods.stream} responds with text/event-stream`,
      severity,
      status: 'pass',
      durationMs: now() - t0,
    };
  } catch (err) {
    return {
      id: 'rpc.messageStream.contentType',
      title: `${methods.stream} responds with text/event-stream`,
      severity,
      status: 'fail',
      message: redactInText(err instanceof Error ? err.message : String(err)),
      durationMs: now() - t0,
    };
  }
}

export async function methodChecks(
  endpoint: string,
  profile: SpecProfile,
  hints: CapabilityHints = {},
  po: ProbeOptions = {},
): Promise<CheckResult[]> {
  return [
    await messageSendCheck(endpoint, profile, po),
    await messageStreamContentTypeCheck(endpoint, profile, hints, po),
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
