/**
 * Genesis v23.0 - Unified REST API Layer
 *
 * Production-grade HTTP server exposing Genesis capabilities:
 * - Chat: Streaming conversational AI
 * - Brain: Unified cognitive queries
 * - Memory: Episodic/semantic/procedural operations
 * - Bounty: Autonomous bounty hunting status
 * - Content: Multi-platform content operations
 * - Analytics: System and content metrics
 * - Health: System status and diagnostics
 *
 * All endpoints support JSON request/response with proper error handling.
 *
 * @module api
 * @version 23.0.0
 */

import * as http from 'http';
import { parse as parseUrl } from 'url';

// Core imports
import { getMemorySystem } from '../memory/index.js';
import { getBrain } from '../brain/index.js';
import { getBountyOrchestrator } from '../economy/bounty-orchestrator.js';
import { getContentOrchestrator } from '../content/orchestrator.js';
import { getContentScheduler } from '../content/scheduler/index.js';
import { getAnalyticsAggregator } from '../content/analytics/index.js';
import { getEventBus } from '../bus/index.js';
import { getCognitiveBridge } from '../integration/cognitive-bridge.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';

// Re-export chat API
export { ChatAPI, getChatAPI } from './chat-api.js';

// ============================================================================
// Types
// ============================================================================

export interface APIConfig {
  port: number;
  host: string;
  enableCors: boolean;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  enableMetrics: boolean;
  apiKeyRequired: boolean;
  apiKey?: string;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  requestId: string;
}

interface RouteHandler {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';
  handler: (req: http.IncomingMessage, body: unknown) => Promise<APIResponse>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: APIConfig = {
  port: 3001,
  host: '0.0.0.0',
  enableCors: true,
  corsOrigins: ['*'],
  rateLimit: {
    windowMs: 60000,  // 1 minute
    maxRequests: 100,
  },
  enableMetrics: true,
  apiKeyRequired: false,
};

// ============================================================================
// Unified API Server
// ============================================================================

export class GenesisAPI {
  private config: APIConfig;
  private server: http.Server | null = null;
  private routes: Map<string, Map<string, RouteHandler>> = new Map();
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private requestCounter = 0;

  // Lazy-loaded modules
  private memory = getMemorySystem();
  private bus = getEventBus();
  private cognitiveBridge = getCognitiveBridge();

  constructor(config?: Partial<APIConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupRoutes();
  }

  // ===========================================================================
  // Route Setup
  // ===========================================================================

  private setupRoutes(): void {
    // Health routes
    this.addRoute('GET', '/health', this.handleHealth.bind(this));
    this.addRoute('GET', '/health/detailed', this.handleHealthDetailed.bind(this));

    // Memory routes
    this.addRoute('POST', '/memory/recall', this.handleMemoryRecall.bind(this));
    this.addRoute('POST', '/memory/remember', this.handleMemoryRemember.bind(this));
    this.addRoute('POST', '/memory/learn', this.handleMemoryLearn.bind(this));
    this.addRoute('GET', '/memory/stats', this.handleMemoryStats.bind(this));

    // Brain routes
    this.addRoute('POST', '/brain/process', this.handleBrainProcess.bind(this));
    this.addRoute('GET', '/brain/state', this.handleBrainState.bind(this));

    // Bounty routes
    this.addRoute('GET', '/bounty/status', this.handleBountyStatus.bind(this));
    this.addRoute('GET', '/bounty/active', this.handleBountyActive.bind(this));
    this.addRoute('GET', '/bounty/stats', this.handleBountyStats.bind(this));

    // Content routes
    this.addRoute('POST', '/content/create', this.handleContentCreate.bind(this));
    this.addRoute('GET', '/content/queue', this.handleContentQueue.bind(this));
    this.addRoute('GET', '/content/analytics', this.handleContentAnalytics.bind(this));

    // Consciousness routes
    this.addRoute('GET', '/consciousness/phi', this.handleConsciousnessPhi.bind(this));
    this.addRoute('GET', '/consciousness/state', this.handleConsciousnessState.bind(this));

    // Integration routes
    this.addRoute('GET', '/integration/bridge', this.handleBridgeStats.bind(this));
    this.addRoute('POST', '/integration/ground', this.handleGroundAction.bind(this));
  }

  private addRoute(method: string, path: string, handler: RouteHandler['handler']): void {
    if (!this.routes.has(path)) {
      this.routes.set(path, new Map());
    }
    this.routes.get(path)!.set(method, { method: method as RouteHandler['method'], handler });
  }

  // ===========================================================================
  // HTTP Server
  // ===========================================================================

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[GenesisAPI] Server running at http://${this.config.host}:${this.config.port}`);
        this.emitEvent('api.started', { port: this.config.port });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else {
          console.log('[GenesisAPI] Server stopped');
          this.emitEvent('api.stopped', {});
          resolve();
        }
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const requestId = `req-${++this.requestCounter}-${Date.now().toString(36)}`;
    const startTime = Date.now();

    // CORS
    if (this.config.enableCors) {
      res.setHeader('Access-Control-Allow-Origin', this.config.corsOrigins.join(', '));
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Rate limiting
    if (!this.checkRateLimit(req)) {
      this.sendResponse(res, 429, {
        success: false,
        error: 'Rate limit exceeded',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    // API key check
    if (this.config.apiKeyRequired && !this.validateApiKey(req)) {
      this.sendResponse(res, 401, {
        success: false,
        error: 'Invalid or missing API key',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    // Parse URL
    const parsedUrl = parseUrl(req.url || '/', true);
    const path = parsedUrl.pathname || '/';
    const method = req.method || 'GET';

    // Find route
    const pathRoutes = this.routes.get(path);
    const routeHandler = pathRoutes?.get(method);

    if (!routeHandler) {
      this.sendResponse(res, 404, {
        success: false,
        error: `Route not found: ${method} ${path}`,
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    try {
      // Parse body for POST/PUT
      let body: unknown = null;
      if (method === 'POST' || method === 'PUT') {
        body = await this.parseBody(req);
      }

      // Execute handler
      const response = await routeHandler.handler(req, body);
      response.requestId = requestId;

      // Log if metrics enabled
      if (this.config.enableMetrics) {
        const duration = Date.now() - startTime;
        console.log(`[API] ${method} ${path} -> ${response.success ? 200 : 400} (${duration}ms)`);
      }

      this.sendResponse(res, response.success ? 200 : 400, response);

    } catch (error) {
      console.error(`[API] Error handling ${method} ${path}:`, error);
      this.sendResponse(res, 500, {
        success: false,
        error: String(error),
        timestamp: new Date().toISOString(),
        requestId,
      });
    }
  }

  private async parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendResponse(res: http.ServerResponse, statusCode: number, data: APIResponse): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }

  private checkRateLimit(req: http.IncomingMessage): boolean {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = this.requestCounts.get(ip);

    if (!entry || entry.resetTime < now) {
      this.requestCounts.set(ip, { count: 1, resetTime: now + this.config.rateLimit.windowMs });
      return true;
    }

    entry.count++;
    return entry.count <= this.config.rateLimit.maxRequests;
  }

  private validateApiKey(req: http.IncomingMessage): boolean {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    return apiKey === this.config.apiKey;
  }

  private emitEvent(topic: string, data: unknown): void {
    try {
      (this.bus as any).publish(topic, data);
    } catch {
      // Event bus may not support custom topics
    }
  }

  // ===========================================================================
  // Health Handlers
  // ===========================================================================

  private async handleHealth(): Promise<APIResponse> {
    return {
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        version: '23.0.0',
      },
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  private async handleHealthDetailed(): Promise<APIResponse> {
    const phiMonitor = getPhiMonitor();
    const levelData = phiMonitor.getCurrentLevel?.() ?? null;
    const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0);

    return {
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        version: '23.0.0',
        memory: process.memoryUsage(),
        cognitive: {
          phi,
          bridgeStats: this.cognitiveBridge.getStats(),
        },
        memorySystem: {
          episodicCount: this.memory.episodic.getRecent(1000).length,
          semanticCount: this.memory.semantic.count(),
          proceduralCount: this.memory.procedural.count(),
        },
      },
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  // ===========================================================================
  // Memory Handlers
  // ===========================================================================

  private async handleMemoryRecall(_req: http.IncomingMessage, body: unknown): Promise<APIResponse> {
    const { query, limit = 10, types } = body as { query: string; limit?: number; types?: string[] };

    if (!query) {
      return { success: false, error: 'Query is required', timestamp: new Date().toISOString(), requestId: '' };
    }

    const validTypes = types?.filter((t: string) => ['episodic', 'semantic', 'procedural'].includes(t)) as ('episodic' | 'semantic' | 'procedural')[] | undefined;
    const results = this.memory.recall(query, { limit, types: validTypes });
    return {
      success: true,
      data: { results, count: results.length },
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  private async handleMemoryRemember(_req: http.IncomingMessage, body: unknown): Promise<APIResponse> {
    const { what, tags, importance } = body as { what: string; tags?: string[]; importance?: number };

    if (!what) {
      return { success: false, error: 'What is required', timestamp: new Date().toISOString(), requestId: '' };
    }

    const id = this.memory.remember({
      what,
      tags: tags || [],
      importance: importance || 0.5,
    });

    return {
      success: true,
      data: { id, stored: true },
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  private async handleMemoryLearn(_req: http.IncomingMessage, body: unknown): Promise<APIResponse> {
    const { concept, definition, category, confidence } = body as {
      concept: string;
      definition: string;
      category?: string;
      confidence?: number;
    };

    if (!concept || !definition) {
      return { success: false, error: 'Concept and definition are required', timestamp: new Date().toISOString(), requestId: '' };
    }

    const id = this.memory.learn({
      concept,
      definition,
      category: category || 'general',
      confidence: confidence || 0.8,
    });

    return {
      success: true,
      data: { id, learned: true },
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  private async handleMemoryStats(): Promise<APIResponse> {
    return {
      success: true,
      data: {
        episodic: this.memory.episodic.getRecent(1000).length,
        semantic: this.memory.semantic.count(),
        procedural: this.memory.procedural.count(),
        totalRecalls: 0,  // Would need tracking
      },
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  // ===========================================================================
  // Brain Handlers
  // ===========================================================================

  private async handleBrainProcess(_req: http.IncomingMessage, body: unknown): Promise<APIResponse> {
    const { input, context } = body as { input: string; context?: Record<string, unknown> };

    if (!input) {
      return { success: false, error: 'Input is required', timestamp: new Date().toISOString(), requestId: '' };
    }

    try {
      const brain = getBrain();
      const result = await brain.process(input, context);

      return {
        success: true,
        data: { response: result },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Brain processing failed: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  private async handleBrainState(): Promise<APIResponse> {
    try {
      const brain = getBrain();
      const status = brain.getStatus();

      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get brain state: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  // ===========================================================================
  // Bounty Handlers
  // ===========================================================================

  private async handleBountyStatus(): Promise<APIResponse> {
    try {
      const orchestrator = getBountyOrchestrator();
      const state = orchestrator.getState();

      return {
        success: true,
        data: {
          status: state.status,
          cycleCount: state.cycleCount,
          todayStats: state.todayStats,
        },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get bounty status: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  private async handleBountyActive(): Promise<APIResponse> {
    try {
      const orchestrator = getBountyOrchestrator();
      const state = orchestrator.getState();

      const activeBounties = Array.from(state.activeBounties.entries()).map(([id, bounty]) => ({
        id,
        title: bounty.bounty.title,
        phase: bounty.phase,
        startedAt: bounty.startedAt,
        efeScore: bounty.efeScore,
      }));

      return {
        success: true,
        data: { active: activeBounties, count: activeBounties.length },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get active bounties: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  private async handleBountyStats(): Promise<APIResponse> {
    try {
      const orchestrator = getBountyOrchestrator();
      const state = orchestrator.getState();

      return {
        success: true,
        data: {
          todayStats: state.todayStats,
          cycleCount: state.cycleCount,
          lastCycleTime: state.lastCycleTime,
        },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get bounty stats: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  // ===========================================================================
  // Content Handlers
  // ===========================================================================

  private async handleContentCreate(_req: http.IncomingMessage, body: unknown): Promise<APIResponse> {
    const { topic, type, platforms } = body as {
      topic: string;
      type?: string;
      platforms?: string[];
    };

    if (!topic) {
      return { success: false, error: 'Topic is required', timestamp: new Date().toISOString(), requestId: '' };
    }

    try {
      const orchestrator = getContentOrchestrator();
      const result = await orchestrator.createAndPublish({
        topic,
        type: type as any || 'article',
        platforms: (platforms || ['twitter']) as any,
      });

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Content creation failed: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  private async handleContentQueue(): Promise<APIResponse> {
    try {
      const scheduler = getContentScheduler();
      const queue = await scheduler.getQueue();

      return {
        success: true,
        data: { queue, count: queue.length },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get content queue: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  private async handleContentAnalytics(): Promise<APIResponse> {
    try {
      const aggregator = getAnalyticsAggregator();
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const metrics = await aggregator.aggregateMetrics(since);

      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get content analytics: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  // ===========================================================================
  // Consciousness Handlers
  // ===========================================================================

  private async handleConsciousnessPhi(): Promise<APIResponse> {
    try {
      const phiMonitor = getPhiMonitor();
      const levelData = phiMonitor.getCurrentLevel?.() ?? null;
      const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0);
      const trend = phiMonitor.getTrend?.() ?? 'stable';

      return {
        success: true,
        data: { phi, trend },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get consciousness phi: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  private async handleConsciousnessState(): Promise<APIResponse> {
    try {
      const phiMonitor = getPhiMonitor();
      const state = phiMonitor.getState?.() ?? 'unknown';
      const levelData = phiMonitor.getCurrentLevel?.() ?? null;
      const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0);

      return {
        success: true,
        data: {
          state,
          phi,
          recentPerceptions: this.cognitiveBridge.getRecentPerceptions(5).length,
          cachedEpisodes: this.cognitiveBridge.getCachedEpisodes().length,
        },
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get consciousness state: ${error}`,
        timestamp: new Date().toISOString(),
        requestId: '',
      };
    }
  }

  // ===========================================================================
  // Integration Handlers
  // ===========================================================================

  private async handleBridgeStats(): Promise<APIResponse> {
    const stats = this.cognitiveBridge.getStats();

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }

  private async handleGroundAction(_req: http.IncomingMessage, body: unknown): Promise<APIResponse> {
    const { action, context } = body as { action: string; context?: unknown };

    if (!action) {
      return { success: false, error: 'Action is required', timestamp: new Date().toISOString(), requestId: '' };
    }

    const grounded = await this.cognitiveBridge.groundAction(action, context);

    return {
      success: true,
      data: grounded,
      timestamp: new Date().toISOString(),
      requestId: '',
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let apiInstance: GenesisAPI | null = null;

export function getGenesisAPI(config?: Partial<APIConfig>): GenesisAPI {
  if (!apiInstance) {
    apiInstance = new GenesisAPI(config);
  }
  return apiInstance;
}

export function resetGenesisAPI(): void {
  if (apiInstance) {
    apiInstance.stop().catch(console.error);
  }
  apiInstance = null;
}

// ============================================================================
// Convenience function to start API server
// ============================================================================

export async function startAPIServer(config?: Partial<APIConfig>): Promise<GenesisAPI> {
  const api = getGenesisAPI(config);
  await api.start();
  return api;
}
