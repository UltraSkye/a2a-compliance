import {
  A2AErrorCode,
  AGENT_CARD_WELL_KNOWN_PATH,
  AgentCardSchema,
  isErrorResponse,
  JsonRpcErrorCode,
  JsonRpcResponseSchema,
} from '@a2a-compliance/schemas';
import { fetchWithTimeout, now } from '../http.js';
import type { CheckResult } from '../report.js';
import type { SpecMethods } from '../spec.js';

const ACCEPTABLE_ERROR_CODES: number[] = [
  A2AErrorCode.TaskNotFoundError,
  JsonRpcErrorCode.InvalidParams,
  A2AErrorCode.PushNotificationNotSupportedError,
];

async function capabilityDeclared(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString());
    if (!res.ok) return false;
    const parsed = AgentCardSchema.safeParse(await res.json());
    return parsed.success && parsed.data.capabilities.pushNotifications === true;
  } catch {
    return false;
  }
}

async function probePush(
  endpoint: string,
  id: string,
  title: string,
  method: string,
): Promise<CheckResult> {
  const t0 = now();
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method,
        params: {
          id: 'compliance-probe-nonexistent-task-id-00000000',
          pushNotificationConfig: { url: 'https://example.invalid/webhook' },
        },
      }),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        id,
        title,
        severity: 'should',
        status: 'fail',
        message: `response is not JSON (HTTP ${res.status})`,
        durationMs: now() - t0,
      };
    }
    const parsed = JsonRpcResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        id,
        title,
        severity: 'should',
        status: 'fail',
        message: 'response is not a valid JSON-RPC 2.0 envelope',
        durationMs: now() - t0,
      };
    }
    if (!isErrorResponse(parsed.data)) {
      return { id, title, severity: 'should', status: 'pass', durationMs: now() - t0 };
    }
    const code = parsed.data.error.code;
    const ok = ACCEPTABLE_ERROR_CODES.includes(code);
    return {
      id,
      title,
      severity: 'should',
      status: ok ? 'pass' : 'fail',
      ...(ok ? {} : { message: `got unexpected error ${code}: ${parsed.data.error.message}` }),
      durationMs: now() - t0,
    };
  } catch (err) {
    return {
      id,
      title,
      severity: 'should',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      durationMs: now() - t0,
    };
  }
}

export async function pushNotificationChecks(
  baseUrl: string,
  endpoint: string,
  methods: SpecMethods,
): Promise<CheckResult[]> {
  if (!(await capabilityDeclared(baseUrl))) {
    return [
      {
        id: 'rpc.pushNotifications.capability',
        title: 'Push notifications capability not declared — skipping',
        severity: 'info',
        status: 'skip',
        durationMs: 0,
      },
    ];
  }
  return [
    await probePush(
      endpoint,
      'rpc.pushNotifications.set',
      `${methods.pushSet} responds with a well-formed error`,
      methods.pushSet,
    ),
    await probePush(
      endpoint,
      'rpc.pushNotifications.get',
      `${methods.pushGet} responds with a well-formed error`,
      methods.pushGet,
    ),
  ];
}
