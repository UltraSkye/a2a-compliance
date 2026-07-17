import {
  A2AErrorCode,
  AGENT_CARD_WELL_KNOWN_PATH,
  AgentCardSchema,
  isErrorResponse,
  JsonRpcErrorCode,
  JsonRpcResponseSchema,
} from '@a2a-compliance/schemas';
import {
  fetchWithTimeout,
  now,
  type ProbeOptions,
  readCappedJson,
  readCappedText,
} from '../http.js';
import { redactInText } from '../redact.js';
import type { CheckResult } from '../report.js';
import type { SpecProfile } from '../spec.js';

const ACCEPTABLE_ERROR_CODES: number[] = [
  A2AErrorCode.TaskNotFoundError,
  JsonRpcErrorCode.InvalidParams,
  A2AErrorCode.PushNotificationNotSupportedError,
];

async function capabilityDeclared(baseUrl: string, po: ProbeOptions = {}): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString(),
      po.pinDns === undefined ? {} : { pinDns: po.pinDns },
    );
    if (!res.ok) return false;
    const parsed = AgentCardSchema.safeParse(await readCappedJson(res));
    return parsed.success && parsed.data.capabilities.pushNotifications === true;
  } catch {
    return false;
  }
}

const PROBE_TASK_ID = 'compliance-probe-nonexistent-task-id-00000000';

function pushParams(profile: SpecProfile, kind: 'set' | 'get'): Record<string, unknown> {
  if (profile.version === '1.0') {
    // CreateTaskPushNotificationConfig takes a TaskPushNotificationConfig;
    // GetTaskPushNotificationConfigRequest takes {taskId, id}.
    return kind === 'set'
      ? {
          taskId: PROBE_TASK_ID,
          pushNotificationConfig: { url: 'https://example.invalid/webhook' },
        }
      : { taskId: PROBE_TASK_ID, id: 'compliance-probe-config-id-00000000' };
  }
  return {
    id: PROBE_TASK_ID,
    pushNotificationConfig: { url: 'https://example.invalid/webhook' },
  };
}

async function probePush(
  endpoint: string,
  id: string,
  title: string,
  method: string,
  kind: 'set' | 'get',
  profile: SpecProfile,
  severity: CheckResult['severity'],
  po: ProbeOptions = {},
): Promise<CheckResult> {
  const t0 = now();
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...profile.headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method,
        params: pushParams(profile, kind),
      }),
      ...(po.pinDns === undefined ? {} : { pinDns: po.pinDns }),
    });
    const text = await readCappedText(res);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        id,
        title,
        severity,
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
        severity,
        status: 'fail',
        message: 'response is not a valid JSON-RPC 2.0 envelope',
        durationMs: now() - t0,
      };
    }
    if (!isErrorResponse(parsed.data)) {
      return { id, title, severity, status: 'pass', durationMs: now() - t0 };
    }
    const code = parsed.data.error.code;
    const ok = ACCEPTABLE_ERROR_CODES.includes(code);
    return {
      id,
      title,
      severity,
      status: ok ? 'pass' : 'fail',
      ...(ok
        ? {}
        : {
            message: `got unexpected error ${code}: ${redactInText(parsed.data.error.message)}`,
          }),
      durationMs: now() - t0,
    };
  } catch (err) {
    return {
      id,
      title,
      severity,
      status: 'fail',
      message: redactInText(err instanceof Error ? err.message : String(err)),
      durationMs: now() - t0,
    };
  }
}

export async function pushNotificationChecks(
  baseUrl: string,
  endpoint: string,
  profile: SpecProfile,
  po: ProbeOptions = {},
): Promise<CheckResult[]> {
  const methods = profile.methods;
  if (!(await capabilityDeclared(baseUrl, po))) {
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
  // Capability declared → false-advertising rule applies. Probes are
  // promoted from SHOULD to MUST so an operator who claims push-config
  // support but doesn't implement it lands in NON_COMPLIANT rather than
  // collecting a warning and shipping anyway.
  const severity: CheckResult['severity'] = 'must';
  return [
    await probePush(
      endpoint,
      'rpc.pushNotifications.set',
      `${methods.pushSet} responds with a well-formed error`,
      methods.pushSet,
      'set',
      profile,
      severity,
      po,
    ),
    await probePush(
      endpoint,
      'rpc.pushNotifications.get',
      `${methods.pushGet} responds with a well-formed error`,
      methods.pushGet,
      'get',
      profile,
      severity,
      po,
    ),
  ];
}
