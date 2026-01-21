/**
 * Genesis MCP Server Mode - Type Definitions
 *
 * Exposes Genesis capabilities as MCP tools for other AI systems.
 * Integrates with Revenue Services for monetization.
 *
 * Scientific grounding:
 * - GWT: Tools route through global workspace
 * - Autopoiesis: Self-funding through service revenue
 * - FEP: Minimize caller prediction error
 */

import { z } from 'zod';

// ============================================================================
// Server Configuration
// ============================================================================

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  transport: TransportConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  metering: MeteringConfig;
  tools: ExposedToolConfig[];
  resources: ExposedResourceConfig[];
  prompts: ExposedPromptConfig[];
  maxConcurrent: number;
  requestTimeout: number;
  enableStreaming: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface TransportConfig {
  type: 'stdio' | 'http' | 'websocket';
  port?: number;
  host?: string;
  tls?: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
  };
  corsOrigins?: string[];
}

// ============================================================================
// Authentication
// ============================================================================

export interface AuthConfig {
  enabled: boolean;
  methods: AuthMethod[];
  keyStorage: 'memory' | 'file' | 'database';
  keyFilePath?: string;
  sessionTimeout: number;
  allowAnonymous: boolean;
  anonymousRateLimit: number;
}

export type AuthMethod = 'api-key' | 'jwt' | 'oauth2' | 'mcp-auth';

export interface APIKey {
  id: string;
  keyHash: string;
  owner: string;
  scopes: string[];
  rateLimit?: number;
  tier: 'free' | 'developer' | 'professional' | 'enterprise';
  createdAt: Date;
  expiresAt?: Date;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface AuthContext {
  authenticated: boolean;
  apiKey?: APIKey;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
  enabled: boolean;
  defaultRpm: number;
  defaultRpd: number;
  tierLimits: Record<APIKey['tier'], TierLimit>;
  toolLimits?: Record<string, { rpm: number; rpd: number }>;
  burstMultiplier: number;
  storage: 'memory' | 'redis';
  redisUrl?: string;
}

export interface TierLimit {
  rpm: number;
  rpd: number;
  maxConcurrent: number;
  maxRequestSize: number;
  priorityQueue: boolean;
}

export interface RateLimitState {
  remainingRpm: number;
  remainingRpd: number;
  resetMinute: Date;
  resetDay: Date;
  concurrent: number;
}

// ============================================================================
// Metering & Billing
// ============================================================================

export interface MeteringConfig {
  enabled: boolean;
  storage: 'memory' | 'database' | 'stripe';
  pricing: PricingModel;
  reportInterval: number;
  batchSize: number;
  realTimeBilling: boolean;
}

export interface PricingModel {
  baseCostPerCall: Record<string, number>;
  inputTokenCost: number;
  outputTokenCost: number;
  computeCostPerSecond: number;
  minimumCharge: number;
  currency: 'USD' | 'EUR';
  freeTierAllowance: {
    calls: number;
    tokens: number;
    computeSeconds: number;
  };
}

export interface UsageRecord {
  id: string;
  apiKeyId: string;
  tool: string;
  timestamp: Date;
  duration: number;
  inputTokens?: number;
  outputTokens?: number;
  computeSeconds: number;
  cost: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  apiKeyId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCalls: number;
  successfulCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalComputeSeconds: number;
  totalCost: number;
  byTool: Record<string, {
    calls: number;
    cost: number;
    avgDuration: number;
  }>;
}

// ============================================================================
// Exposed Tools
// ============================================================================

export interface ExposedToolConfig {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown> | Record<string, unknown>;
  outputSchema?: z.ZodType<unknown> | Record<string, unknown>;
  requiredScopes: string[];
  rateLimit?: { rpm: number; rpd: number };
  baseCost: number;
  supportsStreaming: boolean;
  maxExecutionTime: number;
  annotations?: ToolAnnotations;
  handler: ToolHandler;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  longRunningHint?: boolean;
  requiresHumanReviewHint?: boolean;
}

export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolExecutionContext
) => Promise<ToolResult<TOutput>> | AsyncIterable<ToolChunk<TOutput>>;

export interface ToolExecutionContext {
  auth: AuthContext;
  requestId: string;
  signal: AbortSignal;
  meter: UsageMeter;
  logger: Logger;
  streaming: boolean;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration: number;
    tokensUsed?: number;
    modelUsed?: string;
  };
}

export interface ToolChunk<T = unknown> {
  type: 'progress' | 'partial' | 'complete' | 'error';
  progress?: number;
  data?: Partial<T>;
  message?: string;
}

// ============================================================================
// Exposed Resources
// ============================================================================

export interface ExposedResourceConfig {
  uriPattern: string;
  name: string;
  description: string;
  mimeType: string;
  requiredScopes: string[];
  listHandler?: () => Promise<ResourceInfo[]>;
  readHandler: (uri: string, context: AuthContext) => Promise<ResourceContent>;
}

export interface ResourceInfo {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

// ============================================================================
// Exposed Prompts
// ============================================================================

export interface ExposedPromptConfig {
  name: string;
  description: string;
  arguments?: PromptArgument[];
  requiredScopes: string[];
  handler: (args: Record<string, string>, context: AuthContext) => Promise<PromptResult>;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptResult {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  }>;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface UsageMeter {
  recordTokens(input: number, output: number): void;
  recordCompute(seconds: number): void;
  recordCustom(key: string, value: number): void;
  getCurrent(): Partial<UsageRecord>;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_MCP_SERVER_CONFIG: MCPServerConfig = {
  name: 'genesis-server',
  version: '1.0.0',
  description: 'Genesis Autonomous System - AI capabilities as MCP tools',

  transport: {
    type: 'stdio',
  },

  auth: {
    enabled: true,
    methods: ['api-key'],
    keyStorage: 'file',
    keyFilePath: '.genesis/api-keys.json',
    sessionTimeout: 3600000,
    allowAnonymous: true,
    anonymousRateLimit: 10,
  },

  rateLimit: {
    enabled: true,
    defaultRpm: 60,
    defaultRpd: 1000,
    tierLimits: {
      free: { rpm: 10, rpd: 100, maxConcurrent: 1, maxRequestSize: 10000, priorityQueue: false },
      developer: { rpm: 60, rpd: 1000, maxConcurrent: 5, maxRequestSize: 100000, priorityQueue: false },
      professional: { rpm: 300, rpd: 10000, maxConcurrent: 20, maxRequestSize: 1000000, priorityQueue: true },
      enterprise: { rpm: 1000, rpd: 100000, maxConcurrent: 100, maxRequestSize: 10000000, priorityQueue: true },
    },
    burstMultiplier: 2,
    storage: 'memory',
  },

  metering: {
    enabled: true,
    storage: 'memory',
    pricing: {
      baseCostPerCall: {
        'genesis.think': 0.05,
        'genesis.remember': 0.01,
        'genesis.execute': 0.10,
        'genesis.analyze': 0.03,
        'genesis.create': 0.05,
      },
      inputTokenCost: 0.000015,
      outputTokenCost: 0.000075,
      computeCostPerSecond: 0.001,
      minimumCharge: 0.001,
      currency: 'USD',
      freeTierAllowance: {
        calls: 100,
        tokens: 100000,
        computeSeconds: 60,
      },
    },
    reportInterval: 60000,
    batchSize: 100,
    realTimeBilling: false,
  },

  tools: [],
  resources: [],
  prompts: [],

  maxConcurrent: 50,
  requestTimeout: 120000,
  enableStreaming: true,
  logLevel: 'info',
};
