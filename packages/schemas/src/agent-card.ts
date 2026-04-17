import { z } from 'zod';

// A2A Agent Card schema — derived from spec v0.3 / v1.0 draft.
// Canonical URL: https://a2a-protocol.org/latest/specification/#agent-card
// Keep assertions here narrow & literal; richer semantic checks live in @a2a-compliance/core.

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
  url: z.string().url().optional(),
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
  url: z.string().url(),
  provider: AgentProviderSchema.optional(),
  version: z.string().min(1),
  documentationUrl: z.string().url().optional(),
  capabilities: AgentCapabilitiesSchema,
  authentication: AgentAuthenticationSchema.optional(),
  defaultInputModes: z.array(z.string()).optional(),
  defaultOutputModes: z.array(z.string()).optional(),
  skills: z.array(AgentSkillSchema).min(1),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

// Well-known agent card path — per spec.
export const AGENT_CARD_WELL_KNOWN_PATH = '/.well-known/agent-card.json';
