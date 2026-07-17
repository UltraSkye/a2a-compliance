export type SpecVersion = '0.2' | '0.3' | '1.0';

export interface SpecMethods {
  send: string;
  stream: string;
  get: string;
  cancel: string;
  resubscribe: string;
  pushSet: string;
  pushGet: string;
}

// Method names per A2A spec version. 0.2 used the tasks/* namespace,
// 0.3 renamed send/stream to message/* and the push-config namespace,
// 1.0 went proto-first and renamed every method to PascalCase.
export const SPEC_METHODS: Record<SpecVersion, SpecMethods> = {
  '0.2': {
    send: 'tasks/send',
    stream: 'tasks/sendSubscribe',
    get: 'tasks/get',
    cancel: 'tasks/cancel',
    resubscribe: 'tasks/resubscribe',
    pushSet: 'tasks/pushNotification/set',
    pushGet: 'tasks/pushNotification/get',
  },
  '0.3': {
    send: 'message/send',
    stream: 'message/stream',
    get: 'tasks/get',
    cancel: 'tasks/cancel',
    resubscribe: 'tasks/resubscribe',
    pushSet: 'tasks/pushNotificationConfig/set',
    pushGet: 'tasks/pushNotificationConfig/get',
  },
  '1.0': {
    send: 'SendMessage',
    stream: 'SendStreamingMessage',
    get: 'GetTask',
    cancel: 'CancelTask',
    resubscribe: 'SubscribeToTask',
    pushSet: 'CreateTaskPushNotificationConfig',
    pushGet: 'GetTaskPushNotificationConfig',
  },
};

export const KNOWN_SPEC_VERSIONS: readonly SpecVersion[] = ['0.2', '0.3', '1.0'];

// Spec 1.0 §6: an empty A2A-Version means a 0.3 client, so unknown or
// absent declarations probe with the 0.3 binding rather than the newest.
export const DEFAULT_SPEC_VERSION: SpecVersion = '0.3';

/**
 * Map a declared protocolVersion string to a known spec version by its
 * Major.Minor prefix ("0.3.0" → "0.3", "1.0.0" → "1.0"). Patch digits
 * never affect protocol compatibility per spec §6.
 */
export function normalizeSpecVersion(declared: string | undefined): SpecVersion | undefined {
  if (!declared) return undefined;
  const mm = /^(\d+\.\d+)(?:\.|$)/.exec(declared.trim())?.[1];
  if (!mm) return undefined;
  return (KNOWN_SPEC_VERSIONS as readonly string[]).includes(mm) ? (mm as SpecVersion) : undefined;
}

export function resolveSpecVersion(declared: string | undefined): SpecVersion {
  return normalizeSpecVersion(declared) ?? DEFAULT_SPEC_VERSION;
}

export interface SpecProfile {
  version: SpecVersion;
  methods: SpecMethods;
  /** Extra HTTP headers every probe carries — A2A-Version on 0.3+. */
  headers: Record<string, string>;
}

export function profileFor(version: SpecVersion): SpecProfile {
  return {
    version,
    methods: SPEC_METHODS[version],
    // 0.2 predates the A2A-Version service parameter; 0.3+ clients MUST
    // send it per spec §6.
    headers: version === '0.2' ? {} : { 'A2A-Version': version },
  };
}

export function methodsFor(version: SpecVersion): SpecMethods {
  return SPEC_METHODS[version];
}
