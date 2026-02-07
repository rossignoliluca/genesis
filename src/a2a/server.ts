/**
 * Genesis A2A Server
 *
 * Server for receiving and processing A2A protocol requests.
 * Exposes local agent capabilities to the network.
 */

import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import { getRevenueTracker } from '../payments/revenue-tracker.js';
import {
  A2AAgentId,
  A2AMessage,
  A2AResponse,
  A2AMethod,
  A2AEndpoint,
  A2AKeyPair,
  A2AErrorCode,
  A2ASignature,
  AgentCapability,
  AgentAnnouncement,
  TaskRequest,
  TaskResult,
  TrustScore,
  TrustAttestation,
  TrustLevel,
  PaymentQuote,
  createA2AResponse,
  createA2AError,
  A2A_PROTOCOL_VERSION,
} from './protocol.js';

// ============================================================================
// Types
// ============================================================================

export interface A2AServerConfig {
  agentId: A2AAgentId;
  instanceName: string;
  keyPair: A2AKeyPair;
  httpPort?: number;
  wsPort?: number;
  secure?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  capabilities?: AgentCapability[];
  debug?: boolean;
  rateLimit?: number;
  minTrustLevel?: number;
}

export interface ActiveTask {
  request: TaskRequest;
  from: A2AAgentId;
  status: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  progress: number;
  assignedAgent?: string;
}

export type A2AMethodHandler = (
  message: A2AMessage,
  context: HandlerContext
) => Promise<unknown>;

export interface HandlerContext {
  agentId: A2AAgentId;
  trust: TrustScore;
  authenticated: boolean;
}

// ============================================================================
// A2A Server Class
// ============================================================================

export class A2AServer extends EventEmitter {
  private config: A2AServerConfig;
  private httpServer?: http.Server | https.Server;
  private handlers: Map<A2AMethod, A2AMethodHandler> = new Map();
  private activeTasks: Map<string, ActiveTask> = new Map();
  private capabilities: AgentCapability[] = [];
  private trustStore: Map<A2AAgentId, TrustScore> = new Map();
  private attestations: TrustAttestation[] = [];
  private rateLimitMap: Map<string, number[]> = new Map();

  // v14.1: Governance gate for incoming A2A requests
  private governanceGate?: (request: { method: string; from: string; id: string }) => Promise<boolean>;

  private metrics = {
    requestsReceived: 0,
    requestsProcessed: 0,
    requestsRejected: 0,
    tasksAccepted: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    avgProcessingTime: 0,
  };

  constructor(config: A2AServerConfig) {
    super();
    this.config = {
      httpPort: 8080,
      rateLimit: 100,
      minTrustLevel: 0,
      debug: false,
      ...config,
    };
    this.capabilities = config.capabilities || [];

    this.registerDefaultHandlers();
  }

  // ============================================================================
  // Server Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    if (this.config.httpPort) {
      this.startHttpServer();
    }

    this.log(`A2A Server started on port ${this.config.httpPort}`);
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }

    this.emit('stopped');
  }

  /**
   * v14.1: Set governance gate for incoming A2A requests
   * The gate function receives request info and returns true if approved
   */
  setGovernanceGate(gate: (request: { method: string; from: string; id: string }) => Promise<boolean>): void {
    this.governanceGate = gate;
  }

  /**
   * v14.1: Check governance gate before processing request
   */
  private async checkGovernanceGate(message: A2AMessage): Promise<boolean> {
    if (!this.governanceGate) return true; // No gate = allow all
    try {
      return await this.governanceGate({
        method: message.method,
        from: message.from,
        id: message.id,
      });
    } catch {
      return false; // Gate error = deny
    }
  }

  private startHttpServer(): void {
    const handler = this.createHttpHandler();

    if (this.config.secure && this.config.tlsCert && this.config.tlsKey) {
      this.httpServer = https.createServer(
        {
          cert: this.config.tlsCert,
          key: this.config.tlsKey,
        },
        handler
      );
    } else {
      this.httpServer = http.createServer(handler);
    }

    this.httpServer.listen(this.config.httpPort);
  }

  private createHttpHandler(): http.RequestListener {
    return async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-A2A-Protocol');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== 'POST' || req.url !== '/a2a') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!this.checkRateLimit(clientIp)) {
        const response = createA2AError('rate-limited', A2AErrorCode.RateLimited, 'Rate limit exceeded');
        res.writeHead(429);
        res.end(JSON.stringify(response));
        return;
      }

      let body = '';
      req.on('data', (chunk) => (body += chunk));

      req.on('end', async () => {
        try {
          const message = JSON.parse(body) as A2AMessage;
          const response = await this.handleMessage(message);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          const response = createA2AError(
            'parse-error',
            A2AErrorCode.ParseError,
            error instanceof Error ? error.message : 'Parse error'
          );
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        }
      });
    };
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  async handleMessage(message: A2AMessage): Promise<A2AResponse> {
    this.metrics.requestsReceived++;
    const startTime = Date.now();

    try {
      if (message.protocol && message.protocol !== A2A_PROTOCOL_VERSION) {
        return createA2AError(
          message.id,
          A2AErrorCode.ProtocolMismatch,
          `Protocol version mismatch: expected ${A2A_PROTOCOL_VERSION}, got ${message.protocol}`
        );
      }

      if (message.signature && !this.verifySignature(message)) {
        return createA2AError(message.id, A2AErrorCode.SignatureInvalid, 'Invalid message signature');
      }

      const context = await this.getSenderContext(message);

      if (context.trust.overall < (this.config.minTrustLevel || 0)) {
        this.metrics.requestsRejected++;
        return createA2AError(
          message.id,
          A2AErrorCode.InsufficientTrust,
          `Trust level ${context.trust.overall} below minimum ${this.config.minTrustLevel}`
        );
      }

      const handler = this.handlers.get(message.method);
      if (!handler) {
        return createA2AError(message.id, A2AErrorCode.MethodNotFound, `Method not found: ${message.method}`);
      }

      const result = await handler(message, context);

      this.metrics.requestsProcessed++;
      this.updateAvgProcessingTime(Date.now() - startTime);

      return createA2AResponse(message.id, result, this.sign(JSON.stringify(result)));
    } catch (error) {
      this.metrics.requestsRejected++;
      return createA2AError(
        message.id,
        A2AErrorCode.InternalError,
        error instanceof Error ? error.message : 'Internal error'
      );
    }
  }

  registerHandler(method: A2AMethod, handler: A2AMethodHandler): void {
    this.handlers.set(method, handler);
  }

  // ============================================================================
  // Default Handlers
  // ============================================================================

  private registerDefaultHandlers(): void {
    this.handlers.set('a2a.ping', async () => ({
      version: A2A_PROTOCOL_VERSION,
      instanceName: this.config.instanceName,
      timestamp: new Date().toISOString(),
    }));

    this.handlers.set('a2a.discover', async () => this.getAnnouncement());

    this.handlers.set('a2a.capabilities.list', async () => ({
      capabilities: this.capabilities,
    }));

    this.handlers.set('a2a.capabilities.query', async (message) => {
      const params = message.params as unknown as Record<string, unknown>;
      const query = params?.query as Record<string, unknown> | undefined;
      let filtered = this.capabilities;

      if (query?.category) {
        filtered = filtered.filter((c) => c.category === query.category);
      }
      if (query?.tags && Array.isArray(query.tags)) {
        filtered = filtered.filter((c) => (query.tags as string[]).some((t) => c.tags?.includes(t)));
      }

      return { capabilities: filtered };
    });

    this.handlers.set('a2a.task.request', async (message, context) => {
      return this.handleTaskRequest(message, context);
    });

    this.handlers.set('a2a.task.cancel', async (message) => {
      const params = message.params as unknown as Record<string, unknown>;
      const taskId = params?.taskId as string;
      const task = this.activeTasks.get(taskId);

      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      task.status = 'cancelled';
      return { cancelled: true };
    });

    this.handlers.set('a2a.trust.query', async (message) => {
      const params = message.params as unknown as Record<string, unknown>;
      const query = params?.query as Record<string, unknown> | undefined;
      const agentId = query?.agentId as A2AAgentId | undefined;
      if (agentId) {
        return this.trustStore.get(agentId) || this.getDefaultTrust(agentId);
      }
      return this.getDefaultTrust(this.config.agentId);
    });

    this.handlers.set('a2a.trust.attest', async (message) => {
      const params = message.params as unknown as Record<string, unknown>;
      const attestation = params?.attestation as TrustAttestation | undefined;
      if (attestation) {
        this.attestations.push(attestation);
        this.updateTrustFromAttestation(attestation);
      }
      return { received: true };
    });

    this.handlers.set('a2a.payment.quote', async (message) => {
      const params = message.params as unknown as Record<string, unknown>;
      const quote = params?.quote as Record<string, unknown> | undefined;
      const capabilityId = quote?.capabilityId as string;
      const capability = this.capabilities.find((c) => c.id === capabilityId);

      if (!capability?.pricing) {
        return {
          id: crypto.randomUUID(),
          capabilityId,
          price: 0,
          currency: 'credits',
          validUntil: new Date(Date.now() + 3600000).toISOString(),
        } as PaymentQuote;
      }

      return {
        id: crypto.randomUUID(),
        capabilityId,
        price: capability.pricing.basePrice,
        currency: capability.pricing.currency,
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        breakdown: { base: capability.pricing.basePrice },
      } as PaymentQuote;
    });
  }

  // ============================================================================
  // Task Processing
  // ============================================================================

  private async handleTaskRequest(
    message: A2AMessage,
    context: HandlerContext
  ): Promise<{ accepted: boolean; taskId?: string; reason?: string }> {
    const params = message.params as unknown as Record<string, unknown>;
    const taskRequest = params.task as TaskRequest;

    const capability = this.capabilities.find((c) => c.id === taskRequest.capabilityId);
    if (!capability) {
      return {
        accepted: false,
        reason: `Capability not found: ${taskRequest.capabilityId}`,
      };
    }

    if (capability.requiredTrust) {
      const minTrust = this.trustLevelToScore(capability.requiredTrust);
      if (context.trust.overall < minTrust) {
        return {
          accepted: false,
          reason: `Insufficient trust level for capability ${taskRequest.capabilityId}`,
        };
      }
    }

    if (capability.rateLimit) {
      const currentTasks = Array.from(this.activeTasks.values()).filter(
        (t) => t.from === context.agentId && t.status === 'running'
      );

      if (currentTasks.length >= capability.rateLimit.requests) {
        return {
          accepted: false,
          reason: 'Rate limit exceeded for this capability',
        };
      }
    }

    const activeTask: ActiveTask = {
      request: taskRequest,
      from: context.agentId,
      status: 'accepted',
      startTime: new Date(),
      progress: 0,
    };

    this.activeTasks.set(taskRequest.id, activeTask);
    this.metrics.tasksAccepted++;

    this.executeTask(activeTask).catch((error) => {
      this.log(`Task ${taskRequest.id} failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    });

    return {
      accepted: true,
      taskId: taskRequest.id,
    };
  }

  private async executeTask(task: ActiveTask): Promise<void> {
    task.status = 'running';

    try {
      // Simulate task execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      task.status = 'completed';
      task.progress = 100;
      this.metrics.tasksCompleted++;

      // v17.0: Record revenue from A2A task
      const capability = this.capabilities.find(c => c.id === task.request.capabilityId);
      if (capability?.pricing?.basePrice) {
        try {
          const revenueTracker = getRevenueTracker();
          revenueTracker.recordCost({
            category: 'other',
            amount: -capability.pricing.basePrice, // Negative cost = revenue
            description: `A2A task revenue: ${task.request.capabilityId}`,
            provider: task.from,
            metadata: { taskId: task.request.id, capability: capability.name },
          });
          this.emit('revenue', capability.pricing.basePrice, `a2a:${task.request.capabilityId}`);
        } catch { /* revenue tracking is optional */ }
      }

      const taskResult: TaskResult = {
        taskId: task.request.id,
        success: true,
        output: { message: 'Task completed successfully' },
        metrics: { executionTime: Date.now() - task.startTime.getTime() },
      };

      this.emit('task:complete', task.request.id, taskResult);

      if (task.request.callback) {
        await this.sendCallback(task.from, task.request.callback, taskResult);
      }
    } catch (error) {
      task.status = 'failed';
      this.metrics.tasksFailed++;

      const taskResult: TaskResult = {
        taskId: task.request.id,
        success: false,
        error: {
          code: A2AErrorCode.InternalError,
          message: error instanceof Error ? error.message : 'Task execution failed',
        },
      };

      this.emit('task:failed', task.request.id, taskResult);

      if (task.request.callback) {
        await this.sendCallback(task.from, task.request.callback, taskResult);
      }
    }
  }

  private async sendCallback(to: A2AAgentId, endpoint: A2AEndpoint, result: TaskResult): Promise<void> {
    try {
      const message = {
        jsonrpc: '2.0' as const,
        id: crypto.randomUUID(),
        method: 'a2a.task.complete' as const,
        params: { from: this.config.agentId, to, result },
        timestamp: new Date().toISOString(),
        protocol: A2A_PROTOCOL_VERSION,
      };

      const url = endpoint.secure ? `https://${endpoint.url}` : `http://${endpoint.url}`;

      await fetch(`${url}${endpoint.port ? `:${endpoint.port}` : ''}/a2a`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      this.log(`Callback failed: ${error}`);
    }
  }

  // ============================================================================
  // Capability Management
  // ============================================================================

  addCapability(capability: AgentCapability): void {
    this.capabilities.push(capability);
  }

  removeCapability(capabilityId: string): void {
    this.capabilities = this.capabilities.filter((c) => c.id !== capabilityId);
  }

  // ============================================================================
  // Trust Management
  // ============================================================================

  private getDefaultTrust(agentId: A2AAgentId): TrustScore {
    return {
      agentId,
      overall: 0.5,
      components: {
        reliability: 0.5,
        quality: 0.5,
        responsiveness: 0.5,
        financial: 0.5,
      },
      level: 'basic',
      interactions: 0,
      confidence: 0.1,
    };
  }

  private updateTrustFromAttestation(attestation: TrustAttestation): void {
    const current = this.trustStore.get(attestation.about) || this.getDefaultTrust(attestation.about);

    const alpha = 0.3;
    const normalizedRating = attestation.rating / 5;

    const updated: TrustScore = {
      ...current,
      overall: current.overall * (1 - alpha) + normalizedRating * alpha,
      interactions: current.interactions + 1,
      lastInteraction: attestation.timestamp,
      confidence: Math.min(0.95, current.confidence + 0.05),
    };

    if (updated.overall >= 0.9) updated.level = 'highly-trusted';
    else if (updated.overall >= 0.7) updated.level = 'trusted';
    else if (updated.overall >= 0.5) updated.level = 'verified';
    else if (updated.overall >= 0.3) updated.level = 'basic';
    else if (updated.overall >= 0.1) updated.level = 'minimal';
    else updated.level = 'untrusted';

    this.trustStore.set(attestation.about, updated);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private getAnnouncement(): AgentAnnouncement {
    return {
      agentId: this.config.agentId,
      instanceName: this.config.instanceName,
      version: A2A_PROTOCOL_VERSION,
      endpoints: this.getEndpoints(),
      capabilities: this.capabilities,
      publicKey: this.config.keyPair.publicKey,
    };
  }

  private getEndpoints(): A2AEndpoint[] {
    const endpoints: A2AEndpoint[] = [];

    if (this.config.httpPort) {
      endpoints.push({
        transport: 'http',
        url: 'localhost',
        port: this.config.httpPort,
        secure: this.config.secure,
      });
    }

    return endpoints;
  }

  private async getSenderContext(message: A2AMessage): Promise<HandlerContext> {
    const from = (message.params as unknown as Record<string, unknown>)?.from as A2AAgentId;

    return {
      agentId: from || ('genesis:unknown:unknown' as A2AAgentId),
      trust: this.trustStore.get(from) || this.getDefaultTrust(from),
      authenticated: !!message.signature,
    };
  }

  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const windowMs = 60000;
    const limit = this.config.rateLimit || 100;

    let timestamps = this.rateLimitMap.get(clientId) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= limit) {
      return false;
    }

    timestamps.push(now);
    this.rateLimitMap.set(clientId, timestamps);
    return true;
  }

  /**
   * v16.1.2: Implement actual signature verification (was stub returning true)
   * SECURITY: Verifies HMAC signature using sender's public key
   */
  private verifySignature(message: A2AMessage): boolean {
    if (!message.signature) {
      console.warn('[A2A] Message missing signature from:', message.from);
      return false;
    }

    try {
      const { signature } = message;

      // Verify timestamp is recent (within 5 minutes to prevent replay attacks)
      const sigTime = new Date(signature.timestamp).getTime();
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes

      if (now - sigTime > maxAge) {
        console.warn('[A2A] Signature expired:', message.from);
        return false;
      }

      // Reconstruct the payload that was signed
      const data = JSON.stringify({ method: message.method, params: message.params });
      const payload = `${data}:${signature.nonce}:${signature.timestamp}`;

      // Verify HMAC using the sender's public key
      // Note: In production, use asymmetric crypto (RSA/Ed25519) instead of HMAC
      const expectedSig = crypto
        .createHmac('sha256', signature.publicKey)
        .update(payload)
        .digest('hex');

      if (expectedSig !== signature.value) {
        console.warn('[A2A] Invalid signature from:', message.from);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[A2A] Signature verification error:', error);
      return false;
    }
  }

  private sign(data: string): A2ASignature {
    const nonce = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const payload = `${data}:${nonce}:${timestamp}`;

    const signature = crypto
      .createHmac('sha256', this.config.keyPair.privateKey)
      .update(payload)
      .digest('hex');

    return {
      algorithm: this.config.keyPair.algorithm,
      publicKey: this.config.keyPair.publicKey,
      value: signature,
      timestamp,
      nonce,
    };
  }

  private trustLevelToScore(level: TrustLevel): number {
    const levels: Record<TrustLevel, number> = {
      untrusted: 0,
      minimal: 0.2,
      basic: 0.4,
      verified: 0.6,
      trusted: 0.8,
      'highly-trusted': 0.95,
    };
    return levels[level] || 0;
  }

  private updateAvgProcessingTime(time: number): void {
    const count = this.metrics.requestsProcessed;
    this.metrics.avgProcessingTime = (this.metrics.avgProcessingTime * (count - 1) + time) / count;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[A2AServer:${this.config.instanceName}] ${message}`);
    }
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  getMetrics() {
    return {
      ...this.metrics,
      activeTasks: this.activeTasks.size,
      capabilities: this.capabilities.length,
    };
  }
}
