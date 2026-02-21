/**
 * Genesis — ModuleRegistry
 *
 * Centralizes the module management concern extracted from the 3888-LOC
 * genesis.ts god object. Provides:
 *
 *   - Level-based boot sequencing (L1 → L4), each level gates on the prior
 *   - Topological sort within each level to respect explicit deps
 *   - Parallel boot of independent modules within a level
 *   - Optional modules: failures are logged but don't halt the level
 *   - Required modules: failures throw with a clear diagnostic message
 *   - Reverse-order shutdown with optional per-module ordering overrides
 *   - Health snapshot with per-module status and boot timing
 *
 * The `registerGenesisModules()` function mirrors the L1→L4 breakdown that
 * lives in genesis.ts, calling the same singleton getters in the same order.
 * genesis.ts can delegate its boot fields to this registry incrementally.
 */

import { createLogger } from './logger.js';
import { getFreeEnergyKernel } from '../kernel/free-energy-kernel.js';
import { getBrain } from '../brain/index.js';
import { getEventBus } from '../bus/index.js';
import { StateStore } from '../persistence/index.js';
import { getMemorySystem } from '../memory/index.js';
import { getNeuromodulationSystem } from '../neuromodulation/index.js';
import { getNociceptiveSystem } from '../nociception/index.js';
import { createAllostasisSystem } from '../allostasis/index.js';
import { getDaemon } from '../daemon/index.js';
import { getConsciousnessSystem } from '../consciousness/index.js';
import { getWorldModelSystem } from '../world-model/index.js';
import { getThinkingEngine } from '../thinking/index.js';
import { getMetacognitiveController } from '../reasoning/metacognitive-controller.js';
import { getGroundingSystem } from '../grounding/index.js';
import { getAgentPool } from '../agents/index.js';
import { getGovernanceSystem } from '../governance/index.js';
import { getSelfImprovementEngine } from '../self-modification/index.js';

// ============================================================================
// Logging
// ============================================================================

const log = createLogger('module-registry');

// ============================================================================
// Public types
// ============================================================================

/** Boot level — same hierarchy as genesis.ts bootL1…bootL4 */
export type BootLevel = 1 | 2 | 3 | 4;

/** Per-module registration options */
export interface ModuleOpts {
  /** Which boot level this module belongs to. L1 boots first, L4 last. */
  level: BootLevel;
  /**
   * IDs of other modules this one depends on. All deps must already be
   * booted (either at a lower level, or earlier in the same level after
   * topological sort) before this module's factory is called.
   */
  deps?: string[];
  /** Arbitrary category tags for introspection (e.g. 'cognitive', 'infra') */
  tags?: string[];
  /**
   * If true, a factory error logs a warning but does not abort the boot
   * sequence. The module's health status is set to 'failed'.
   * If false (default), a factory error throws and halts the entire boot.
   */
  optional?: boolean;
  /**
   * Lower numbers shut down earlier. Default: reverse boot insertion order.
   * Useful when a module must outlive another at the same level.
   */
  shutdownOrder?: number;
}

/** Live status of a single registered module */
export interface ModuleHealth {
  id: string;
  status: 'pending' | 'booting' | 'healthy' | 'degraded' | 'failed';
  level: BootLevel;
  bootTimeMs?: number;
  error?: string;
  tags: string[];
}

// ============================================================================
// Internal bookkeeping
// ============================================================================

interface ModuleEntry {
  id: string;
  factory: () => Promise<unknown>;
  opts: Required<ModuleOpts>;
  instance: unknown;
  health: ModuleHealth;
  bootedAt: number | null;
}

// ============================================================================
// Topological sort — Kahn's algorithm over a dep-graph within one level
// ============================================================================

function topoSort(entries: ModuleEntry[]): ModuleEntry[] {
  const ids = new Set(entries.map(e => e.id));
  // inDegree[id] = number of same-level deps not yet satisfied
  const inDegree = new Map<string, number>();
  // adj[id] = list of module IDs that depend on id (within this level)
  const adj = new Map<string, string[]>();

  for (const e of entries) {
    inDegree.set(e.id, 0);
    adj.set(e.id, []);
  }

  for (const e of entries) {
    for (const dep of e.opts.deps) {
      // Only count deps that are part of this level; cross-level deps are
      // guaranteed satisfied by the level gate in ModuleRegistry.boot().
      if (!ids.has(dep)) continue;
      inDegree.set(e.id, (inDegree.get(e.id) ?? 0) + 1);
      adj.get(dep)!.push(e.id);
    }
  }

  const queue: ModuleEntry[] = [];
  const sorted: ModuleEntry[] = [];
  const entryMap = new Map(entries.map(e => [e.id, e]));

  for (const e of entries) {
    if ((inDegree.get(e.id) ?? 0) === 0) queue.push(e);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const dependent of adj.get(node.id) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(entryMap.get(dependent)!);
    }
  }

  if (sorted.length !== entries.length) {
    const cycle = entries
      .filter(e => !sorted.includes(e))
      .map(e => e.id)
      .join(', ');
    throw new Error(
      `[ModuleRegistry] Circular dependency detected among: ${cycle}`,
    );
  }

  return sorted;
}

// ============================================================================
// ModuleRegistry
// ============================================================================

export class ModuleRegistry {
  private readonly entries = new Map<string, ModuleEntry>();
  /** Boot insertion order — used as default shutdown order base */
  private bootOrder: string[] = [];

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register a module factory.
   *
   * @param id      Unique stable identifier (e.g. 'memory', 'fek', 'brain')
   * @param factory Async factory that creates or retrieves the module instance
   * @param opts    Level, deps, tags, optional flag, shutdown order
   *
   * Safe to call before boot. Re-registering the same id overwrites the entry.
   */
  register(
    id: string,
    factory: () => Promise<unknown>,
    opts: ModuleOpts,
  ): this {
    const full: Required<ModuleOpts> = {
      level: opts.level,
      deps: opts.deps ?? [],
      tags: opts.tags ?? [],
      optional: opts.optional ?? false,
      shutdownOrder: opts.shutdownOrder ?? 0,
    };

    this.entries.set(id, {
      id,
      factory,
      opts: full,
      instance: undefined,
      bootedAt: null,
      health: {
        id,
        status: 'pending',
        level: opts.level,
        tags: full.tags,
      },
    });

    return this;
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  /**
   * Boot all modules registered at the specified level.
   *
   * Call sequentially: boot(1) → boot(2) → boot(3) → boot(4).
   * Each call validates that all dep modules from prior levels are healthy
   * before booting any module in this level.
   *
   * Within the level, modules are topologically sorted by their `deps` array,
   * then any independent modules at the same rank are started in parallel.
   */
  async boot(level: BootLevel): Promise<void> {
    const levelEntries = this.entriesAtLevel(level);

    // Validate that cross-level deps are already healthy
    for (const e of levelEntries) {
      for (const dep of e.opts.deps) {
        const depEntry = this.entries.get(dep);
        if (!depEntry) continue; // Dep lives outside registry — caller's concern
        if (depEntry.opts.level < level && depEntry.health.status !== 'healthy') {
          throw new Error(
            `[ModuleRegistry] Module '${e.id}' (L${level}) requires '${dep}' ` +
            `(L${depEntry.opts.level}) but it is '${depEntry.health.status}'.`,
          );
        }
      }
    }

    // Topological sort to determine safe boot order within this level
    const sorted = topoSort(levelEntries);

    // Wave-based parallel boot: collect all modules whose same-level deps are
    // already booted, start them in parallel, repeat until all done.
    const booted = new Set<string>();

    while (booted.size < sorted.length) {
      const wave = sorted.filter(e => {
        if (booted.has(e.id)) return false;
        // Ready when every same-level dep has been booted in an earlier wave
        const sameLevelDeps = e.opts.deps.filter(d => {
          const de = this.entries.get(d);
          return de !== undefined && de.opts.level === level;
        });
        return sameLevelDeps.every(d => booted.has(d));
      });

      if (wave.length === 0) {
        // No progress — guard against infinite loop caused by a bad topo sort
        throw new Error(
          '[ModuleRegistry] Boot stalled — unresolved deps in wave. ' +
          `Remaining: ${sorted.filter(e => !booted.has(e.id)).map(e => e.id).join(', ')}`,
        );
      }

      await Promise.all(wave.map(e => this.bootOne(e)));
      wave.forEach(e => booted.add(e.id));
      this.bootOrder.push(...wave.map(e => e.id));
    }
  }

  private async bootOne(entry: ModuleEntry): Promise<void> {
    entry.health.status = 'booting';
    const t0 = Date.now();

    try {
      entry.instance = await entry.factory();
      entry.bootedAt = Date.now();
      entry.health.status = 'healthy';
      entry.health.bootTimeMs = Date.now() - t0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.health.status = 'failed';
      entry.health.error = msg;
      entry.health.bootTimeMs = Date.now() - t0;

      if (entry.opts.optional) {
        log.warn(
          `Optional module '${entry.id}' failed to boot — continuing. ${msg}`,
        );
      } else {
        throw new Error(
          `[ModuleRegistry] Required module '${entry.id}' (L${entry.opts.level}) ` +
          `failed to boot: ${msg}`,
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Retrieval
  // --------------------------------------------------------------------------

  /**
   * Return the booted instance or undefined if not yet booted or failed.
   */
  get<T>(id: string): T | undefined {
    return this.entries.get(id)?.instance as T | undefined;
  }

  /**
   * Return the booted instance or throw if absent.
   *
   * Use this when downstream code cannot proceed without the module.
   */
  require<T>(id: string): T {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`[ModuleRegistry] Module '${id}' is not registered.`);
    }
    if (entry.health.status !== 'healthy') {
      throw new Error(
        `[ModuleRegistry] Module '${id}' is not healthy ` +
        `(status='${entry.health.status}'` +
        (entry.health.error ? `: ${entry.health.error}` : '') + ').',
      );
    }
    return entry.instance as T;
  }

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  /**
   * Shut down all booted modules.
   *
   * Modules with an explicit `shutdownOrder` (> 0) run first, sorted
   * ascending (lower = earlier shutdown). The remaining modules follow in
   * reverse boot-insertion order.
   *
   * If a module exposes a `stop()` or `shutdown()` method it is called.
   * Errors during shutdown are logged but do not abort remaining teardown.
   */
  async shutdown(): Promise<void> {
    const explicit = [...this.entries.values()]
      .filter(e => e.opts.shutdownOrder > 0 && e.health.status === 'healthy')
      .sort((a, b) => a.opts.shutdownOrder - b.opts.shutdownOrder);

    const explicitIds = new Set(explicit.map(e => e.id));

    const implicit = [...this.bootOrder]
      .reverse()
      .map(id => this.entries.get(id))
      .filter((e): e is ModuleEntry =>
        e !== undefined &&
        !explicitIds.has(e.id) &&
        e.health.status === 'healthy',
      );

    const sequence = [...explicit, ...implicit];

    for (const entry of sequence) {
      try {
        const inst = entry.instance as Record<string, unknown>;
        if (typeof inst?.stop === 'function') {
          await (inst.stop as () => Promise<void>)();
        } else if (typeof inst?.shutdown === 'function') {
          await (inst.shutdown as () => Promise<void>)();
        }
        // Reset to allow re-boot if needed
        entry.health.status = 'pending';
        entry.instance = undefined;
        entry.bootedAt = null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(
          `Shutdown error for '${entry.id}': ${msg}`,
        );
        entry.health.status = 'degraded';
      }
    }

    this.bootOrder = [];
  }

  // --------------------------------------------------------------------------
  // Health
  // --------------------------------------------------------------------------

  /**
   * Return a snapshot of health for all registered modules.
   *
   * Callers can filter by level, tags, or status to build dashboards or
   * alerting pipelines.
   */
  health(): ModuleHealth[] {
    return [...this.entries.values()].map(e => ({ ...e.health }));
  }

  /**
   * Return health for a single module, or undefined if not registered.
   */
  healthOf(id: string): ModuleHealth | undefined {
    const e = this.entries.get(id);
    return e ? { ...e.health } : undefined;
  }

  // --------------------------------------------------------------------------
  // Introspection helpers
  // --------------------------------------------------------------------------

  /** All registered module IDs */
  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** Health records for modules matching any of the supplied tags */
  byTag(...tags: string[]): ModuleHealth[] {
    return this.health().filter(h =>
      tags.some(t => h.tags.includes(t)),
    );
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private entriesAtLevel(level: BootLevel): ModuleEntry[] {
    return [...this.entries.values()].filter(e => e.opts.level === level);
  }
}

// ============================================================================
// Process-wide singleton
// ============================================================================

let _registry: ModuleRegistry | null = null;

/** Return the process-wide ModuleRegistry singleton. */
export function getModuleRegistry(): ModuleRegistry {
  if (!_registry) _registry = new ModuleRegistry();
  return _registry;
}

// ============================================================================
// Genesis module registrations
// ============================================================================

/**
 * Register all canonical Genesis modules into the provided registry,
 * organised by boot level.
 *
 * Each factory delegates to the existing singleton getter so that modules
 * which hold internal state (e.g. neuromodulation, nociception) are not
 * reconstructed — the registry manages boot ordering and the health surface.
 *
 * Level assignments mirror the bootL1…bootL4 sequence in genesis.ts:
 *
 *   L1 — autonomic substrate
 *          fek, neuromodulation, nociception, allostasis, daemon,
 *          eventBus, persistence
 *
 *   L2 — reactive layer
 *          brain, memory, worldModel, consciousness
 *
 *   L3 — cognitive layer
 *          thinking, grounding, agents, metacognitive
 *
 *   L4 — executive layer
 *          governance, selfImprovement
 */
export function registerGenesisModules(registry: ModuleRegistry): void {

  // ==========================================================================
  // L1 — Autonomic substrate
  // ==========================================================================

  registry.register(
    'fek',
    async () => {
      const fek = getFreeEnergyKernel();
      fek.start();
      return fek;
    },
    {
      level: 1,
      tags: ['autonomic', 'infrastructure'],
    },
  );

  registry.register(
    'neuromodulation',
    async () => {
      const nm = getNeuromodulationSystem();
      nm.start();
      return nm;
    },
    {
      level: 1,
      tags: ['autonomic', 'bio-inspired'],
    },
  );

  registry.register(
    'nociception',
    async () => getNociceptiveSystem(),
    {
      level: 1,
      tags: ['autonomic', 'bio-inspired'],
    },
  );

  registry.register(
    'allostasis',
    async () => createAllostasisSystem(),
    {
      level: 1,
      tags: ['autonomic', 'bio-inspired'],
    },
  );

  registry.register(
    'daemon',
    async () => {
      const d = getDaemon();
      d.start();
      return d;
    },
    {
      level: 1,
      tags: ['autonomic', 'infrastructure'],
      optional: true,
      // Daemon should shut down late so background tasks can finish flushing
      shutdownOrder: 100,
    },
  );

  registry.register(
    'eventBus',
    async () => getEventBus(),
    {
      level: 1,
      tags: ['infrastructure'],
    },
  );

  registry.register(
    'persistence',
    async () =>
      new StateStore({
        autoSave: true,
        autoSaveIntervalMs: 60_000,
      }),
    {
      level: 1,
      tags: ['infrastructure'],
      optional: true,
    },
  );

  // ==========================================================================
  // L2 — Reactive layer
  // ==========================================================================

  registry.register(
    'brain',
    async () => {
      const brain = getBrain();
      brain.start();
      return brain;
    },
    {
      level: 2,
      deps: ['fek', 'neuromodulation'],
      tags: ['cognitive', 'core'],
    },
  );

  registry.register(
    'memory',
    async () => getMemorySystem(),
    {
      level: 2,
      deps: ['eventBus'],
      tags: ['cognitive', 'infrastructure'],
      optional: true,
    },
  );

  registry.register(
    'worldModel',
    async () => {
      const wm = getWorldModelSystem();
      wm.start();
      return wm;
    },
    {
      level: 2,
      deps: ['fek'],
      tags: ['cognitive', 'predictive'],
      optional: true,
    },
  );

  registry.register(
    'consciousness',
    async () => {
      const cs = getConsciousnessSystem();
      cs.start();
      return cs;
    },
    {
      level: 2,
      deps: ['neuromodulation', 'fek'],
      tags: ['cognitive', 'bio-inspired'],
      optional: true,
    },
  );

  // ==========================================================================
  // L3 — Cognitive layer
  // ==========================================================================

  registry.register(
    'thinking',
    async () => getThinkingEngine(),
    {
      level: 3,
      deps: ['memory'],
      tags: ['cognitive', 'reasoning'],
      optional: true,
    },
  );

  registry.register(
    'grounding',
    async () => getGroundingSystem(),
    {
      level: 3,
      tags: ['cognitive', 'epistemic'],
      optional: true,
    },
  );

  registry.register(
    'agents',
    async () => getAgentPool(),
    {
      level: 3,
      deps: ['brain', 'memory'],
      tags: ['cognitive', 'multi-agent'],
      optional: true,
    },
  );

  registry.register(
    'metacognitive',
    async () => getMetacognitiveController(),
    {
      level: 3,
      deps: ['thinking', 'consciousness'],
      tags: ['cognitive', 'reasoning'],
      optional: true,
    },
  );

  // ==========================================================================
  // L4 — Executive layer
  // ==========================================================================

  registry.register(
    'governance',
    async () => {
      const gov = getGovernanceSystem();
      gov.initialize({
        agentName: 'genesis',
        capabilities: [
          {
            name: 'reasoning',
            description: 'Logical reasoning',
            inputSchema: {},
            outputSchema: {},
          },
          {
            name: 'code_execution',
            description: 'Execute code',
            inputSchema: {},
            outputSchema: {},
          },
          {
            name: 'self_improvement',
            description: 'Self-modify within TCB',
            inputSchema: {},
            outputSchema: {},
          },
          {
            name: 'memory_write',
            description: 'Write to memory',
            inputSchema: {},
            outputSchema: {},
          },
        ],
      });
      return gov;
    },
    {
      level: 4,
      tags: ['executive', 'safety'],
      optional: true,
    },
  );

  registry.register(
    'selfImprovement',
    async () => getSelfImprovementEngine(),
    {
      level: 4,
      deps: ['consciousness', 'brain'],
      tags: ['executive', 'rsi'],
      optional: true,
    },
  );
}
