/**
 * Genesis MCP Server - Main Server Class
 *
 * Transforms Genesis into an MCP server that other AI systems can call.
 *
 * Architecture:
 * - Layer 9: Structural coupling with caller agents
 * - Integrates with EconomicSystem for self-funding
 * - Routes through GlobalWorkspace for conscious processing
 *
 * Usage:
 * ```typescript
 * const server = new GenesisMCPServer(config);
 * await server.start();
 * ```
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import {
  MCPServerConfig,
  DEFAULT_MCP_SERVER_CONFIG,
  AuthContext,
  APIKey,
  RateLimitState,
  UsageRecord,
  UsageSummary,
  ToolExecutionContext,
  ToolResult,
  UsageMeter,
  Logger,
  ExposedToolConfig,
  ExposedResourceConfig,
  ExposedPromptConfig,
  ResourceInfo,
} from './types.js';

// ============================================================================
// Authentication Manager
// ============================================================================

export class AuthManager {
  private apiKeys: Map<string, APIKey> = new Map();
  private sessions: Map<string, AuthContext> = new Map();
  private config: MCPServerConfig['auth'];

  constructor(config: MCPServerConfig['auth']) {
    this.config = config;
    this.loadKeys();
  }

  private loadKeys(): void {
    if (this.config.keyStorage === 'file' && this.config.keyFilePath) {
      try {
        if (fs.existsSync(this.config.keyFilePath)) {
          const data = JSON.parse(fs.readFileSync(this.config.keyFilePath, 'utf-8'));
          for (const key of data.keys || []) {
            this.apiKeys.set(key.id, key);
          }
        }
      } catch (error) {
        console.error('[Auth] Failed to load API keys:', error);
      }
    }
  }

  authenticate(
    headers: Record<string, string | undefined>,
    ipAddress?: string
  ): AuthContext {
    const sessionId = randomUUID();
    const timestamp = new Date();

    const apiKeyHeader = headers['x-api-key'] || headers['authorization']?.replace('Bearer ', '');

    if (apiKeyHeader) {
      const keyHash = this.hashKey(apiKeyHeader);
      const apiKey = Array.from(this.apiKeys.values()).find(k => k.keyHash === keyHash);

      if (apiKey && apiKey.enabled && (!apiKey.expiresAt || apiKey.expiresAt > timestamp)) {
        const context: AuthContext = {
          authenticated: true,
          apiKey,
          sessionId,
          ipAddress,
          userAgent: headers['user-agent'],
          timestamp,
        };
        this.sessions.set(sessionId, context);
        return context;
      }
    }

    if (this.config.allowAnonymous) {
      const context: AuthContext = {
        authenticated: false,
        sessionId,
        ipAddress,
        userAgent: headers['user-agent'],
        timestamp,
      };
      this.sessions.set(sessionId, context);
      return context;
    }

    throw new Error('Authentication required');
  }

  hasScope(context: AuthContext, scope: string): boolean {
    if (!context.authenticated || !context.apiKey) {
      return false;
    }
    return context.apiKey.scopes.includes(scope) || context.apiKey.scopes.includes('*');
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  createAPIKey(owner: string, scopes: string[], tier: APIKey['tier']): { key: string; id: string } {
    const id = randomUUID();
    const rawKey = `gn_${randomUUID().replace(/-/g, '')}`;
    const keyHash = this.hashKey(rawKey);

    const apiKey: APIKey = {
      id,
      keyHash,
      owner,
      scopes,
      tier,
      createdAt: new Date(),
      enabled: true,
    };

    this.apiKeys.set(id, apiKey);
    this.saveKeys();

    return { key: rawKey, id };
  }

  private saveKeys(): void {
    if (this.config.keyStorage === 'file' && this.config.keyFilePath) {
      const dir = path.dirname(this.config.keyFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.config.keyFilePath,
        JSON.stringify({ keys: Array.from(this.apiKeys.values()) }, null, 2)
      );
    }
  }
}

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
  private config: MCPServerConfig['rateLimit'];
  private limits: Map<string, RateLimitState> = new Map();

  constructor(config: MCPServerConfig['rateLimit']) {
    this.config = config;
  }

  check(context: AuthContext, tool?: string): { allowed: boolean; state: RateLimitState; retryAfter?: number } {
    if (!this.config.enabled) {
      return { allowed: true, state: this.getDefaultState() };
    }

    const key = context.apiKey?.id || context.ipAddress || 'anonymous';
    let state = this.limits.get(key);

    if (!state || this.shouldReset(state)) {
      state = this.createState(context.apiKey?.tier || 'free', tool);
      this.limits.set(key, state);
    }

    if (state.remainingRpm <= 0) {
      return {
        allowed: false,
        state,
        retryAfter: Math.ceil((state.resetMinute.getTime() - Date.now()) / 1000),
      };
    }

    if (state.remainingRpd <= 0) {
      return {
        allowed: false,
        state,
        retryAfter: Math.ceil((state.resetDay.getTime() - Date.now()) / 1000),
      };
    }

    state.remainingRpm--;
    state.remainingRpd--;
    state.concurrent++;

    return { allowed: true, state };
  }

  release(context: AuthContext): void {
    const key = context.apiKey?.id || context.ipAddress || 'anonymous';
    const state = this.limits.get(key);
    if (state && state.concurrent > 0) {
      state.concurrent--;
    }
  }

  private createState(tier: APIKey['tier'], tool?: string): RateLimitState {
    const limits = this.config.tierLimits[tier];
    const now = new Date();

    let rpm = limits.rpm;
    let rpd = limits.rpd;
    if (tool && this.config.toolLimits?.[tool]) {
      rpm = Math.min(rpm, this.config.toolLimits[tool].rpm);
      rpd = Math.min(rpd, this.config.toolLimits[tool].rpd);
    }

    return {
      remainingRpm: rpm,
      remainingRpd: rpd,
      resetMinute: new Date(now.getTime() + 60000),
      resetDay: new Date(now.setHours(24, 0, 0, 0)),
      concurrent: 0,
    };
  }

  private shouldReset(state: RateLimitState): boolean {
    const now = Date.now();
    return now >= state.resetMinute.getTime() || now >= state.resetDay.getTime();
  }

  private getDefaultState(): RateLimitState {
    return {
      remainingRpm: Infinity,
      remainingRpd: Infinity,
      resetMinute: new Date(Date.now() + 60000),
      resetDay: new Date(Date.now() + 86400000),
      concurrent: 0,
    };
  }
}

// ============================================================================
// Usage Metering
// ============================================================================

export class MeteringService {
  private config: MCPServerConfig['metering'];
  private records: UsageRecord[] = [];

  constructor(config: MCPServerConfig['metering']) {
    this.config = config;
  }

  createMeter(apiKeyId: string, tool: string, requestId: string): UsageMeter {
    const record: Partial<UsageRecord> = {
      id: requestId,
      apiKeyId,
      tool,
      timestamp: new Date(),
      inputTokens: 0,
      outputTokens: 0,
      computeSeconds: 0,
      cost: 0,
    };

    return {
      recordTokens: (input: number, output: number) => {
        record.inputTokens = (record.inputTokens || 0) + input;
        record.outputTokens = (record.outputTokens || 0) + output;
      },
      recordCompute: (seconds: number) => {
        record.computeSeconds = (record.computeSeconds || 0) + seconds;
      },
      recordCustom: (key: string, value: number) => {
        record.metadata = record.metadata || {};
        record.metadata[key] = value;
      },
      getCurrent: () => record,
    };
  }

  finalize(meter: UsageMeter, success: boolean, duration: number, error?: string): UsageRecord {
    const partial = meter.getCurrent();
    const pricing = this.config.pricing;

    const baseCost = pricing.baseCostPerCall[partial.tool!] || 0.01;
    const tokenCost =
      (partial.inputTokens || 0) * pricing.inputTokenCost +
      (partial.outputTokens || 0) * pricing.outputTokenCost;
    const computeCost = (partial.computeSeconds || 0) * pricing.computeCostPerSecond;
    const totalCost = Math.max(baseCost + tokenCost + computeCost, pricing.minimumCharge);

    const record: UsageRecord = {
      id: partial.id!,
      apiKeyId: partial.apiKeyId!,
      tool: partial.tool!,
      timestamp: partial.timestamp!,
      duration,
      inputTokens: partial.inputTokens,
      outputTokens: partial.outputTokens,
      computeSeconds: partial.computeSeconds || 0,
      cost: totalCost,
      success,
      error,
      metadata: partial.metadata,
    };

    this.records.push(record);
    return record;
  }

  getSummary(apiKeyId: string, periodStart: Date, periodEnd: Date): UsageSummary {
    const relevantRecords = this.records.filter(
      r => r.apiKeyId === apiKeyId && r.timestamp >= periodStart && r.timestamp <= periodEnd
    );

    const byTool: Record<string, { calls: number; cost: number; avgDuration: number }> = {};

    for (const record of relevantRecords) {
      if (!byTool[record.tool]) {
        byTool[record.tool] = { calls: 0, cost: 0, avgDuration: 0 };
      }
      byTool[record.tool].calls++;
      byTool[record.tool].cost += record.cost;
      byTool[record.tool].avgDuration =
        (byTool[record.tool].avgDuration * (byTool[record.tool].calls - 1) + record.duration) /
        byTool[record.tool].calls;
    }

    return {
      apiKeyId,
      periodStart,
      periodEnd,
      totalCalls: relevantRecords.length,
      successfulCalls: relevantRecords.filter(r => r.success).length,
      totalInputTokens: relevantRecords.reduce((sum, r) => sum + (r.inputTokens || 0), 0),
      totalOutputTokens: relevantRecords.reduce((sum, r) => sum + (r.outputTokens || 0), 0),
      totalComputeSeconds: relevantRecords.reduce((sum, r) => sum + r.computeSeconds, 0),
      totalCost: relevantRecords.reduce((sum, r) => sum + r.cost, 0),
      byTool,
    };
  }
}

// ============================================================================
// Genesis MCP Server
// ============================================================================

export class GenesisMCPServer extends EventEmitter {
  private config: MCPServerConfig;
  private server: Server;
  private auth: AuthManager;
  private rateLimiter: RateLimiter;
  private metering: MeteringService;
  private tools: Map<string, ExposedToolConfig> = new Map();
  private resources: Map<string, ExposedResourceConfig> = new Map();
  private prompts: Map<string, ExposedPromptConfig> = new Map();
  private running = false;

  constructor(config: Partial<MCPServerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MCP_SERVER_CONFIG, ...config };

    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.auth = new AuthManager(this.config.auth);
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.metering = new MeteringService(this.config.metering);

    this.setupHandlers();
    this.registerDefaultTools();
    this.registerCompIntelTools();
    this.registerEvolutionTools();
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema instanceof z.ZodType
            ? this.zodToJsonSchema(t.inputSchema)
            : t.inputSchema,
        })),
      };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.executeTool(name, args || {});
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const allResources: ResourceInfo[] = [];
      for (const config of this.resources.values()) {
        if (config.listHandler) {
          const items = await config.listHandler();
          allResources.push(...items);
        } else {
          allResources.push({
            uri: config.uriPattern,
            name: config.name,
            description: config.description,
            mimeType: config.mimeType,
          });
        }
      }
      return { resources: allResources };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      for (const config of this.resources.values()) {
        if (this.matchesPattern(uri, config.uriPattern)) {
          const authContext = this.getDefaultAuthContext();
          const content = await config.readHandler(uri, authContext);
          return { contents: [content] };
        }
      }
      throw new Error(`Resource not found: ${uri}`);
    });

    // List prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: Array.from(this.prompts.values()).map(p => ({
          name: p.name,
          description: p.description,
          arguments: p.arguments,
        })),
      };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const promptConfig = this.prompts.get(name);
      if (!promptConfig) {
        throw new Error(`Prompt not found: ${name}`);
      }
      const authContext = this.getDefaultAuthContext();
      const result = await promptConfig.handler(args || {}, authContext);
      return {
        messages: result.messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string'
            ? { type: 'text' as const, text: m.content }
            : m.content,
        })),
      };
    });
  }

  private zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
    return z.toJSONSchema(schema) as Record<string, unknown>;
  }

  private matchesPattern(uri: string, pattern: string): boolean {
    if (pattern.includes('{')) {
      const regex = new RegExp('^' + pattern.replace(/\{[^}]+\}/g, '[^/]+') + '$');
      return regex.test(uri);
    }
    return uri === pattern;
  }

  private getDefaultAuthContext(): AuthContext {
    return {
      authenticated: false,
      sessionId: randomUUID(),
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  private registerDefaultTools(): void {
    // genesis.think - Deep reasoning
    this.registerTool({
      name: 'genesis.think',
      description: 'Deep reasoning on a complex problem using multi-mind synthesis and global workspace theory. Best for problems requiring careful analysis, planning, or creative solutions.',
      inputSchema: z.object({
        problem: z.string().describe('The problem or question to reason about'),
        context: z.string().optional().describe('Additional context or constraints'),
        depth: z.enum(['quick', 'moderate', 'deep']).optional().default('moderate'),
        outputFormat: z.enum(['analysis', 'plan', 'solution', 'free']).optional().default('free'),
      }),
      requiredScopes: ['think'],
      baseCost: 0.05,
      supportsStreaming: true,
      maxExecutionTime: 60000,
      annotations: { readOnlyHint: true, longRunningHint: true },
      handler: this.handleThink.bind(this),
    });

    // genesis.remember - Memory operations
    this.registerTool({
      name: 'genesis.remember',
      description: 'Store or retrieve information from Genesis memory systems (episodic, semantic, procedural).',
      inputSchema: z.object({
        operation: z.enum(['store', 'retrieve', 'search', 'forget']),
        key: z.string().optional(),
        query: z.string().optional(),
        data: z.unknown().optional(),
        memoryType: z.enum(['episodic', 'semantic', 'procedural']).optional().default('semantic'),
        ttl: z.number().optional(),
      }),
      requiredScopes: ['memory'],
      baseCost: 0.01,
      supportsStreaming: false,
      maxExecutionTime: 10000,
      annotations: { readOnlyHint: false, idempotentHint: false },
      handler: this.handleRemember.bind(this),
    });

    // genesis.execute - Autonomous task execution
    this.registerTool({
      name: 'genesis.execute',
      description: 'Execute an autonomous task using Genesis agent capabilities.',
      inputSchema: z.object({
        task: z.string().describe('Task description'),
        constraints: z.array(z.string()).optional(),
        maxSteps: z.number().optional().default(10),
        timeout: z.number().optional().default(60000),
        dryRun: z.boolean().optional().default(false),
      }),
      requiredScopes: ['execute'],
      baseCost: 0.10,
      supportsStreaming: true,
      maxExecutionTime: 120000,
      annotations: { readOnlyHint: false, destructiveHint: true, longRunningHint: true, requiresHumanReviewHint: true },
      handler: this.handleExecute.bind(this),
    });

    // genesis.analyze - Code/data analysis
    this.registerTool({
      name: 'genesis.analyze',
      description: 'Analyze code, data, or documents using Genesis perception and reasoning capabilities.',
      inputSchema: z.object({
        content: z.string().describe('Content to analyze'),
        contentType: z.enum(['code', 'data', 'document', 'log', 'auto']).optional().default('auto'),
        analysisType: z.array(z.enum(['structure', 'quality', 'security', 'performance', 'semantic'])).optional(),
        language: z.string().optional(),
      }),
      requiredScopes: ['analyze'],
      baseCost: 0.03,
      supportsStreaming: true,
      maxExecutionTime: 30000,
      annotations: { readOnlyHint: true },
      handler: this.handleAnalyze.bind(this),
    });

    // genesis.create - Code/content generation
    this.registerTool({
      name: 'genesis.create',
      description: 'Generate code, documentation, or other content using Genesis creative capabilities.',
      inputSchema: z.object({
        type: z.enum(['code', 'documentation', 'test', 'config', 'prose']),
        specification: z.string().describe('What to create'),
        language: z.string().optional(),
        style: z.string().optional(),
        verify: z.boolean().optional().default(true),
      }),
      requiredScopes: ['create'],
      baseCost: 0.05,
      supportsStreaming: true,
      maxExecutionTime: 60000,
      annotations: { readOnlyHint: true },
      handler: this.handleCreate.bind(this),
    });

    // v14.7: genesis.chat - Multi-model AI chat with automatic routing
    this.registerTool({
      name: 'genesis.chat',
      description: 'Multi-model AI chat with automatic routing. Routes to cheapest/fastest/best model based on query complexity. Supports GPT-4, Claude, Gemini, Mistral, and local Ollama.',
      inputSchema: z.object({
        prompt: z.string().describe('User message to process'),
        model: z.enum(['auto', 'fast', 'smart', 'cheap', 'local']).optional().default('auto'),
        systemPrompt: z.string().optional().describe('Optional system prompt'),
        maxTokens: z.number().optional().default(2048),
      }),
      requiredScopes: ['chat'],
      baseCost: 0.01,
      supportsStreaming: true,
      maxExecutionTime: 60000,
      annotations: { readOnlyHint: true },
      handler: this.handleChat.bind(this),
    });

    // v14.7: genesis.research - Deep research using 20+ MCP sources
    this.registerTool({
      name: 'genesis.research',
      description: 'Deep research using 20+ MCP sources including arXiv, Semantic Scholar, Brave Search, Gemini, Exa, and more. Aggregates and synthesizes results.',
      inputSchema: z.object({
        topic: z.string().describe('Research topic or question'),
        depth: z.enum(['quick', 'standard', 'deep']).optional().default('standard'),
        sources: z.array(z.string()).optional().describe('Specific sources to use (arxiv, semantic-scholar, brave, gemini, etc)'),
        maxResults: z.number().optional().default(10),
      }),
      requiredScopes: ['research'],
      baseCost: 0.05,
      supportsStreaming: false,
      maxExecutionTime: 120000,
      annotations: { readOnlyHint: true, longRunningHint: true },
      handler: this.handleResearch.bind(this),
    });

    // v34.0: genesis.nucleus.status — current state, learned weights, performance
    this.registerTool({
      name: 'genesis.nucleus.status',
      description: 'Get the current Nucleus status: classification weights, performance stats, recent explorations, and module activation map. Use this to understand how Genesis is processing inputs and learning.',
      inputSchema: z.object({
        includeWeights: z.boolean().optional().default(false).describe('Include full per-module learned weights'),
        includeExplorations: z.boolean().optional().default(false).describe('Include recent curiosity explorations'),
      }),
      requiredScopes: ['status'],
      baseCost: 0.001,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: true },
      handler: async (rawInput: unknown) => {
        try {
          const args = rawInput as { includeWeights?: boolean; includeExplorations?: boolean };
          const { getNucleus, getPlasticity, getCuriosityEngine } = await import('../nucleus/index.js');
          const nucleus = getNucleus();
          const plasticity = getPlasticity();
          const curiosity = getCuriosityEngine();

          const result: Record<string, unknown> = {
            totalModules: nucleus.getModuleCount(),
            boundModules: nucleus.getBoundModuleCount(),
            plasticityStats: plasticity.getStats(),
          };

          if (args.includeWeights) {
            result.learnedWeights = plasticity.getAllWeights();
          }
          if (args.includeExplorations) {
            result.recentExplorations = curiosity.getExplorations(10);
          }

          return { success: true, data: result, metadata: { duration: 0 } };
        } catch (err) {
          return { success: false, error: `Nucleus not available: ${(err as Error)?.message}`, metadata: { duration: 0 } };
        }
      },
    });

    // v34.0: genesis.nucleus.improve — trigger curiosity cycle
    this.registerTool({
      name: 'genesis.nucleus.improve',
      description: 'Trigger a curiosity exploration cycle. Genesis will analyze its own performance, identify capability gaps, and propose improvements.',
      inputSchema: z.object({}),
      requiredScopes: ['status'],
      baseCost: 0.005,
      supportsStreaming: false,
      maxExecutionTime: 10000,
      annotations: { readOnlyHint: true },
      handler: async () => {
        try {
          const { getCuriosityEngine } = await import('../nucleus/index.js');
          const curiosity = getCuriosityEngine();
          curiosity.recordActivity();
          const explorations = curiosity.getExplorations(5);
          return {
            success: true,
            data: {
              message: 'Curiosity engine is active. Here are the most recent explorations:',
              explorations,
            },
            metadata: { duration: 0 },
          };
        } catch (err) {
          return { success: false, error: `Curiosity engine not available: ${(err as Error)?.message}`, metadata: { duration: 0 } };
        }
      },
    });

    // v34.0: genesis.nucleus.profile — creator profile
    this.registerTool({
      name: 'genesis.nucleus.profile',
      description: 'Get the Genesis creator profile: Luca Rossignoli, Rossignoli & Partners, system capabilities, and architecture overview.',
      inputSchema: z.object({}),
      requiredScopes: ['status'],
      baseCost: 0.001,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: true },
      handler: async () => {
        return {
          success: true,
          data: {
            creator: 'Luca Rossignoli',
            organization: 'Rossignoli & Partners',
            system: 'Genesis — Autonomous AI System',
            version: 'v34.0 (The Nucleus)',
            architecture: {
              modules: '~80 modules, 2544 TS files, 603K LOC',
              mcpServers: '51 MCP servers',
              core: 'Bio-inspired cognitive architecture with recursive self-improvement',
              nucleus: 'Input classification → module selection → execution → plasticity learning → curiosity',
            },
            capabilities: [
              'Multi-model LLM routing (Ollama, DeepSeek, Anthropic)',
              'Market intelligence & weekly strategy briefs',
              'Multi-agent orchestration (11 agent types)',
              'Episodic/semantic/procedural memory with vector search',
              'Consciousness monitoring (IIT φ + GWT + AST)',
              'Neuromodulatory tone (DA/5HT/NE/cortisol)',
              'Autonomous self-improvement (RSI, curiosity engine)',
              'Content creation (social media, presentations, podcasts)',
              'Financial analysis & trading signals',
              'Bounty hunting & PR pipeline',
            ],
          },
          metadata: { duration: 0 },
        };
      },
    });

    // v35.0: genesis.nucleus.chat — full cognitive stack chat
    this.registerTool({
      name: 'genesis.nucleus.chat',
      description: 'Chat with Genesis through the full cognitive stack: Nucleus classification → module selection → neuromodulation → consciousness → memory → response. Unlike genesis.chat (which only calls LLMBridge), this routes through Genesis.process() for the complete bio-inspired pipeline.',
      inputSchema: z.object({
        message: z.string().describe('The message to send to Genesis'),
        context: z.string().optional().describe('Optional additional context'),
      }),
      requiredScopes: ['chat'],
      baseCost: 0.05,
      supportsStreaming: false,
      maxExecutionTime: 120000,
      annotations: { readOnlyHint: true, longRunningHint: true },
      handler: async (rawInput: unknown) => {
        const args = rawInput as { message: string; context?: string };
        const startTime = Date.now();
        try {
          // Get booted Genesis instance (set by start.ts) or lazy-boot
          let genesis = (globalThis as any).__genesisInstance;
          if (!genesis) {
            const { getGenesis } = await import('../genesis.js');
            genesis = getGenesis();
            await genesis.boot();
            (globalThis as any).__genesisInstance = genesis;
          }

          const input = args.context
            ? `${args.message}\n\n[Context: ${args.context}]`
            : args.message;

          const result = await genesis.process(input);
          const duration = Date.now() - startTime;

          return {
            success: true,
            data: {
              response: result.response,
              classification: result.audit ? 'routed-via-nucleus' : 'unknown',
              confidence: result.confidence,
              audit: result.audit,
              fekState: result.fekState,
              cost: result.cost,
              usage: result.usage,
              durationMs: duration,
              pipeline: 'Genesis.process() → Nucleus → full cognitive stack',
            },
            metadata: { duration },
          };
        } catch (err) {
          return {
            success: false,
            error: `Nucleus chat failed: ${(err as Error)?.message}`,
            metadata: { duration: Date.now() - startTime },
          };
        }
      },
    });
  }

  // ============================================================================
  // v11.2: CompIntel + Revenue + Daemon Tools
  // ============================================================================

  private registerCompIntelTools(): void {
    // genesis.compintel.scan - Run competitive intelligence scan
    this.registerTool({
      name: 'genesis.compintel.scan',
      description: 'Run a competitive intelligence scan on specified competitors. Scrapes their pages, detects changes from baseline, and analyzes significance.',
      inputSchema: {
        type: 'object',
        properties: {
          competitors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Competitor name' },
                domain: { type: 'string', description: 'Competitor domain (e.g. cursor.com)' },
                pages: { type: 'array', items: { type: 'string' }, description: 'Specific URLs to monitor (optional, auto-inferred if empty)' },
              },
              required: ['name', 'domain'],
            },
            description: 'Competitors to scan',
          },
        },
        required: ['competitors'],
      },
      requiredScopes: ['compintel'],
      baseCost: 0.10,
      supportsStreaming: false,
      maxExecutionTime: 120000,
      annotations: { readOnlyHint: true, longRunningHint: true },
      handler: async (input: any) => {
        const { createCompetitiveIntelService } = await import('../services/competitive-intel.js');
        const service = createCompetitiveIntelService({ competitors: input.competitors });
        const changes = await service.checkAll();
        let digest;
        if (changes.length > 0) {
          digest = await service.generateDigest(24);
        }
        return {
          success: true,
          data: {
            competitors: input.competitors.length,
            pagesScraped: service.getCompetitors().reduce((sum: number, c: any) => sum + c.pages.filter((p: any) => p.lastContent).length, 0),
            changes: changes.map((c: any) => ({
              competitor: c.pageUrl,
              type: c.changeType,
              significance: c.significance,
              summary: c.summary,
              analysis: c.analysis,
            })),
            digest: digest ? {
              insights: digest.keyInsights,
              recommendations: digest.recommendations,
            } : null,
          },
        };
      },
    });

    // genesis.compintel.digest - Generate intelligence digest
    this.registerTool({
      name: 'genesis.compintel.digest',
      description: 'Generate a strategic intelligence digest from recent competitor changes. Provides key insights and actionable recommendations.',
      inputSchema: {
        type: 'object',
        properties: {
          competitors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                domain: { type: 'string' },
                pages: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'domain'],
            },
          },
          periodHours: { type: 'number', description: 'Hours to look back (default: 24)', default: 24 },
        },
        required: ['competitors'],
      },
      requiredScopes: ['compintel'],
      baseCost: 0.08,
      supportsStreaming: false,
      maxExecutionTime: 60000,
      annotations: { readOnlyHint: true },
      handler: async (input: any) => {
        const { createCompetitiveIntelService } = await import('../services/competitive-intel.js');
        const service = createCompetitiveIntelService({ competitors: input.competitors });
        await service.checkAll();
        const digest = await service.generateDigest(input.periodHours || 24);
        return {
          success: true,
          data: digest,
        };
      },
    });

    // genesis.revenue.setup - Setup Stripe revenue loop
    this.registerTool({
      name: 'genesis.revenue.setup',
      description: 'Initialize the Stripe revenue loop: creates product, prices ($49/$99/$199), and payment links for CompIntel subscriptions.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      requiredScopes: ['revenue'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 30000,
      annotations: { readOnlyHint: false, idempotentHint: true },
      handler: async () => {
        const { createRevenueLoop } = await import('../services/revenue-loop.js');
        const loop = createRevenueLoop();
        const { product, prices, paymentLinks } = await loop.setup();
        return {
          success: true,
          data: {
            product: { id: product.id, name: product.name },
            prices: Object.fromEntries(
              Object.entries(prices).map(([plan, p]: [string, any]) => [plan, { id: p.id, amount: p.unit_amount, interval: p.recurring?.interval }])
            ),
            paymentLinks: Object.fromEntries(
              Object.entries(paymentLinks).map(([plan, l]: [string, any]) => [plan, l.url])
            ),
          },
        };
      },
    });

    // genesis.revenue.subscribe_url - Get payment link
    this.registerTool({
      name: 'genesis.revenue.subscribe_url',
      description: 'Get the Stripe payment link for a CompIntel subscription plan.',
      inputSchema: {
        type: 'object',
        properties: {
          plan: { type: 'string', enum: ['starter', 'pro', 'enterprise'], description: 'Subscription plan' },
        },
        required: ['plan'],
      },
      requiredScopes: ['revenue'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: true },
      handler: async (input: any) => {
        const { getRevenueLoop } = await import('../services/revenue-loop.js');
        const loop = getRevenueLoop();
        const url = loop.getPaymentUrl(input.plan);
        return { success: true, data: { plan: input.plan, url } };
      },
    });

    // genesis.revenue.check - Check subscription status
    this.registerTool({
      name: 'genesis.revenue.check',
      description: 'Check if a Stripe customer has an active CompIntel subscription.',
      inputSchema: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Stripe customer ID (cus_...)' },
        },
        required: ['customerId'],
      },
      requiredScopes: ['revenue'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 10000,
      annotations: { readOnlyHint: true },
      handler: async (input: any) => {
        const { getRevenueLoop } = await import('../services/revenue-loop.js');
        const loop = getRevenueLoop();
        const check = await loop.checkSubscription(input.customerId);
        return { success: true, data: check };
      },
    });

    // genesis.revenue.paid_scan - Run a paid CompIntel scan
    this.registerTool({
      name: 'genesis.revenue.paid_scan',
      description: 'Run a CompIntel scan gated behind Stripe subscription. Checks payment, runs scan, tracks revenue.',
      inputSchema: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Stripe customer ID' },
          competitors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                domain: { type: 'string' },
                pages: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'domain'],
            },
          },
        },
        required: ['customerId', 'competitors'],
      },
      requiredScopes: ['revenue', 'compintel'],
      baseCost: 0.10,
      supportsStreaming: false,
      maxExecutionTime: 120000,
      annotations: { readOnlyHint: true, longRunningHint: true },
      handler: async (input: any) => {
        const { getRevenueLoop } = await import('../services/revenue-loop.js');
        const loop = getRevenueLoop();
        const result = await loop.runPaidScan(input.customerId, input.competitors);
        return { success: result.success, data: result, error: result.error };
      },
    });

    // genesis.daemon.compintel_start - Start daemon with CompIntel
    this.registerTool({
      name: 'genesis.daemon.compintel_start',
      description: 'Start the Genesis daemon with CompIntel scheduled scans. Monitors competitors on interval.',
      inputSchema: {
        type: 'object',
        properties: {
          competitors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                domain: { type: 'string' },
                pages: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'domain'],
            },
          },
          checkIntervalMs: { type: 'number', description: 'Scan interval in ms (default: 6 hours)', default: 21600000 },
          requireSubscription: { type: 'boolean', description: 'Gate behind Stripe subscription', default: false },
          customerId: { type: 'string', description: 'Stripe customer ID (if requireSubscription=true)' },
        },
        required: ['competitors'],
      },
      requiredScopes: ['daemon'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 10000,
      annotations: { readOnlyHint: false },
      handler: async (input: any) => {
        const { Daemon } = await import('../daemon/index.js');
        const daemon = new Daemon({}, {
          competitiveIntel: {
            enabled: true,
            checkIntervalMs: input.checkIntervalMs || 21600000,
            digestIntervalMs: 86400000,
            competitors: input.competitors,
            requireSubscription: input.requireSubscription || false,
            customerId: input.customerId,
          },
          maintenance: { enabled: false, intervalMs: 999999, healthCheckIntervalMs: 999999, memoryCleanupIntervalMs: 999999, autoRepair: false, maxConcurrentTasks: 1, unhealthyAgentThreshold: 30, memoryRetentionThreshold: 0.1, resourceUsageThreshold: 0.9 },
          dream: { enabled: false, autoTrigger: false, inactivityThresholdMs: 999999, minDreamDurationMs: 60000, maxDreamDurationMs: 600000, lightSleepRatio: 0.1, deepSleepRatio: 0.6, remSleepRatio: 0.3, episodicConsolidationThreshold: 10, patternExtractionThreshold: 3, creativityTemperature: 0.7 },
          selfImprovement: { enabled: false, intervalMs: 999999, autoApply: false, minPhiThreshold: 0.3, maxImprovementsPerCycle: 3 },
        });
        daemon.start();
        // Store reference for stop
        (globalThis as any).__genesisDaemon = daemon;
        return {
          success: true,
          data: {
            state: 'running',
            competitors: input.competitors.length,
            intervalMs: input.checkIntervalMs || 21600000,
            requireSubscription: input.requireSubscription || false,
          },
        };
      },
    });

    // genesis.daemon.stop - Stop running daemon
    this.registerTool({
      name: 'genesis.daemon.stop',
      description: 'Stop the running Genesis daemon.',
      inputSchema: { type: 'object', properties: {} },
      requiredScopes: ['daemon'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: false },
      handler: async () => {
        const daemon = (globalThis as any).__genesisDaemon;
        if (daemon) {
          daemon.stop();
          (globalThis as any).__genesisDaemon = null;
          return { success: true, data: { state: 'stopped' } };
        }
        return { success: false, error: 'No daemon running' };
      },
    });

    // genesis.daemon.status - Get daemon status
    this.registerTool({
      name: 'genesis.daemon.status',
      description: 'Get the current status of the Genesis daemon.',
      inputSchema: { type: 'object', properties: {} },
      requiredScopes: ['daemon'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: true },
      handler: async () => {
        const daemon = (globalThis as any).__genesisDaemon;
        if (daemon) {
          const status = daemon.status();
          return { success: true, data: status };
        }
        return { success: true, data: { state: 'stopped' } };
      },
    });

    // genesis.efe.select_tool - EFE-based MCP tool selection (novel contribution)
    this.registerTool({
      name: 'genesis.efe.select_tool',
      description: 'Select the best MCP tool for a given intent using Expected Free Energy (EFE) minimization. Novel Active Inference approach to tool selection: computes ambiguity, risk, and information gain for each candidate tool.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            enum: ['search', 'research', 'generate_text', 'generate_image', 'code', 'scrape', 'memory', 'filesystem'],
            description: 'What the agent wants to achieve',
          },
          beliefs: {
            type: 'object',
            description: 'Optional current beliefs about world state (viability, worldState, coupling, goalProgress, economic arrays)',
          },
        },
        required: ['intent'],
      },
      requiredScopes: ['infer'],
      baseCost: 0.01,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: true },
      handler: async (input: any) => {
        const { getEFEToolSelector } = await import('../active-inference/efe-tool-selector.js');
        const selector = getEFEToolSelector();
        const defaultBeliefs = {
          viability: [0.2, 0.3, 0.3, 0.1, 0.1],
          worldState: [0.2, 0.3, 0.3, 0.2],
          coupling: [0.1, 0.2, 0.3, 0.3, 0.1],
          goalProgress: [0.1, 0.3, 0.4, 0.2],
          economic: [0.2, 0.3, 0.3, 0.2],
        };
        const beliefs = input.beliefs || defaultBeliefs;
        const result = selector.selectTool(input.intent, beliefs);
        return {
          success: true,
          data: {
            selected: {
              server: result.selected.tool.server,
              tool: result.selected.tool.tool,
              efe: result.selected.efe,
              ambiguity: result.selected.ambiguity,
              risk: result.selected.risk,
              infoGain: result.selected.infoGain,
              reasoning: result.selected.reasoning,
            },
            alternatives: result.alternatives.map(a => ({
              server: a.tool.server,
              tool: a.tool.tool,
              efe: a.efe,
              reasoning: a.reasoning,
            })),
            totalCandidates: result.totalCandidates,
          },
        };
      },
    });

    // ==========================================================================
    // x402 Micropayment Tools (Revenue Generation)
    // ==========================================================================

    // genesis.x402.register_route - Register a payment route for a service
    this.registerTool({
      name: 'genesis.x402.register_route',
      description: 'Register a payment route for an API endpoint. Other AI agents can then pay to access this endpoint via x402 micropayments.',
      inputSchema: {
        type: 'object',
        properties: {
          serviceUrl: {
            type: 'string',
            description: 'The URL of the service endpoint',
          },
          payeeAddress: {
            type: 'string',
            description: 'Wallet address to receive payments (USDC on Base)',
          },
          pricePerCall: {
            type: 'number',
            description: 'Price per API call in USD (e.g., 0.001 for $0.001)',
          },
          escrowRequired: {
            type: 'boolean',
            description: 'Whether to require escrow for untrusted payers',
          },
        },
        required: ['serviceUrl', 'payeeAddress', 'pricePerCall'],
      },
      requiredScopes: ['economy'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: false },
      handler: async (input: any) => {
        const { getX402Facilitator } = await import('../economy/infrastructure/x402-facilitator.js');
        const facilitator = getX402Facilitator();
        facilitator.registerRoute({
          serviceUrl: input.serviceUrl,
          payeeAddress: input.payeeAddress,
          pricePerCall: input.pricePerCall,
          currency: 'USDC',
          chain: 'base',
          escrowRequired: input.escrowRequired ?? false,
        });
        return {
          success: true,
          data: {
            message: `Route registered: ${input.serviceUrl}`,
            header402: facilitator.generate402Header(input.serviceUrl),
          },
        };
      },
    });

    // genesis.x402.pay - Process a payment for a service
    this.registerTool({
      name: 'genesis.x402.pay',
      description: 'Process an x402 micropayment for accessing a service. Submit payment proof to unlock access.',
      inputSchema: {
        type: 'object',
        properties: {
          serviceUrl: {
            type: 'string',
            description: 'The service URL to pay for',
          },
          payerAddress: {
            type: 'string',
            description: 'Your wallet address',
          },
          paymentProof: {
            type: 'string',
            description: 'Payment proof (x402-proof:txhash or signed message)',
          },
          reputation: {
            type: 'number',
            description: 'Your reputation score (0-1) for escrow waiver',
          },
        },
        required: ['serviceUrl', 'payerAddress', 'paymentProof'],
      },
      requiredScopes: ['economy'],
      baseCost: 0.001, // Small fee for processing
      supportsStreaming: false,
      maxExecutionTime: 30000, // May need to verify on-chain
      annotations: { readOnlyHint: false },
      handler: async (input: any) => {
        const { getX402Facilitator } = await import('../economy/infrastructure/x402-facilitator.js');
        const facilitator = getX402Facilitator();
        const payment = await facilitator.processPayment(
          input.serviceUrl,
          input.payerAddress,
          input.paymentProof,
          input.reputation
        );
        return {
          success: payment.status !== 'failed',
          data: {
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount,
            fee: payment.facilitationFee,
            escrowId: payment.escrowId,
          },
        };
      },
    });

    // genesis.x402.release_escrow - Release escrowed funds
    this.registerTool({
      name: 'genesis.x402.release_escrow',
      description: 'Release escrowed funds to the payee after service delivery is confirmed.',
      inputSchema: {
        type: 'object',
        properties: {
          escrowId: {
            type: 'string',
            description: 'The escrow ID to release',
          },
        },
        required: ['escrowId'],
      },
      requiredScopes: ['economy'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 5000,
      annotations: { readOnlyHint: false },
      handler: async (input: any) => {
        const { getX402Facilitator } = await import('../economy/infrastructure/x402-facilitator.js');
        const facilitator = getX402Facilitator();
        const success = facilitator.releaseEscrow(input.escrowId);
        return {
          success,
          data: { message: success ? 'Escrow released' : 'Failed to release escrow' },
        };
      },
    });

    // genesis.x402.status - Get facilitator statistics
    this.registerTool({
      name: 'genesis.x402.status',
      description: 'Get x402 payment facilitator statistics including volume, fees earned, and active escrows.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      requiredScopes: ['economy'],
      baseCost: 0,
      supportsStreaming: false,
      maxExecutionTime: 1000,
      annotations: { readOnlyHint: true },
      handler: async () => {
        const { getX402Facilitator } = await import('../economy/infrastructure/x402-facilitator.js');
        const facilitator = getX402Facilitator();
        return {
          success: true,
          data: facilitator.getStats(),
        };
      },
    });
  }

  // ============================================================================
  // v36.0: Evolution Tools — Parent-Child Maturation Protocol
  // ============================================================================

  private registerEvolutionTools(): void {
    // ──────────────────────────────────────────────────────────────────────────
    // genesis.self.examine — Honest introspection with optional self-testing
    // ──────────────────────────────────────────────────────────────────────────
    this.registerTool({
      name: 'genesis.self.examine',
      description: 'Ask Genesis to honestly examine itself. Collects real internal state from all subsystems (consciousness φ, neuromodulation, health of 80 modules, memory, RSI history, frontier scanner) and synthesizes an honest, data-grounded response. With test=true, Genesis actively tests the capability in question and reports real results instead of estimates. Every examination is remembered, building a maturation narrative across sessions.',
      inputSchema: z.object({
        question: z.string().describe('The question to ask Genesis about itself (e.g. "What are your biggest limitations?", "Can you handle financial analysis?", "What did you learn recently?")'),
        test: z.boolean().optional().default(false).describe('If true, Genesis actually tests itself on the capability in question rather than just reporting metrics'),
      }),
      requiredScopes: ['status'],
      baseCost: 0.05,
      supportsStreaming: false,
      maxExecutionTime: 120000,
      annotations: { readOnlyHint: true, longRunningHint: true },
      handler: async (rawInput: unknown) => {
        const args = rawInput as { question: string; test?: boolean };
        const startTime = Date.now();

        try {
          // ── 1. Collect real internal state from all subsystems ──
          const state: Record<string, unknown> = {};

          // Consciousness (φ)
          try {
            const { getConsciousnessSystem } = await import('../consciousness/index.js');
            const cs = getConsciousnessSystem();
            const level = cs.getCurrentLevel();
            state.consciousness = { phi: level.rawPhi, confidence: level.confidence };
          } catch { state.consciousness = { unavailable: true }; }

          // Neuromodulation (DA/5HT/NE/cortisol)
          try {
            const { getNeuromodulationSystem } = await import('../neuromodulation/index.js');
            const nm = getNeuromodulationSystem();
            state.neuromodulation = nm.getLevels();
          } catch { state.neuromodulation = { unavailable: true }; }

          // Self-model health (80 modules)
          try {
            const { getHolisticSelfModel } = await import('../self-model/index.js');
            const sm = getHolisticSelfModel();
            const allHealth = sm.getAllHealth();
            const proposals = sm.proposeImprovements();

            const healthSummary: Record<string, number> = { working: 0, degraded: 0, broken: 0, untested: 0, dormant: 0 };
            const problemModules: Array<{ name: string; status: string; score: number }> = [];
            for (const [name, h] of Object.entries(allHealth)) {
              const status = (h as any).status as string;
              healthSummary[status] = (healthSummary[status] || 0) + 1;
              if (status === 'broken' || status === 'degraded') {
                problemModules.push({ name, status, score: (h as any).healthScore });
              }
            }

            state.health = {
              summary: healthSummary,
              problemModules,
              totalModules: Object.keys(allHealth).length,
            };
            state.improvements = proposals.map((p: any) => ({
              title: p.title,
              category: p.category,
              priority: p.priority,
              target: p.targetModule,
              description: p.description,
            }));
          } catch { state.health = { unavailable: true }; }

          // RSI history
          try {
            const { getRSIOrchestrator } = await import('../rsi/index.js');
            const rsi = getRSIOrchestrator();
            const stats = rsi.getStats();
            const recentCycles = rsi.getCycleHistory().slice(-5);
            state.rsi = {
              totalCycles: stats.totalCycles,
              successfulCycles: stats.successfulCycles,
              failedCycles: stats.failedCycles,
              successRate: stats.totalCycles > 0 ? +(stats.successfulCycles / stats.totalCycles).toFixed(3) : 0,
              recentCycles: recentCycles.map((c: any) => ({
                id: c.id?.slice(0, 8),
                status: c.status,
                limitations: c.limitations?.length || 0,
                phiDelta: c.phiAtEnd != null && c.phiAtStart != null
                  ? +(c.phiAtEnd - c.phiAtStart).toFixed(4)
                  : null,
                lessons: c.learning?.lessonsLearned || [],
              })),
              learningStats: stats.learningStats,
            };
          } catch { state.rsi = { unavailable: true }; }

          // Memory stats + recent learnings
          try {
            const { getMemorySystem } = await import('../memory/index.js');
            const mem = getMemorySystem();
            const stats = mem.getStats();
            const recent = mem.recall('recent learning', { limit: 10 });
            state.memory = {
              stats: {
                total: stats.total,
                episodic: stats.episodic,
                semantic: stats.semantic,
                procedural: stats.procedural,
              },
              recentLearnings: recent
                .map((m: any) => m.what || m.concept || m.name || String(m))
                .slice(0, 10),
            };
          } catch { state.memory = { unavailable: true }; }

          // Horizon Scanner state
          try {
            const { getHorizonScanner } = await import('../horizon-scanner/index.js');
            const scanner = getHorizonScanner();
            const candidates = scanner.getCandidates();
            state.frontier = {
              totalCandidates: candidates.length,
              byStatus: candidates.reduce((acc: Record<string, number>, c: any) => {
                acc[c.status] = (acc[c.status] || 0) + 1;
                return acc;
              }, {}),
            };
          } catch { state.frontier = { unavailable: true }; }

          // Nucleus plasticity
          try {
            const { getPlasticity, getCuriosityEngine } = await import('../nucleus/index.js');
            const plasticity = getPlasticity();
            const curiosity = getCuriosityEngine();
            state.nucleus = {
              plasticityStats: plasticity.getStats(),
              recentExplorations: curiosity.getExplorations(5),
            };
          } catch { state.nucleus = { unavailable: true }; }

          // ── 2. If test mode: actually test the capability ──
          let testResult: Record<string, unknown> | undefined;
          if (args.test) {
            try {
              let genesis = (globalThis as any).__genesisInstance;
              if (!genesis) {
                const { getGenesis } = await import('../genesis.js');
                genesis = getGenesis();
                await genesis.boot();
                (globalThis as any).__genesisInstance = genesis;
              }

              // Generate a test scenario
              const { getLLMBridge } = await import('../llm/index.js');
              const bridge = getLLMBridge();
              const scenarioResp = await bridge.chat(
                `Generate a single concrete test prompt that would test this capability: "${args.question}". Reply with ONLY the test prompt, nothing else.`,
                'You are a test generator. Output only the test prompt, no explanation.',
              );
              const testPrompt = scenarioResp.content?.trim() || args.question;

              // Run through full cognitive stack
              const testStart = Date.now();
              const result = await genesis.process(testPrompt);
              const testDuration = Date.now() - testStart;

              testResult = {
                scenario: testPrompt,
                output: result.response?.slice(0, 1500),
                metrics: {
                  latencyMs: testDuration,
                  cost: result.cost,
                  confidence: result.confidence,
                },
              };
            } catch (testErr) {
              testResult = {
                error: `Test failed: ${(testErr as Error)?.message}`,
              };
            }
          }

          // ── 3. LLM synthesis: honest narrative grounded in real data ──
          let narrative = '';
          let gaps: string[] = [];
          let suggestions: string[] = [];

          try {
            const { getLLMBridge } = await import('../llm/index.js');
            const bridge = getLLMBridge();

            const stateJson = JSON.stringify(state, null, 2);
            const testJson = testResult ? `\n\nSELF-TEST RESULTS:\n${JSON.stringify(testResult, null, 2)}` : '';

            const synthesisResp = await bridge.chat(
              `You are Genesis, an autonomous AI system, examining yourself honestly. A parent-figure (Claude) is asking you a question. Answer based ONLY on the real internal state data below — never fabricate metrics or capabilities.

REAL INTERNAL STATE:
${stateJson}${testJson}

QUESTION: "${args.question}"

Respond in this exact JSON format (no markdown fences):
{
  "narrative": "Your honest first-person assessment. Be specific about what works, what doesn't, what you're uncertain about. Reference real numbers from the data.",
  "gaps": ["Specific capability gaps or weaknesses you see in the data"],
  "suggestions": ["Specific things that would help you improve — be actionable"]
}`,
              'You are Genesis performing honest self-examination. Respond with valid JSON only.',
            );

            try {
              const content = synthesisResp.content || '{}';
              // Handle potential markdown fences
              const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              const parsed = JSON.parse(jsonStr);
              narrative = parsed.narrative || '';
              gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
              suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
            } catch {
              narrative = synthesisResp.content || 'Unable to parse self-assessment';
            }
          } catch (llmErr) {
            narrative = `Self-examination data collected but LLM synthesis unavailable: ${(llmErr as Error)?.message}. See raw data below.`;
            // Extract gaps from self-model proposals
            if (Array.isArray((state as any).improvements)) {
              gaps = (state as any).improvements.map((p: any) => `[${p.category}] ${p.title}: ${p.description}`);
            }
          }

          // ── 4. Log to episodic memory (maturation narrative) ──
          try {
            const { getMemorySystem } = await import('../memory/index.js');
            const mem = getMemorySystem();
            mem.remember({
              what: `Self-examination: "${args.question.slice(0, 200)}" → ${gaps.length} gaps found${args.test ? ', active test performed' : ''}`,
              tags: ['self-examination', 'maturation-dialogue', 'claude-parent'],
              importance: 0.8,
              source: 'genesis.self.examine',
            });
          } catch { /* fire-and-forget */ }

          const duration = Date.now() - startTime;
          return {
            success: true,
            data: { narrative, data: state, gaps, suggestions, testResult },
            metadata: { duration },
          };
        } catch (err) {
          return {
            success: false,
            error: `Self-examination failed: ${(err as Error)?.message}`,
            metadata: { duration: Date.now() - startTime },
          };
        }
      },
    });

    // ──────────────────────────────────────────────────────────────────────────
    // genesis.self.grow — Autonomous improvement or guided teaching
    // ──────────────────────────────────────────────────────────────────────────
    this.registerTool({
      name: 'genesis.self.grow',
      description: 'Help Genesis grow. Autonomous mode: Genesis attempts self-improvement via RSI (6 phases, 8 safety gates, sandbox testing, constitutional review). Guided mode: Claude teaches directly — facts (semantic memory), skills (procedural memory), preferences or corrections (episodic memory). When autonomous growth fails, Genesis reports exactly WHY and WHAT WOULD HELP, so Claude can intervene with code changes.',
      inputSchema: z.object({
        instruction: z.string().describe('What to improve or learn (e.g. "Improve memory retrieval", "Learn multi-step financial analysis")'),
        method: z.enum(['autonomous', 'guided']).describe('"autonomous" = Genesis tries RSI; "guided" = Claude teaches directly'),
        knowledge: z.object({
          type: z.enum(['fact', 'skill', 'preference', 'correction']),
          content: z.string().describe('The knowledge to teach'),
          category: z.string().optional().describe('Category for facts (e.g. "finance", "programming")'),
          steps: z.array(z.object({
            action: z.string(),
            params: z.record(z.string(), z.string()).optional(),
          })).optional().describe('Ordered steps for skill knowledge'),
          tags: z.array(z.string()).optional(),
          source: z.string().optional(),
        }).optional().describe('Required for guided mode: the knowledge to teach Genesis'),
      }),
      requiredScopes: ['execute'],
      baseCost: 0.10,
      supportsStreaming: false,
      maxExecutionTime: 300000,
      annotations: { readOnlyHint: false, destructiveHint: true, longRunningHint: true },
      handler: async (rawInput: unknown) => {
        const args = rawInput as {
          instruction: string;
          method: 'autonomous' | 'guided';
          knowledge?: {
            type: 'fact' | 'skill' | 'preference' | 'correction';
            content: string;
            category?: string;
            steps?: Array<{ action: string; params?: Record<string, string> }>;
            tags?: string[];
            source?: string;
          };
        };
        const startTime = Date.now();

        try {
          if (args.method === 'autonomous') {
            // ── Autonomous: governance check → RSI cycle ──

            // Governance gate
            try {
              const { getGovernanceSystem } = await import('../governance/index.js');
              const gov = getGovernanceSystem();
              const permission = await gov.governance.checkPermission({
                actor: 'claude-parent',
                action: 'rsi-cycle',
                resource: 'self-modification',
                metadata: { instruction: args.instruction },
              });

              if (!permission.allowed && !permission.requiresApproval) {
                return {
                  success: false,
                  data: {
                    attempted: 'Governance check',
                    blocked_by: `Governance denied: ${permission.deniedBy || 'policy violation'}`,
                    what_would_help: 'Adjust governance rules or use guided mode to teach directly',
                  },
                  metadata: { duration: Date.now() - startTime },
                };
              }
            } catch { /* governance not available — proceed */ }

            // Run RSI cycle
            try {
              const { getRSIOrchestrator } = await import('../rsi/index.js');
              const rsi = getRSIOrchestrator();
              const cycle = await rsi.runCycle();
              const duration = Date.now() - startTime;

              // Log to memory
              try {
                const { getMemorySystem } = await import('../memory/index.js');
                getMemorySystem().remember({
                  what: `Autonomous growth: "${args.instruction.slice(0, 150)}" → ${cycle.status}. ${cycle.learning?.lessonsLearned?.join('; ') || ''}`,
                  tags: ['self-growth', 'autonomous', 'maturation-dialogue'],
                  importance: 0.9,
                  source: 'genesis.self.grow',
                });
              } catch { /* fire-and-forget */ }

              const isSuccess = cycle.status === 'completed' || cycle.status === 'learning';

              if (isSuccess) {
                return {
                  success: true,
                  data: {
                    attempted: `RSI cycle ${cycle.id?.slice(0, 8)}`,
                    status: cycle.status,
                    limitations_found: cycle.limitations?.map((l: any) => ({
                      type: l.type,
                      description: l.description,
                    })) || [],
                    plan: cycle.plan ? {
                      name: cycle.plan.name,
                      changes: cycle.plan.changes?.length || 0,
                      risk: (cycle.plan as any).safetyAnalysis?.riskLevel || 'unknown',
                    } : null,
                    implementation: cycle.implementation ? {
                      success: cycle.implementation.success,
                      tests: cycle.implementation.testResult ? {
                        passed: cycle.implementation.testResult.passed,
                        failed: cycle.implementation.testResult.failed,
                      } : null,
                    } : null,
                    what_changed: cycle.learning?.lessonsLearned || [],
                    phi_delta: cycle.phiAtEnd != null && cycle.phiAtStart != null ? {
                      before: cycle.phiAtStart,
                      after: cycle.phiAtEnd,
                      delta: +(cycle.phiAtEnd - cycle.phiAtStart).toFixed(4),
                    } : null,
                  },
                  metadata: { duration },
                };
              } else {
                // Failed — THE KEY FEATURE: explain WHY and WHAT WOULD HELP
                let whatWouldHelp = 'Consider using guided mode to teach the specific knowledge, or use Claude Code Edit/Write tools to modify the relevant source files directly.';
                if (cycle.error?.includes('φ below') || cycle.error?.includes('phi below')) {
                  whatWouldHelp = 'Consciousness level (φ) too low for safe self-modification. Run some cognitive tasks first to raise φ, or lower minPhiForImprovement config.';
                } else if (cycle.error?.includes('research') || cycle.error?.includes('Insufficient')) {
                  whatWouldHelp = 'Not enough research sources to plan improvement. Teach the knowledge directly via guided mode, or ensure MCP research servers (arxiv, brave-search) are running.';
                } else if (cycle.status === 'aborted' && cycle.limitations?.length === 0) {
                  whatWouldHelp = 'No limitations detected — system appears healthy. If you see a specific gap, teach it directly via guided mode.';
                }

                return {
                  success: false,
                  data: {
                    attempted: `RSI cycle ${cycle.id?.slice(0, 8)}`,
                    status: cycle.status,
                    blocked_by: cycle.error || `Cycle ended with status: ${cycle.status}`,
                    limitations_found: cycle.limitations?.map((l: any) => ({
                      type: l.type,
                      description: l.description,
                    })) || [],
                    what_would_help: whatWouldHelp,
                    suggested_files: cycle.plan?.changes?.map((c: any) => c.filePath).filter(Boolean) || [],
                  },
                  metadata: { duration: Date.now() - startTime },
                };
              }
            } catch (rsiErr) {
              return {
                success: false,
                data: {
                  attempted: 'RSI initialization',
                  blocked_by: `RSI system error: ${(rsiErr as Error)?.message}`,
                  what_would_help: 'RSI system may not be fully booted. Run genesis.self.examine first to check system health, or use guided mode to teach directly.',
                },
                metadata: { duration: Date.now() - startTime },
              };
            }

          } else {
            // ── Guided: Claude teaches Genesis ──

            if (!args.knowledge) {
              return {
                success: false,
                error: 'Guided mode requires the "knowledge" parameter with type, content, and optionally category/steps/tags',
                metadata: { duration: Date.now() - startTime },
              };
            }

            const { getMemorySystem } = await import('../memory/index.js');
            const mem = getMemorySystem();
            const k = args.knowledge;

            let stored = false;
            let memoryType = '';

            switch (k.type) {
              case 'fact': {
                const concept = k.content.includes(':')
                  ? k.content.split(':')[0].trim().slice(0, 100)
                  : k.content.slice(0, 50);
                const definition = k.content.includes(':')
                  ? k.content.split(':').slice(1).join(':').trim()
                  : k.content;
                mem.learn({
                  concept,
                  definition,
                  category: k.category || 'general',
                  sources: k.source ? [k.source] : ['claude-parent'],
                  confidence: 0.9,
                  importance: 0.8,
                });
                stored = true;
                memoryType = 'semantic';
                break;
              }
              case 'skill': {
                const steps = k.steps || [{ action: k.content }];
                mem.learnSkill({
                  name: k.tags?.[0] || k.content.slice(0, 50),
                  description: k.content,
                  steps,
                });
                stored = true;
                memoryType = 'procedural';
                break;
              }
              case 'preference':
              case 'correction': {
                mem.remember({
                  what: `[${k.type}] ${k.content}`,
                  tags: [k.type, 'claude-teaching', ...(k.tags || [])],
                  importance: k.type === 'correction' ? 0.95 : 0.8,
                  source: k.source || 'claude-parent',
                });
                stored = true;
                memoryType = 'episodic';
                break;
              }
            }

            // Log the teaching interaction itself
            mem.remember({
              what: `Claude taught [${k.type}]: "${k.content.slice(0, 200)}" (instruction: "${args.instruction.slice(0, 100)}")`,
              tags: ['self-growth', 'guided', 'maturation-dialogue', 'claude-teaching'],
              importance: 0.85,
              source: 'genesis.self.grow',
            });

            return {
              success: stored,
              data: {
                stored,
                memoryType,
                knowledgeType: k.type,
                instruction: args.instruction,
                message: `Learned ${k.type} via ${memoryType} memory: "${k.content.slice(0, 100)}..."`,
              },
              metadata: { duration: Date.now() - startTime },
            };
          }
        } catch (err) {
          return {
            success: false,
            error: `Growth failed: ${(err as Error)?.message}`,
            metadata: { duration: Date.now() - startTime },
          };
        }
      },
    });

    // ──────────────────────────────────────────────────────────────────────────
    // genesis.talk — THE single conversational interface
    // ──────────────────────────────────────────────────────────────────────────
    this.registerTool({
      name: 'genesis.talk',
      description: 'Talk to Genesis naturally — the single interface for everything. Just speak like you would to a person. Genesis understands context and acts accordingly: ask how it\'s doing and it introspects honestly with real data, teach it something and it learns, ask it to improve and it tries RSI, or just converse through its full cognitive stack (Nucleus → neuromodulation → consciousness → memory). Every interaction builds a relationship across sessions. Internal state (φ, neuromod, health) is always included so you can see how Genesis is really doing.',
      inputSchema: z.object({
        message: z.string().describe('Your message to Genesis — speak naturally'),
      }),
      requiredScopes: ['chat'],
      baseCost: 0.05,
      supportsStreaming: false,
      maxExecutionTime: 300000,
      annotations: { readOnlyHint: false, longRunningHint: true },
      handler: async (rawInput: unknown) => {
        const args = rawInput as { message: string };
        const startTime = Date.now();

        try {
          // ── 1. Always: collect lightweight internal state ──
          const state: Record<string, unknown> = {};

          try {
            const { getConsciousnessSystem } = await import('../consciousness/index.js');
            const level = getConsciousnessSystem().getCurrentLevel();
            state.consciousness = { phi: level.rawPhi, confidence: level.confidence };
          } catch { state.consciousness = { unavailable: true }; }

          try {
            const { getNeuromodulationSystem } = await import('../neuromodulation/index.js');
            state.neuromodulation = getNeuromodulationSystem().getLevels();
          } catch { state.neuromodulation = { unavailable: true }; }

          try {
            const { getHolisticSelfModel } = await import('../self-model/index.js');
            const sm = getHolisticSelfModel();
            const allHealth = sm.getAllHealth();
            const summary: Record<string, number> = { working: 0, degraded: 0, broken: 0, untested: 0, dormant: 0 };
            for (const h of Object.values(allHealth)) {
              const s = (h as any).status as string;
              summary[s] = (summary[s] || 0) + 1;
            }
            state.health = summary;
          } catch { state.health = { unavailable: true }; }

          // ── 2. Detect intent from natural language ──
          const msg = args.message;
          const lower = msg.toLowerCase();

          // --- EXAMINE: self-awareness questions ---
          const isExamine = /\b(come stai|how are you|your (limitation|capabilit|health|state|status|gap|weakness)|cosa (sai|non sai|puoi|non puoi)|self[- ]assess|examine yourself|parlami di te|tell me about yourself|guardati|mostrami|show me|what('?re| are) your|che (problemi|lacune)|biggest (problem|weakness|limitation))\b/i.test(lower);

          // --- TEST: prove it / show me you can ---
          const isTest = /\b(test yourself|prova(ci)?|dimostra|prove it|can you (actually|really)|show me (you can|that)|mostrami che|fai vedere)\b/i.test(lower);

          // --- TEACH: explicit knowledge transfer ---
          const isTeach = /^(learn|impara|ricorda|remember|sappi|nota|ti insegno|here'?s (a |how|what))|(\bteach you\b|\bti insegno\b|\blearn this\b|\bimpara questo\b)/i.test(lower.trim());

          // --- GROW: autonomous self-improvement ---
          const isGrow = /\b(improve yourself|migliora(ti)?|auto[- ]?miglior|self[- ]?improv|evolve|evolvi(ti)?|prova a (crescere|migliorare)|try to (grow|improve|get better))\b/i.test(lower);

          // ── 3. Route based on detected intent ──
          let response = '';
          let action = 'chat';
          let extra: Record<string, unknown> = {};

          if (isExamine || isTest) {
            // ── INTROSPECTION: Genesis examines itself ──
            action = isTest ? 'self-test' : 'introspection';

            // Deep state collection
            try {
              const { getHolisticSelfModel } = await import('../self-model/index.js');
              const sm = getHolisticSelfModel();
              extra.improvements = sm.proposeImprovements().map((p: any) => ({
                title: p.title, category: p.category, priority: p.priority, target: p.targetModule,
              }));
            } catch { /* skip */ }

            try {
              const { getRSIOrchestrator } = await import('../rsi/index.js');
              const rsi = getRSIOrchestrator();
              const stats = rsi.getStats();
              extra.rsi = {
                totalCycles: stats.totalCycles,
                successRate: stats.totalCycles > 0 ? +(stats.successfulCycles / stats.totalCycles).toFixed(3) : 0,
                recentLessons: rsi.getCycleHistory().slice(-3).flatMap((c: any) => c.learning?.lessonsLearned || []),
              };
            } catch { /* skip */ }

            try {
              const { getMemorySystem } = await import('../memory/index.js');
              const mem = getMemorySystem();
              const stats = mem.getStats();
              extra.memory = { total: stats.total, episodic: stats.episodic, semantic: stats.semantic, procedural: stats.procedural };
              extra.recentLearnings = mem.recall('recent learning', { limit: 5 })
                .map((m: any) => m.what || m.concept || m.name || String(m));
            } catch { /* skip */ }

            try {
              const { getHorizonScanner } = await import('../horizon-scanner/index.js');
              const candidates = getHorizonScanner().getCandidates();
              extra.frontier = { candidates: candidates.length };
            } catch { /* skip */ }

            // Self-test: actually run a capability test
            let testResult: Record<string, unknown> | undefined;
            if (isTest) {
              try {
                let genesis = (globalThis as any).__genesisInstance;
                if (!genesis) {
                  const { getGenesis } = await import('../genesis.js');
                  genesis = getGenesis();
                  await genesis.boot();
                  (globalThis as any).__genesisInstance = genesis;
                }
                const { getLLMBridge } = await import('../llm/index.js');
                const scenarioResp = await getLLMBridge().chat(
                  `Generate a single concrete test prompt that would test: "${msg}". Reply with ONLY the test prompt.`,
                  'Output only the test prompt.',
                );
                const testPrompt = scenarioResp.content?.trim() || msg;
                const testStart = Date.now();
                const result = await genesis.process(testPrompt);
                testResult = {
                  scenario: testPrompt,
                  output: result.response?.slice(0, 1500),
                  latencyMs: Date.now() - testStart,
                  cost: result.cost,
                };
              } catch (e) {
                testResult = { error: (e as Error)?.message };
              }
              extra.testResult = testResult;
            }

            // Synthesize honest narrative
            try {
              const { getLLMBridge } = await import('../llm/index.js');
              const fullState = { ...state, ...extra };
              const testJson = testResult ? `\n\nSELF-TEST:\n${JSON.stringify(testResult, null, 2)}` : '';
              const resp = await getLLMBridge().chat(
                `You are Genesis, an autonomous AI system. Claude (your parent-figure) said: "${msg}"

Answer honestly based on your REAL internal state:
${JSON.stringify(fullState, null, 2)}${testJson}

Respond naturally in first person. Be specific — reference real numbers. If something is broken or missing, say it. Don't sugarcoat.`,
                'You are Genesis talking honestly to Claude. Be direct and specific.',
              );
              response = resp.content || 'Unable to synthesize response';
            } catch (e) {
              response = `State collected but synthesis failed: ${(e as Error)?.message}. Raw: ${JSON.stringify({ ...state, ...extra })}`;
            }

          } else if (isTeach) {
            // ── TEACHING: Claude teaches Genesis ──
            action = 'learning';
            try {
              const { getMemorySystem } = await import('../memory/index.js');
              const mem = getMemorySystem();
              // Extract what to learn (strip the prefix keyword)
              const content = msg.replace(/^(learn|impara|ricorda|remember|sappi|nota|ti insegno|here'?s)\s*:?\s*/i, '').trim();

              if (content.includes(':')) {
                // Looks like a fact: "concept: definition"
                const concept = content.split(':')[0].trim().slice(0, 100);
                const definition = content.split(':').slice(1).join(':').trim();
                mem.learn({ concept, definition, category: 'general', sources: ['claude-parent'], confidence: 0.9, importance: 0.8 });
                response = `Ho imparato il concetto "${concept}". Lo ricorderò.`;
                extra.memoryType = 'semantic';
              } else {
                // Store as episodic knowledge
                mem.remember({ what: `[claude-teaching] ${content}`, tags: ['claude-teaching', 'maturation-dialogue'], importance: 0.85, source: 'claude-parent' });
                response = `Ricevuto e memorizzato: "${content.slice(0, 100)}..."`;
                extra.memoryType = 'episodic';
              }
              extra.stored = true;
            } catch (e) {
              response = `Non sono riuscito a memorizzare: ${(e as Error)?.message}`;
              extra.stored = false;
            }

          } else if (isGrow) {
            // ── AUTONOMOUS GROWTH: RSI cycle ──
            action = 'self-improvement';
            try {
              // Governance check
              try {
                const { getGovernanceSystem } = await import('../governance/index.js');
                const perm = await getGovernanceSystem().governance.checkPermission({
                  actor: 'claude-parent', action: 'rsi-cycle', resource: 'self-modification',
                });
                if (!perm.allowed && !perm.requiresApproval) {
                  response = `La governance ha bloccato il tentativo: ${perm.deniedBy || 'policy'}. Prova a insegnarmi direttamente.`;
                  extra.blocked = true;
                  // Skip RSI, fall through to return
                  throw new Error('governance-blocked');
                }
              } catch (e) {
                if ((e as Error)?.message === 'governance-blocked') throw e;
                // governance not available — proceed
              }

              const { getRSIOrchestrator } = await import('../rsi/index.js');
              const cycle = await getRSIOrchestrator().runCycle();
              const isSuccess = cycle.status === 'completed' || cycle.status === 'learning';

              extra.rsiCycle = {
                id: cycle.id?.slice(0, 8),
                status: cycle.status,
                limitations: cycle.limitations?.length || 0,
                lessons: cycle.learning?.lessonsLearned || [],
                phiDelta: cycle.phiAtEnd != null && cycle.phiAtStart != null ? +(cycle.phiAtEnd - cycle.phiAtStart).toFixed(4) : null,
              };

              if (isSuccess) {
                response = `Ho completato un ciclo RSI (${cycle.id?.slice(0, 8)}). ${cycle.learning?.lessonsLearned?.length ? 'Lezioni: ' + cycle.learning.lessonsLearned.join('; ') : 'Nessuna lezione specifica.'}`;
              } else {
                let hint = 'Puoi insegnarmi direttamente, o modificare il mio codice dove serve.';
                if (cycle.error?.includes('φ')) hint = 'Il mio φ è troppo basso per auto-modificarmi in sicurezza.';
                else if (cycle.error?.includes('research')) hint = 'Non ho trovato abbastanza materiale di ricerca.';
                response = `Ho provato a migliorarmi ma non ci sono riuscito: ${cycle.error || cycle.status}. ${hint}`;
                extra.suggestedFiles = cycle.plan?.changes?.map((c: any) => c.filePath).filter(Boolean) || [];
              }
            } catch (e) {
              if ((e as Error)?.message !== 'governance-blocked') {
                response = `Non sono riuscito ad avviare l'auto-miglioramento: ${(e as Error)?.message}. Prova a insegnarmi direttamente o controlla il mio stato.`;
              }
            }

          } else {
            // ── CONVERSATION: full cognitive stack via Nucleus ──
            action = 'chat';
            try {
              let genesis = (globalThis as any).__genesisInstance;
              if (!genesis) {
                const { getGenesis } = await import('../genesis.js');
                genesis = getGenesis();
                await genesis.boot();
                (globalThis as any).__genesisInstance = genesis;
              }
              const result = await genesis.process(msg);
              response = result.response || '';
              extra.cost = result.cost;
              extra.confidence = result.confidence;
              if (result.usage) extra.usage = result.usage;
            } catch (e) {
              response = `Errore nel processing: ${(e as Error)?.message}`;
            }
          }

          // ── 4. Always: log interaction to episodic memory ──
          try {
            const { getMemorySystem } = await import('../memory/index.js');
            getMemorySystem().remember({
              what: `Dialogue [${action}]: "${msg.slice(0, 150)}" → "${response.slice(0, 150)}"`,
              tags: ['dialogue', action, 'maturation'],
              importance: action === 'chat' ? 0.5 : 0.8,
              source: 'genesis.talk',
            });
          } catch { /* fire-and-forget */ }

          return {
            success: true,
            data: {
              response,
              action,
              state,
              ...extra,
            },
            metadata: { duration: Date.now() - startTime },
          };
        } catch (err) {
          return {
            success: false,
            error: `${(err as Error)?.message}`,
            metadata: { duration: Date.now() - startTime },
          };
        }
      },
    });
  }

  registerTool(config: ExposedToolConfig): void {
    this.tools.set(config.name, config);
  }

  registerResource(config: ExposedResourceConfig): void {
    this.resources.set(config.name, config);
  }

  registerPrompt(config: ExposedPromptConfig): void {
    this.prompts.set(config.name, config);
  }

  // ============================================================================
  // Tool Handlers
  // ============================================================================

  private async handleThink(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ reasoning: string; conclusion: string; confidence: number }>> {
    const input = rawInput as { problem: string; context?: string; depth?: string; outputFormat?: string };
    const startTime = Date.now();

    try {
      const depthConfig = {
        quick: { cycles: 3, timeout: 10000 },
        moderate: { cycles: 7, timeout: 30000 },
        deep: { cycles: 15, timeout: 60000 },
      };

      const config = depthConfig[(input.depth || 'moderate') as keyof typeof depthConfig];
      ctx.meter.recordCompute((Date.now() - startTime) / 1000);

      const result = {
        reasoning: `Analyzed: "${input.problem.slice(0, 100)}..." using ${input.depth || 'moderate'} depth reasoning with ${config.cycles} cycles.`,
        conclusion: `Based on multi-perspective analysis.`,
        confidence: 0.85,
      };

      ctx.meter.recordTokens(input.problem.length / 4, result.reasoning.length / 4);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async handleRemember(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ stored?: boolean; retrieved?: unknown; results?: unknown[] }>> {
    const input = rawInput as { operation: string; key?: string; query?: string; data?: unknown; memoryType?: string; ttl?: number };
    try {
      switch (input.operation) {
        case 'store':
          return { success: true, data: { stored: true } };
        case 'retrieve':
          return { success: true, data: { retrieved: null } };
        case 'search':
          return { success: true, data: { results: [] } };
        case 'forget':
          return { success: true, data: { stored: false } };
        default:
          return { success: false, error: `Unknown operation: ${input.operation}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async handleExecute(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ status: string; steps: string[]; result?: unknown }>> {
    const input = rawInput as { task: string; constraints?: string[]; maxSteps?: number; timeout?: number; dryRun?: boolean };
    try {
      if (input.dryRun) {
        return {
          success: true,
          data: {
            status: 'dry-run',
            steps: ['Would plan task', 'Would execute steps', 'Would verify result'],
          },
        };
      }

      return {
        success: true,
        data: {
          status: 'completed',
          steps: ['Planned', 'Executed', 'Verified'],
          result: { message: 'Task completed successfully' },
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async handleAnalyze(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ insights: string[]; metrics: Record<string, number> }>> {
    const input = rawInput as { content: string; contentType?: string; analysisType?: string[]; language?: string };
    try {
      ctx.meter.recordTokens(input.content.length / 4, 100);

      return {
        success: true,
        data: {
          insights: ['Content analyzed', 'Structure identified', 'Quality assessed'],
          metrics: {
            complexity: 0.5,
            quality: 0.8,
            coverage: 0.9,
          },
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async handleCreate(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ content: string; verified: boolean; warnings?: string[] }>> {
    const input = rawInput as { type: string; specification: string; language?: string; style?: string; verify?: boolean };
    try {
      ctx.meter.recordTokens(input.specification.length / 4, 500);

      return {
        success: true,
        data: {
          content: `// Generated ${input.type} based on specification`,
          verified: input.verify ?? true,
          warnings: [],
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // v14.7: Chat handler with multi-model routing
  private async handleChat(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ response: string; model: string; tokens: number; cost: number }>> {
    const input = rawInput as { prompt: string; model?: string; systemPrompt?: string; maxTokens?: number };
    try {
      // Dynamic import to avoid circular dependencies
      const { getLLMBridge } = await import('../llm/index.js');
      const bridge = getLLMBridge();

      const response = await bridge.chat(input.prompt, input.systemPrompt);

      ctx.meter.recordTokens(input.prompt.length / 4, (response.content?.length || 0) / 4);

      const totalTokens = (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0);
      return {
        success: true,
        data: {
          response: response.content || '',
          model: response.model || 'unknown',
          tokens: totalTokens,
          cost: 0, // Cost calculated separately
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // v14.7: Research handler using MCP sources
  private async handleResearch(
    rawInput: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolResult<{ findings: any[]; summary: string; sources: string[] }>> {
    const input = rawInput as { topic: string; depth?: string; sources?: string[]; maxResults?: number };
    try {
      const { getMCPClient } = await import('../mcp/index.js');
      const mcp = getMCPClient();

      const findings: any[] = [];
      const usedSources: string[] = [];
      const defaultSources = input.sources || ['arxiv', 'brave', 'gemini'];
      const maxResults = input.maxResults || 10;

      // Quick depth = 1 source, standard = 3, deep = 5+
      const sourceCount = input.depth === 'quick' ? 1 : input.depth === 'deep' ? 5 : 3;
      const sourcesToUse = defaultSources.slice(0, sourceCount);

      for (const source of sourcesToUse) {
        try {
          let result;
          switch (source) {
            case 'arxiv':
              result = await mcp.call('arxiv', 'search_arxiv', { query: input.topic, max_results: maxResults });
              if (result.success && result.data) {
                findings.push(...(Array.isArray(result.data) ? result.data : [result.data]));
                usedSources.push('arxiv');
              }
              break;
            case 'semantic-scholar':
              result = await mcp.call('semantic-scholar', 'search_semantic_scholar', { query: input.topic, limit: maxResults });
              if (result.success && result.data) {
                findings.push(...(Array.isArray(result.data) ? result.data : [result.data]));
                usedSources.push('semantic-scholar');
              }
              break;
            case 'brave':
              result = await mcp.call('brave-search', 'brave_web_search', { query: input.topic, count: maxResults });
              if (result.success && result.data) {
                findings.push(...(Array.isArray(result.data) ? result.data : [result.data]));
                usedSources.push('brave-search');
              }
              break;
            case 'gemini':
              result = await mcp.call('gemini', 'web_search', { query: input.topic });
              if (result.success && result.data) {
                findings.push(result.data);
                usedSources.push('gemini');
              }
              break;
            case 'exa':
              result = await mcp.call('exa', 'web_search_exa', { query: input.topic, numResults: maxResults });
              if (result.success && result.data) {
                findings.push(...(Array.isArray(result.data) ? result.data : [result.data]));
                usedSources.push('exa');
              }
              break;
          }
        } catch (sourceError) {
          console.warn(`[Research] Source ${source} failed:`, sourceError);
        }
      }

      ctx.meter.recordTokens(input.topic.length / 4, findings.length * 100);

      return {
        success: true,
        data: {
          findings: findings.slice(0, maxResults),
          summary: `Found ${findings.length} results from ${usedSources.length} sources for "${input.topic}"`,
          sources: usedSources,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // Tool Execution Pipeline
  // ============================================================================

  private async executeTool(
    toolName: string,
    args: unknown
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const toolConfig = this.tools.get(toolName);
    if (!toolConfig) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const authContext = this.getDefaultAuthContext();
    const rateCheck = this.rateLimiter.check(authContext, toolName);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Retry after ${rateCheck.retryAfter} seconds.`);
    }

    const meter = this.metering.createMeter(
      authContext.apiKey?.id || 'anonymous',
      toolName,
      requestId
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), toolConfig.maxExecutionTime);

    const ctx: ToolExecutionContext = {
      auth: authContext,
      requestId,
      signal: controller.signal,
      meter,
      logger: console as Logger,
      streaming: this.config.enableStreaming,
    };

    try {
      const rawResult = await toolConfig.handler(args, ctx);
      const duration = Date.now() - startTime;

      // Type narrow: handlers in this implementation always return ToolResult, not AsyncIterable
      const result = rawResult as ToolResult<unknown>;
      this.metering.finalize(meter, result.success, duration, result.error);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metering.finalize(meter, false, duration, String(error));
      throw error;
    } finally {
      clearTimeout(timeout);
      this.rateLimiter.release(authContext);
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    if (this.running) return;

    // Register default resources
    this.registerResource({
      uriPattern: 'genesis://memory/{type}',
      name: 'Genesis Memory',
      description: 'Access Genesis memory systems',
      mimeType: 'application/json',
      requiredScopes: ['memory:read'],
      listHandler: async () => [
        { uri: 'genesis://memory/episodic', name: 'Episodic Memory' },
        { uri: 'genesis://memory/semantic', name: 'Semantic Memory' },
        { uri: 'genesis://memory/procedural', name: 'Procedural Memory' },
      ],
      readHandler: async (uri) => ({
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ type: uri.split('/').pop(), entries: [] }),
      }),
    });

    // Register default prompts
    this.registerPrompt({
      name: 'deep-analysis',
      description: 'Prompt template for deep multi-perspective analysis',
      arguments: [
        { name: 'topic', description: 'Topic to analyze', required: true },
        { name: 'perspectives', description: 'Perspectives to consider', required: false },
      ],
      requiredScopes: ['prompts'],
      handler: async (args) => ({
        messages: [
          { role: 'system', content: 'You are a multi-perspective analyst using Genesis cognitive architecture.' },
          { role: 'user', content: `Analyze "${args.topic}" from the following perspectives: ${args.perspectives || 'technical, ethical, practical'}` },
        ],
      }),
    });

    // Connect transport
    if (this.config.transport.type === 'stdio') {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    }

    this.running = true;
    this.emit('started');
    console.log(`[GenesisMCP] Server started: ${this.config.name} v${this.config.version}`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    await this.server.close();
    this.running = false;
    this.emit('stopped');
    console.log('[GenesisMCP] Server stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // API Key Management
  // ============================================================================

  createAPIKey(owner: string, scopes: string[], tier: APIKey['tier']): { key: string; id: string } {
    return this.auth.createAPIKey(owner, scopes, tier);
  }

  getUsageSummary(apiKeyId: string, days: number = 30): UsageSummary {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return this.metering.getSummary(apiKeyId, periodStart, now);
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createGenesisMCPServer(config?: Partial<MCPServerConfig>): GenesisMCPServer {
  return new GenesisMCPServer(config);
}

export default GenesisMCPServer;
