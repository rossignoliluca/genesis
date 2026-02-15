/**
 * Cognitive Bridge v21.0
 *
 * Unified integration layer that connects:
 * - Perception → Consciousness → Active Inference pipeline
 * - Memory systems (unified access pattern)
 * - Event Bus ↔ Message Bus bridging
 * - Grounding for operational decisions
 * - Morphogenetic ↔ Execution coordination
 *
 * This is the "glue" that makes Genesis truly integrated.
 *
 * @module integration/cognitive-bridge
 * @version 21.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getMemorySystem, type MemorySystem } from '../memory/index.js';
import { getUnifiedMemoryQuery } from '../memory/unified-query.js';

// ============================================================================
// Types
// ============================================================================

export interface CognitiveBridgeConfig {
  // Perception → Consciousness
  salienceThreshold: number;  // Min salience to propagate to consciousness
  attentionFeedbackEnabled: boolean;

  // Memory Integration
  memoryConsolidationThreshold: number;  // φ threshold for consolidation
  cacheRecentEpisodes: number;  // How many episodes to cache

  // Grounding
  groundBeforeExecute: boolean;
  groundingConfidenceThreshold: number;

  // Cross-bus bridging
  eventToAgentBridgeEnabled: boolean;
  agentToEventBridgeEnabled: boolean;
}

export interface PerceptionOutput {
  modality: string;
  content: any;
  confidence: number;
  salience: number;
  timestamp: Date;
}

export interface ConsciousnessInput {
  type: 'perception' | 'memory' | 'inference' | 'external';
  content: any;
  salience: number;
  source: string;
}

export interface GroundedAction {
  action: string;
  grounded: boolean;
  confidence: number;
  sources: string[];
  warnings: string[];
}

export interface BridgeEvent {
  id: string;
  fromBus: 'event' | 'agent';
  toBus: 'event' | 'agent';
  topic: string;
  payload: any;
  correlationId: string;
  timestamp: Date;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CognitiveBridgeConfig = {
  salienceThreshold: 0.6,
  attentionFeedbackEnabled: true,
  memoryConsolidationThreshold: 0.7,
  cacheRecentEpisodes: 20,
  groundBeforeExecute: true,
  groundingConfidenceThreshold: 0.5,
  eventToAgentBridgeEnabled: true,
  agentToEventBridgeEnabled: true,
};

// ============================================================================
// Cognitive Bridge
// ============================================================================

export class CognitiveBridge {
  private config: CognitiveBridgeConfig;
  private bus: GenesisEventBus;
  private memory: MemorySystem;
  private correlationCounter = 0;
  private recentPerceptions: PerceptionOutput[] = [];
  private cachedEpisodes: any[] = [];
  private bridgeLog: BridgeEvent[] = [];
  private cacheRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<CognitiveBridgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
    this.memory = getMemorySystem();
    this.setupBridges();
  }

  // ===========================================================================
  // Bridge Setup
  // ===========================================================================

  private setupBridges(): void {
    console.log('[CognitiveBridge] Setting up cognitive bridges...');

    // 1. Perception → Consciousness bridge
    this.setupPerceptionBridge();

    // 2. Memory consolidation triggers
    this.setupMemoryBridge();

    // 3. Event ↔ Agent bus bridge
    this.setupBusBridge();

    // 4. Error ↔ Morphogenetic bridge
    this.setupErrorBridge();

    console.log('[CognitiveBridge] All bridges active');
  }

  // ===========================================================================
  // 1. Perception → Consciousness Pipeline
  // ===========================================================================

  private setupPerceptionBridge(): void {
    // Listen for perception events
    this.bus.subscribePrefix('perception.', (event: any) => {
      const output = this.extractPerceptionOutput(event);
      if (output && output.salience >= this.config.salienceThreshold) {
        this.propagateToConsciousness(output);
      }
    });

    // Listen for multimodal fusion events
    this.bus.subscribePrefix('multimodal.', (event: any) => {
      if (event.topic === 'multimodal.fused') {
        this.handleFusedPercept(event);
      }
    });
  }

  private extractPerceptionOutput(event: any): PerceptionOutput | null {
    if (!event.payload) return null;

    return {
      modality: event.topic?.split('.')[1] || 'unknown',
      content: event.payload,
      confidence: event.payload.confidence ?? 0.5,
      salience: event.payload.salience ?? this.calculateSalience(event.payload),
      timestamp: new Date(),
    };
  }

  private calculateSalience(payload: any): number {
    // Calculate salience based on novelty, relevance, and intensity
    let salience = 0.5;

    // Novelty boost
    if (payload.isNovel || payload.novelty) {
      salience += 0.2;
    }

    // High confidence boost
    if (payload.confidence > 0.8) {
      salience += 0.15;
    }

    // Urgency boost
    if (payload.urgent || payload.priority === 'high') {
      salience += 0.25;
    }

    return Math.min(1, salience);
  }

  private propagateToConsciousness(output: PerceptionOutput): void {
    // Store recent perception
    this.recentPerceptions.push(output);
    if (this.recentPerceptions.length > 50) {
      this.recentPerceptions.shift();
    }

    // Emit to consciousness workspace
    const input: ConsciousnessInput = {
      type: 'perception',
      content: output.content,
      salience: output.salience,
      source: `perception.${output.modality}`,
    };

    try {
      (this.bus as any).publish('consciousness.workspace.propose', input);
    } catch (err) {

      console.error('[cognitive-bridge] operation failed:', err);
      // Consciousness events may not be in typed event map
    }

    // Also trigger memory if high salience
    if (output.salience > 0.8) {
      this.triggerPerceptualMemory(output);
    }
  }

  private handleFusedPercept(event: any): void {
    // High-salience fused percepts should influence attention
    if (this.config.attentionFeedbackEnabled && event.payload?.salience > 0.7) {
      try {
        (this.bus as any).publish('attention.shift', {
          target: event.payload.dominantModality || 'integrated',
          salience: event.payload.salience,
          source: 'cognitive-bridge',
        });
      } catch (err) {

        console.error('[cognitive-bridge] operation failed:', err);
        // Attention events may not be in typed event map
      }
    }
  }

  private triggerPerceptualMemory(output: PerceptionOutput): void {
    // Store high-salience percepts as episodic memories
    this.memory.remember({
      what: `High-salience ${output.modality} perception`,
      when: output.timestamp,
      where: { location: 'perceptual-stream', context: output.modality },
      who: { agents: ['perception-system'] },
      details: output.content,
      importance: output.salience,
      tags: ['perception', output.modality, 'high-salience'],
    });
  }

  // ===========================================================================
  // 2. Memory Integration
  // ===========================================================================

  private setupMemoryBridge(): void {
    // Listen for consciousness integration metrics (φ)
    this.bus.subscribePrefix('consciousness.', (event: any) => {
      if (event.topic === 'consciousness.phi.updated') {
        this.handlePhiUpdate(event.payload);
      }
    });

    // Cache recent episodes for fast workspace access
    this.refreshEpisodeCache();

    // Refresh cache periodically
    this.cacheRefreshTimer = setInterval(() => this.refreshEpisodeCache(), 60000);
  }

  private handlePhiUpdate(payload: any): void {
    const phi = payload?.phi ?? payload?.value ?? 0;

    // High integration = consolidate memories
    if (phi > this.config.memoryConsolidationThreshold) {
      this.triggerMemoryConsolidation();
    }
  }

  private async triggerMemoryConsolidation(): Promise<void> {
    try {
      await this.memory.consolidate();
      console.log('[CognitiveBridge] Memory consolidation triggered');
    } catch (error) {
      console.warn('[CognitiveBridge] Consolidation failed:', error);
    }
  }

  private refreshEpisodeCache(): void {
    try {
      this.cachedEpisodes = this.memory.episodic
        .getRecent(this.config.cacheRecentEpisodes);
    } catch (err) {
      // Memory may not be initialized yet — non-fatal
      console.error('[CognitiveBridge] Episode cache refresh failed:', err);
    }
  }

  /**
   * Get unified memory context for Active Inference observations
   */
  getMemoryContext(query: string, limit: number = 5): any[] {
    try {
      // Use basic memory recall as unified query is async
      return this.memory.recall(query, { limit });
    } catch (err) {

      console.error('[cognitive-bridge] operation failed:', err);
      // Return empty if memory not available
      return [];
    }
  }

  /**
   * Get unified memory context asynchronously
   */
  async getMemoryContextAsync(query: string, limit: number = 5): Promise<any[]> {
    try {
      const unified = getUnifiedMemoryQuery();
      const result = await unified.search({ query, limit });
      return result.results;
    } catch (err) {

      console.error('[cognitive-bridge] operation failed:', err);
      // Fallback to basic recall
      return this.memory.recall(query, { limit });
    }
  }

  /**
   * Get cached recent episodes for fast access
   */
  getCachedEpisodes(): any[] {
    return [...this.cachedEpisodes];
  }

  // ===========================================================================
  // 3. Event ↔ Agent Bus Bridge
  // ===========================================================================

  private setupBusBridge(): void {
    if (!this.config.eventToAgentBridgeEnabled) return;

    // Critical events that should trigger agent actions
    const criticalPatterns = [
      'pain.',           // Nociception → Daemon
      'error.',          // Errors → Error Handler Agent
      'resource.low',    // Resources → Optimizer Agent
      'security.',       // Security → Security Agent
    ];

    for (const pattern of criticalPatterns) {
      this.bus.subscribePrefix(pattern, (event: any) => {
        this.bridgeEventToAgent(event);
      });
    }
  }

  private bridgeEventToAgent(event: any): void {
    const correlationId = this.generateCorrelationId();

    const bridgeEvent: BridgeEvent = {
      id: `bridge-${Date.now()}`,
      fromBus: 'event',
      toBus: 'agent',
      topic: event.topic,
      payload: event.payload || event,
      correlationId,
      timestamp: new Date(),
    };

    this.bridgeLog.push(bridgeEvent);
    if (this.bridgeLog.length > 1000) {
      this.bridgeLog.shift();
    }

    // Emit agent message (if agent message bus available)
    try {
      (this.bus as any).publish('agent.message', {
        type: 'event-bridged',
        originalTopic: event.topic,
        payload: event.payload || event,
        correlationId,
        priority: this.inferPriority(event.topic),
      });
    } catch (err) {

      console.error('[cognitive-bridge] operation failed:', err);
      // Agent message channel may not exist
    }
  }

  private inferPriority(topic: string): 'low' | 'normal' | 'high' | 'critical' {
    if (topic.includes('pain') || topic.includes('security')) return 'critical';
    if (topic.includes('error')) return 'high';
    if (topic.includes('resource')) return 'normal';
    return 'low';
  }

  private generateCorrelationId(): string {
    return `corr-${++this.correlationCounter}-${Date.now().toString(36)}`;
  }

  // ===========================================================================
  // 4. Error ↔ Morphogenetic Bridge
  // ===========================================================================

  private setupErrorBridge(): void {
    // Listen for execution errors
    this.bus.subscribePrefix('execution.', (event: any) => {
      if (event.topic === 'execution.error' || event.topic === 'execution.failed') {
        this.bridgeToMorphogenetic(event);
      }
    });

    // Listen for runtime errors
    this.bus.subscribePrefix('runtime.', (event: any) => {
      if (event.topic === 'runtime.error') {
        this.bridgeToMorphogenetic(event);
      }
    });
  }

  private bridgeToMorphogenetic(event: any): void {
    const errorType = event.payload?.type || 'unknown';
    const errorMessage = event.payload?.message || event.payload?.error || 'Unknown error';

    // Map to morphogenetic capability signal
    const capabilitySignal = {
      capability: this.mapErrorToCapability(errorType),
      status: 'degraded',
      error: errorMessage,
      source: event.topic,
      timestamp: new Date().toISOString(),
    };

    try {
      (this.bus as any).publish('morphogenetic.capability.degraded', capabilitySignal);
    } catch (err) {

      console.error('[cognitive-bridge] operation failed:', err);
      // Morphogenetic events may not be in typed event map
    }

    // Also store in memory for learning
    this.memory.remember({
      what: `Execution error bridged to morphogenetic: ${errorMessage}`,
      when: new Date(),
      where: { location: 'cognitive-bridge', context: 'error-morpho-bridge' },
      who: { agents: ['cognitive-bridge'] },
      details: { event, capabilitySignal },
      importance: 0.7,
      tags: ['error', 'morphogenetic', 'capability-degraded'],
    });
  }

  private mapErrorToCapability(errorType: string): string {
    const mapping: Record<string, string> = {
      'syntax': 'code-generation',
      'runtime': 'code-execution',
      'network': 'external-communication',
      'timeout': 'resource-management',
      'validation': 'solution-validation',
      'api': 'external-api',
      'memory': 'memory-system',
      'permission': 'security',
    };

    for (const [key, capability] of Object.entries(mapping)) {
      if (errorType.toLowerCase().includes(key)) {
        return capability;
      }
    }

    return 'general-execution';
  }

  // ===========================================================================
  // 5. Grounding Integration
  // ===========================================================================

  /**
   * Ground an action before execution
   */
  async groundAction(action: string, context?: any): Promise<GroundedAction> {
    const result: GroundedAction = {
      action,
      grounded: true,
      confidence: 0.5,
      sources: [],
      warnings: [],
    };

    try {
      // Check semantic memory for relevant knowledge
      const knowledge = this.memory.recall(action, { types: ['semantic'], limit: 3 });
      if (knowledge.length > 0) {
        result.sources.push('semantic-memory');
        result.confidence += 0.15;
      }

      // Check procedural memory for skill
      const skills = this.memory.recall(action, { types: ['procedural'], limit: 2 });
      if (skills.length > 0) {
        result.sources.push('procedural-memory');
        result.confidence += 0.2;
      }

      // Check for past failures
      const failures = this.memory.recall(`failed ${action}`, { types: ['episodic'], limit: 3 });
      if (failures.length > 0) {
        result.warnings.push(`Similar action failed ${failures.length} times before`);
        result.confidence -= 0.1;
      }

      // Check grounding threshold
      if (result.confidence < this.config.groundingConfidenceThreshold) {
        result.grounded = false;
        result.warnings.push('Action not sufficiently grounded');
      }

    } catch (error) {
      result.grounded = false;
      result.warnings.push(`Grounding check failed: ${error}`);
    }

    return result;
  }

  /**
   * Record grounding outcome for learning
   */
  recordGroundingOutcome(action: string, success: boolean, details?: any): void {
    const concept = success ? `successful-${action}` : `failed-${action}`;

    this.memory.learn({
      concept,
      definition: `Action "${action}" ${success ? 'succeeded' : 'failed'}`,
      category: 'grounding-outcomes',
      confidence: 0.8,
    });

    if (!success && details) {
      this.memory.remember({
        what: `Action "${action}" failed`,
        when: new Date(),
        where: { location: 'cognitive-bridge', context: 'grounding' },
        who: { agents: ['grounding-system'] },
        details,
        importance: 0.7,
        tags: ['grounding', 'failure', action],
      });
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get recent perceptions for Active Inference observations
   */
  getRecentPerceptions(limit: number = 10): PerceptionOutput[] {
    return this.recentPerceptions.slice(-limit);
  }

  /**
   * Get bridge event log
   */
  getBridgeLog(limit: number = 100): BridgeEvent[] {
    return this.bridgeLog.slice(-limit);
  }

  /**
   * Get bridge statistics
   */
  getStats(): {
    recentPerceptions: number;
    cachedEpisodes: number;
    bridgeEvents: number;
    config: CognitiveBridgeConfig;
  } {
    return {
      recentPerceptions: this.recentPerceptions.length,
      cachedEpisodes: this.cachedEpisodes.length,
      bridgeEvents: this.bridgeLog.length,
      config: this.config,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CognitiveBridgeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clean up timers and resources
   */
  shutdown(): void {
    if (this.cacheRefreshTimer) {
      clearInterval(this.cacheRefreshTimer);
      this.cacheRefreshTimer = null;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let bridgeInstance: CognitiveBridge | null = null;

export function getCognitiveBridge(config?: Partial<CognitiveBridgeConfig>): CognitiveBridge {
  if (!bridgeInstance) {
    bridgeInstance = new CognitiveBridge(config);
  }
  return bridgeInstance;
}

export function resetCognitiveBridge(): void {
  bridgeInstance?.shutdown();
  bridgeInstance = null;
}
