export type SpecVersion = '0.3' | '1.0';

export interface SpecMethods {
  send: string;
  stream: string;
  get: string;
  cancel: string;
  resubscribe: string;
  pushSet: string;
  pushGet: string;
}

// Method names per A2A spec version. v0.3 and v1.0 renamed the core
// "send a message" and "stream responses" methods (tasks/* → message/*),
// and the push-notification config sub-namespace.
export const SPEC_METHODS: Record<SpecVersion, SpecMethods> = {
  '0.3': {
    send: 'tasks/send',
    stream: 'tasks/sendSubscribe',
    get: 'tasks/get',
    cancel: 'tasks/cancel',
    resubscribe: 'tasks/resubscribe',
    pushSet: 'tasks/pushNotification/set',
    pushGet: 'tasks/pushNotification/get',
  },
  '1.0': {
    send: 'message/send',
    stream: 'message/stream',
    get: 'tasks/get',
    cancel: 'tasks/cancel',
    resubscribe: 'tasks/resubscribe',
    pushSet: 'tasks/pushNotificationConfig/set',
    pushGet: 'tasks/pushNotificationConfig/get',
  },
};

export const KNOWN_SPEC_VERSIONS: readonly SpecVersion[] = ['0.3', '1.0'];
export const DEFAULT_SPEC_VERSION: SpecVersion = '1.0';

/**
 * Normalise a declared protocolVersion string. Anything we don't explicitly
 * know about falls back to the default so that probe names stay sensible;
 * the runner surfaces the mismatch as a SHOULD-level warning separately.
 */
export function resolveSpecVersion(declared: string | undefined): SpecVersion {
  if (declared === '0.3' || declared === '1.0') return declared;
  return DEFAULT_SPEC_VERSION;
}

export function methodsFor(version: SpecVersion): SpecMethods {
  return SPEC_METHODS[version];
}
