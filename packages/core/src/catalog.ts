import type { Category, Severity, SpecRef } from './report.js';

export interface CheckMeta {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  description: string;
  specRef?: SpecRef;
}

const A2A = 'https://a2a-protocol.org/latest/specification/';
const JSONRPC = 'https://www.jsonrpc.org/specification';

export const CHECK_CATALOG: Record<string, CheckMeta> = {
  'card.reachable': {
    id: 'card.reachable',
    category: 'card',
    severity: 'must',
    title: 'Agent card reachable',
    description:
      'The agent card MUST be served at /.well-known/agent-card.json and return HTTP 200. Clients cannot dispatch any RPC without it.',
    specRef: { section: 'Agent Card Discovery', url: `${A2A}#agent-card-discovery` },
  },
  'card.json': {
    id: 'card.json',
    category: 'card',
    severity: 'must',
    title: 'Agent card body is valid JSON',
    description: 'The agent card body MUST be valid JSON.',
    specRef: { section: 'Agent Card', url: `${A2A}#agent-card` },
  },
  'card.schema': {
    id: 'card.schema',
    category: 'card',
    severity: 'must',
    title: 'Agent card conforms to A2A schema',
    description:
      'The agent card MUST conform to the A2A agent-card schema. Structural violations break every downstream client.',
    specRef: { section: 'Agent Card Schema', url: `${A2A}#agent-card` },
  },
  'card.contentType': {
    id: 'card.contentType',
    category: 'card',
    severity: 'should',
    title: 'Agent card Content-Type is application/json',
    description: 'The agent card SHOULD be served with Content-Type: application/json.',
    specRef: { section: 'Agent Card Discovery', url: `${A2A}#agent-card-discovery` },
  },
  'card.urlAbsolute': {
    id: 'card.urlAbsolute',
    category: 'card',
    severity: 'must',
    title: 'card.url is an absolute http(s) URL',
    description:
      'card.url MUST be an absolute http(s) URL so clients know exactly where to dispatch JSON-RPC calls.',
  },
  'card.skillsNonEmpty': {
    id: 'card.skillsNonEmpty',
    category: 'card',
    severity: 'must',
    title: 'Agent card declares at least one skill',
    description: 'Cards with zero skills are indistinguishable from a non-compliant stub.',
  },
  'card.protocolVersion': {
    id: 'card.protocolVersion',
    category: 'spec',
    severity: 'should',
    title: 'Agent card declares a known protocolVersion',
    description:
      'The card SHOULD declare protocolVersion so clients can negotiate method names. Recognised values today: 0.3, 1.0.',
    specRef: { section: 'Agent Card', url: `${A2A}#agent-card` },
  },
  'rpc.parseError': {
    id: 'rpc.parseError',
    category: 'protocol',
    severity: 'must',
    title: 'Rejects invalid JSON with -32700 Parse error',
    description: 'JSON-RPC 2.0: malformed JSON MUST return error code -32700.',
    specRef: { section: 'error_object', url: `${JSONRPC}#error_object` },
  },
  'rpc.invalidRequest': {
    id: 'rpc.invalidRequest',
    category: 'protocol',
    severity: 'must',
    title: 'Rejects malformed envelope with -32600 Invalid Request',
    description: 'JSON-RPC 2.0: a request missing required envelope fields MUST return -32600.',
    specRef: { section: 'error_object', url: `${JSONRPC}#error_object` },
  },
  'rpc.methodNotFound': {
    id: 'rpc.methodNotFound',
    category: 'protocol',
    severity: 'must',
    title: 'Returns -32601 for unknown method',
    description: 'JSON-RPC 2.0: unknown methods MUST return error code -32601.',
    specRef: { section: 'error_object', url: `${JSONRPC}#error_object` },
  },
  'rpc.batch': {
    id: 'rpc.batch',
    category: 'protocol',
    severity: 'should',
    title: 'Handles a JSON-RPC batch request',
    description:
      'Per JSON-RPC 2.0 spec, batch is optional. Servers SHOULD either answer with an array of responses or reject the batch with a single -32600 error — but MUST NOT stall, echo a single response, or return malformed JSON.',
    specRef: { section: 'batch', url: `${JSONRPC}#batch` },
  },
  'rpc.tasksGet.notFound': {
    id: 'rpc.tasksGet.notFound',
    category: 'methods',
    severity: 'should',
    title: 'tasks/get returns TaskNotFoundError for unknown id',
    description:
      'tasks/get for an unknown id SHOULD return TaskNotFoundError (-32001); InvalidParams is tolerated when the id format is validated ahead of lookup.',
  },
  'rpc.tasksResubscribe.notFound': {
    id: 'rpc.tasksResubscribe.notFound',
    category: 'methods',
    severity: 'should',
    title: 'tasks/resubscribe rejects unknown id',
    description:
      'resubscribe is genuinely optional; acceptable responses are TaskNotFound, UnsupportedOperation, or InvalidParams.',
  },
  'rpc.tasksCancel.notFound': {
    id: 'rpc.tasksCancel.notFound',
    category: 'methods',
    severity: 'should',
    title: 'tasks/cancel rejects unknown id',
    description:
      'tasks/cancel SHOULD reject unknown ids with TaskNotFound / TaskNotCancelable / InvalidParams.',
  },
  'rpc.messageSend.shape': {
    id: 'rpc.messageSend.shape',
    category: 'methods',
    severity: 'must',
    title: 'message/send returns a valid JSON-RPC response',
    description:
      'The method MUST return a well-formed JSON-RPC response whose result is a Task or Message. A whitelist of sensible error codes is tolerated because a probe cannot know whether the agent supports text input.',
    specRef: { section: 'message/send', url: `${A2A}#message-send` },
  },
  'rpc.messageStream.contentType': {
    id: 'rpc.messageStream.contentType',
    category: 'methods',
    severity: 'should',
    title: 'message/stream responds with text/event-stream',
    description:
      'message/stream SHOULD respond with Content-Type: text/event-stream. When capabilities.streaming is declared, this check is promoted to MUST.',
    specRef: { section: 'message/stream', url: `${A2A}#message-stream` },
  },
  'rpc.pushNotifications.capability': {
    id: 'rpc.pushNotifications.capability',
    category: 'methods',
    severity: 'info',
    title: 'Push-notifications capability not declared — skipping',
    description:
      'Marker check emitted when capabilities.pushNotifications is absent or false so reports make clear the probe block was intentionally skipped.',
  },
  'rpc.pushNotifications.set': {
    id: 'rpc.pushNotifications.set',
    category: 'methods',
    severity: 'should',
    title: 'pushNotificationConfig/set responds correctly',
    description:
      'When the card declares pushNotifications capability, this check is promoted to MUST — false-advertising detection.',
    specRef: {
      section: 'pushNotificationConfig',
      url: `${A2A}#push-notifications`,
    },
  },
  'rpc.pushNotifications.get': {
    id: 'rpc.pushNotifications.get',
    category: 'methods',
    severity: 'should',
    title: 'pushNotificationConfig/get responds correctly',
    description:
      'When the card declares pushNotifications capability, this check is promoted to MUST — false-advertising detection.',
    specRef: {
      section: 'pushNotificationConfig',
      url: `${A2A}#push-notifications`,
    },
  },
  'sec.card.fetch': {
    id: 'sec.card.fetch',
    category: 'security',
    severity: 'info',
    title: 'Agent card fetched for security checks',
    description:
      'Marker check emitted when security probes could not fetch the card; the block is skipped rather than silently omitted.',
  },
  'sec.tls.https': {
    id: 'sec.tls.https',
    category: 'security',
    severity: 'must',
    title: 'All card URLs use HTTPS',
    description:
      'Every URL declared in the agent card MUST use https://. Cleartext leaks session material and enables on-path MitM against capability discovery.',
  },
  'sec.ssrf': {
    id: 'sec.ssrf',
    category: 'security',
    severity: 'must',
    title: 'No card URL resolves to private IP space',
    description:
      'A card URL resolving to loopback, link-local, RFC 1918, CGNAT, ULA, or cloud-metadata (169.254.169.254) turns the operator into an SSRF proxy.',
  },
  'sec.cors.wildcardWithCreds': {
    id: 'sec.cors.wildcardWithCreds',
    category: 'security',
    severity: 'must',
    title: 'No wildcard CORS with credentials',
    description:
      'Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true violates the CORS spec and enables cross-site credential theft.',
  },
  'auth.anonChallenge': {
    id: 'auth.anonChallenge',
    category: 'auth',
    severity: 'should',
    title: 'Unauthenticated requests are challenged',
    description:
      'When the card declares an authentication scheme, unauthenticated JSON-RPC calls SHOULD produce a 401+WWW-Authenticate header or a typed JSON-RPC error — NOT an opaque 200 result or a 500 stack trace.',
    specRef: { section: 'Authentication', url: `${A2A}#authentication` },
  },
  'auth.discovery': {
    id: 'auth.discovery',
    category: 'auth',
    severity: 'should',
    title: 'OAuth discovery endpoints resolve',
    description:
      'When oauth2 or openIdConnect schemes are declared, the card or .well-known/openid-configuration SHOULD be reachable so clients can discover endpoints.',
    specRef: { section: 'Authentication', url: `${A2A}#authentication` },
  },
};

export function listCheckIds(): string[] {
  return Object.keys(CHECK_CATALOG).sort();
}

export function explain(id: string): CheckMeta | undefined {
  return CHECK_CATALOG[id];
}

export function metaFor(id: string): CheckMeta | undefined {
  return CHECK_CATALOG[id];
}
