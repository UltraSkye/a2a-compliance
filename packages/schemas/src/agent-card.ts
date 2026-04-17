import { z } from 'zod';

// A2A Agent Card schema — derived from spec v0.3 / v1.0 draft.
// Canonical URL: https://a2a-protocol.org/latest/specification/#agent-card
// Keep assertions here narrow & literal; richer semantic checks live in @a2a-compliance/core.

/**
 * URL field that rejects non-http(s) schemes. Zod's `.url()` accepts
 * anything Node's URL parser accepts, including `javascript:`, `data:`,
 * `file:`, `mailto:`, `gopher:` — none of which an A2A client should
 * ever follow. Tightening this at the schema level prevents a malicious
 * agent card from feeding those URIs to downstream consumers of the
 * parsed card.
 */
const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        const p = new URL(u).protocol;
        return p === 'http:' || p === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be an http(s) URL' },
  );

export const AgentSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
  inputModes: z.array(z.string()).optional(),
  outputModes: z.array(z.string()).optional(),
});
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export const AgentProviderSchema = z.object({
  organization: z.string(),
  url: httpUrl.optional(),
});
export type AgentProvider = z.infer<typeof AgentProviderSchema>;

export const AgentAuthenticationSchema = z.object({
  schemes: z.array(
    z.enum(['none', 'basic', 'bearer', 'apiKey', 'oauth2', 'openIdConnect', 'mtls']),
  ),
  credentials: z.string().optional(),
});
export type AgentAuthentication = z.infer<typeof AgentAuthenticationSchema>;

export const AgentCapabilitiesSchema = z.object({
  streaming: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  stateTransitionHistory: z.boolean().optional(),
});
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

export const AgentCardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  url: httpUrl,
  provider: AgentProviderSchema.optional(),
  version: z.string().min(1),
  // Spec version (Agent2Agent protocol). Present from v0.3 onward. Missing
  // on very old or hand-rolled cards — treat as unknown.
  protocolVersion: z.string().optional(),
  documentationUrl: httpUrl.optional(),
  capabilities: AgentCapabilitiesSchema,
  authentication: AgentAuthenticationSchema.optional(),
  defaultInputModes: z.array(z.string()).optional(),
  defaultOutputModes: z.array(z.string()).optional(),
  skills: z.array(AgentSkillSchema).min(1),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

// Well-known agent card path — per spec.
export const AGENT_CARD_WELL_KNOWN_PATH = '/.well-known/agent-card.json';
