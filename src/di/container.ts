/**
 * Genesis v33 - Lightweight Dependency Injection Container (Item 25)
 *
 * Replaces 40+ singletons with a centralized DI container that provides:
 * - Explicit dependency declaration
 * - Lifecycle management (singleton, transient, lazy)
 * - Circular dependency detection
 * - Clean shutdown ordering
 * - Test isolation (fresh container per test)
 *
 * Migration strategy: Gradual. Existing get*() singletons can delegate
 * to the container. New code should use DI directly.
 */

// ============================================================================
// Types
// ============================================================================

export type Lifecycle = 'singleton' | 'transient';

export interface ProviderOptions {
  /** Lifecycle: singleton (one instance) or transient (new each time) */
  lifecycle?: Lifecycle;
  /** If true, singleton is created on first resolve, not at bootstrap */
  lazy?: boolean;
  /** Token names this provider depends on */
  dependencies?: string[];
  /** Tags for grouping (e.g., 'infrastructure', 'content', 'brain') */
  tags?: string[];
}

interface Provider<T = any> {
  factory: (container: DIContainer) => T | Promise<T>;
  options: ProviderOptions;
  instance?: T;
  resolved: boolean;
  resolving: boolean; // Circular dependency detection
}

export interface ServiceDescriptor {
  token: string;
  lifecycle: Lifecycle;
  lazy: boolean;
  dependencies: string[];
  tags: string[];
  resolved: boolean;
}

// ============================================================================
// DI Container
// ============================================================================

export class DIContainer {
  private providers: Map<string, Provider> = new Map();
  private shutdownOrder: string[] = [];

  /**
   * Register a service provider.
   */
  register<T>(
    token: string,
    factory: (container: DIContainer) => T | Promise<T>,
    options: ProviderOptions = {},
  ): this {
    this.providers.set(token, {
      factory,
      options: {
        lifecycle: options.lifecycle || 'singleton',
        lazy: options.lazy !== false, // Default to lazy
        dependencies: options.dependencies || [],
        tags: options.tags || [],
      },
      resolved: false,
      resolving: false,
    });
    return this;
  }

  /**
   * Resolve a service by token.
   */
  async resolve<T>(token: string): Promise<T> {
    const provider = this.providers.get(token);
    if (!provider) {
      throw new Error(`[DI] No provider registered for '${token}'`);
    }

    // Return cached singleton
    if (provider.options.lifecycle === 'singleton' && provider.resolved) {
      return provider.instance as T;
    }

    // Circular dependency detection
    if (provider.resolving) {
      throw new Error(`[DI] Circular dependency detected for '${token}'`);
    }

    provider.resolving = true;

    try {
      // Resolve dependencies first
      for (const dep of provider.options.dependencies || []) {
        if (!this.providers.has(dep)) {
          throw new Error(`[DI] Missing dependency '${dep}' required by '${token}'`);
        }
        await this.resolve(dep);
      }

      // Create instance
      const instance = await provider.factory(this);

      if (provider.options.lifecycle === 'singleton') {
        provider.instance = instance;
        provider.resolved = true;
        this.shutdownOrder.push(token);
      }

      return instance as T;
    } finally {
      provider.resolving = false;
    }
  }

  /**
   * Resolve synchronously (only works if already resolved or factory is sync).
   */
  resolveSync<T>(token: string): T {
    const provider = this.providers.get(token);
    if (!provider) {
      throw new Error(`[DI] No provider registered for '${token}'`);
    }

    if (provider.resolved && provider.instance !== undefined) {
      return provider.instance as T;
    }

    // Try sync factory
    provider.resolving = true;
    try {
      const result = provider.factory(this);
      if (result instanceof Promise) {
        throw new Error(`[DI] Cannot resolve '${token}' synchronously — factory is async`);
      }

      if (provider.options.lifecycle === 'singleton') {
        provider.instance = result;
        provider.resolved = true;
        this.shutdownOrder.push(token);
      }

      return result as T;
    } finally {
      provider.resolving = false;
    }
  }

  /**
   * Check if a token is registered.
   */
  has(token: string): boolean {
    return this.providers.has(token);
  }

  /**
   * Check if a token is already resolved (instance exists).
   */
  isResolved(token: string): boolean {
    return this.providers.get(token)?.resolved || false;
  }

  /**
   * Get all registered service descriptors.
   */
  getDescriptors(): ServiceDescriptor[] {
    return Array.from(this.providers.entries()).map(([token, provider]) => ({
      token,
      lifecycle: provider.options.lifecycle || 'singleton',
      lazy: provider.options.lazy !== false,
      dependencies: provider.options.dependencies || [],
      tags: provider.options.tags || [],
      resolved: provider.resolved,
    }));
  }

  /**
   * Get tokens by tag.
   */
  getByTag(tag: string): string[] {
    return Array.from(this.providers.entries())
      .filter(([, p]) => p.options.tags?.includes(tag))
      .map(([token]) => token);
  }

  /**
   * Bootstrap: validate dependency graph + initialize eager singletons.
   */
  async bootstrap(): Promise<void> {
    // 1. Validate all dependencies exist
    for (const [token, provider] of this.providers) {
      for (const dep of provider.options.dependencies || []) {
        if (!this.providers.has(dep)) {
          throw new Error(`[DI] '${token}' depends on '${dep}' which is not registered`);
        }
      }
    }

    // 2. Detect circular dependencies via DFS
    const cycles = this.detectCycles();
    if (cycles.length > 0) {
      throw new Error(`[DI] Circular dependencies: ${cycles.join(' → ')}`);
    }

    // 3. Initialize non-lazy singletons in dependency order
    const order = this.topologicalSort();
    for (const token of order) {
      const provider = this.providers.get(token)!;
      if (provider.options.lifecycle === 'singleton' && !provider.options.lazy) {
        await this.resolve(token);
      }
    }
  }

  /**
   * Shutdown all resolved singletons in reverse order.
   */
  async shutdown(): Promise<void> {
    const reversed = [...this.shutdownOrder].reverse();

    for (const token of reversed) {
      const provider = this.providers.get(token);
      if (!provider?.instance) continue;

      try {
        if (typeof (provider.instance as any).shutdown === 'function') {
          await (provider.instance as any).shutdown();
        } else if (typeof (provider.instance as any).close === 'function') {
          await (provider.instance as any).close();
        } else if (typeof (provider.instance as any).destroy === 'function') {
          await (provider.instance as any).destroy();
        } else if (typeof (provider.instance as any).reset === 'function') {
          (provider.instance as any).reset();
        }
      } catch (error) {
        console.error(`[DI] Shutdown error for '${token}':`, error);
      }
    }

    // Clear all instances
    for (const provider of this.providers.values()) {
      provider.instance = undefined;
      provider.resolved = false;
    }

    this.shutdownOrder = [];
  }

  /**
   * Create a child container that inherits registrations but gets fresh instances.
   * Useful for test isolation.
   */
  createChild(): DIContainer {
    const child = new DIContainer();

    for (const [token, provider] of this.providers) {
      child.register(token, provider.factory, { ...provider.options });
    }

    return child;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private detectCycles(): string[] {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (token: string, path: string[]): string[] | null => {
      if (stack.has(token)) {
        return [...path, token];
      }
      if (visited.has(token)) return null;

      visited.add(token);
      stack.add(token);

      const deps = this.providers.get(token)?.options.dependencies || [];
      for (const dep of deps) {
        const cycle = dfs(dep, [...path, token]);
        if (cycle) return cycle;
      }

      stack.delete(token);
      return null;
    };

    for (const token of this.providers.keys()) {
      if (!visited.has(token)) {
        const cycle = dfs(token, []);
        if (cycle) return cycle;
      }
    }

    return [];
  }

  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (token: string) => {
      if (visited.has(token)) return;
      visited.add(token);

      const deps = this.providers.get(token)?.options.dependencies || [];
      for (const dep of deps) {
        visit(dep);
      }

      sorted.push(token);
    };

    for (const token of this.providers.keys()) {
      visit(token);
    }

    return sorted;
  }
}

// ============================================================================
// Global Container + Bootstrap
// ============================================================================

let globalContainer: DIContainer | null = null;

/**
 * Get or create the global DI container.
 * On first call, bootstraps with default Genesis service registrations.
 */
export function getDIContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer();
    registerCoreServices(globalContainer);
  }
  return globalContainer;
}

/**
 * Reset global container (for tests).
 */
export function resetDIContainer(): void {
  globalContainer = null;
}

/**
 * Register core Genesis services into the container.
 * Services are lazy by default — only instantiated on first resolve.
 */
function registerCoreServices(di: DIContainer): void {
  // Layer 1: Infrastructure (no dependencies)
  di.register('eventBus', async () => {
    const { getEventBus } = await import('../bus/index.js');
    return getEventBus();
  }, { tags: ['infrastructure'], lazy: false });

  di.register('mcpClient', async () => {
    const { getMCPClient } = await import('../mcp/index.js');
    return getMCPClient();
  }, { tags: ['infrastructure'] });

  // Layer 2: Memory & Persistence
  di.register('memory', async () => {
    const { getMemorySystem } = await import('../memory/index.js');
    return getMemorySystem();
  }, { tags: ['memory'], dependencies: ['eventBus'] });

  di.register('persistence', async () => {
    const { getPersistenceAdapter } = await import('../persistence/pg-adapter.js');
    return getPersistenceAdapter();
  }, { tags: ['memory'] });

  di.register('graphRAG', async () => {
    const { getKnowledgeGraph } = await import('../memory/graph-rag.js');
    return getKnowledgeGraph();
  }, { tags: ['memory'], dependencies: ['memory'] });

  // Layer 3: Cognition
  di.register('thinking', async () => {
    const { getThinkingEngine } = await import('../thinking/index.js');
    return getThinkingEngine();
  }, { tags: ['cognition'] });

  di.register('metacognitive', async () => {
    const { getMetacognitiveController } = await import('./metacognitive-controller.js');
    return getMetacognitiveController();
  }, { tags: ['cognition'], dependencies: ['thinking'] });

  di.register('mctsEngine', async () => {
    const { getMCTSPRMEngine } = await import('./mcts-prm.js');
    return getMCTSPRMEngine();
  }, { tags: ['cognition'] });

  di.register('outcomeIntegrator', async () => {
    const { getOutcomeIntegrator } = await import('../active-inference/outcome-integrator.js');
    return getOutcomeIntegrator();
  }, { tags: ['cognition'], dependencies: ['eventBus'] });

  // Layer 4: Autonomous
  di.register('goalSystem', async () => {
    const { getGoalSystem } = await import('../autonomous/goal-system.js');
    return getGoalSystem();
  }, { tags: ['autonomous'], dependencies: ['memory', 'eventBus'] });

  di.register('attentionController', async () => {
    const { getAttentionController } = await import('../autonomous/attention-controller.js');
    return getAttentionController();
  }, { tags: ['autonomous'], dependencies: ['eventBus'] });

  di.register('selfReflection', async () => {
    const { getSelfReflection } = await import('../autonomous/self-reflection.js');
    return getSelfReflection();
  }, { tags: ['autonomous'], dependencies: ['memory'] });

  // Layer 5: Market Strategist
  di.register('marketStrategist', async () => {
    const { getMarketStrategist } = await import('../market-strategist/index.js');
    return getMarketStrategist();
  }, { tags: ['market'], dependencies: ['memory', 'mcpClient'] });

  // Layer 6: Content & Social
  di.register('contentOrchestrator', async () => {
    const { getContentOrchestrator } = await import('../content/orchestrator.js');
    return getContentOrchestrator();
  }, { tags: ['content'], dependencies: ['mcpClient'] });

  // Layer 7: Tools
  di.register('toolRegistry', async () => {
    const { getToolRegistry } = await import('../tools/index.js');
    return getToolRegistry();
  }, { tags: ['tools'] });

  // Layer 8: Agents
  di.register('agentPool', async () => {
    const { getAgentPool } = await import('../agents/agent-pool.js');
    return getAgentPool();
  }, { tags: ['agents'], dependencies: ['toolRegistry'] });

  // Layer 9: Observability
  di.register('dashboard', async () => {
    const { getDashboard } = await import('../observability/dashboard.js');
    return getDashboard();
  }, { tags: ['observability'], dependencies: ['eventBus'] });
}
