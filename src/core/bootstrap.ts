/**
 * Genesis v35 — Bootstrap via DI Container
 *
 * Typed service resolution from the DI container.
 * Replaces scattered get*() singleton calls with centralized,
 * dependency-tracked, lifecycle-managed resolution.
 *
 * Usage:
 *   import { bootstrap, resolve } from '../core/bootstrap.js';
 *
 *   // At startup
 *   await bootstrap();
 *
 *   // Anywhere in code
 *   const memory = await resolve('memory');
 *   const bus = await resolve('eventBus');
 */

import { getDIContainer, type DIContainer } from '../di/container.js';

// ============================================================================
// Service Token Map — typed mapping from token string to service type
// ============================================================================

/**
 * Maps DI container tokens to their resolved types.
 * This is the canonical registry of all Genesis services.
 *
 * When adding a new service:
 * 1. Add the token + type here
 * 2. Register the factory in di/container.ts registerCoreServices()
 * 3. Use resolve<ServiceTokenMap['yourToken']>('yourToken')
 */
export interface ServiceTokenMap {
  // Infrastructure
  eventBus: import('../bus/index.js').GenesisEventBus;
  config: any; // TODO: type when config module is typed
  fek: import('../kernel/free-energy-kernel.js').FreeEnergyKernel;
  neuromodulation: import('../neuromodulation/index.js').NeuromodulationSystem;
  nociception: import('../nociception/index.js').NociceptiveSystem;
  allostasis: import('../allostasis/index.js').AllostasisSystem;
  daemon: import('../daemon/index.js').Daemon;

  // Memory & Persistence
  memory: import('../memory/index.js').MemorySystem;
  persistence: any;
  graphRAG: any;

  // Cognition
  brain: import('../brain/index.js').Brain;
  consciousness: import('../consciousness/index.js').ConsciousnessSystem;
  worldModel: import('../world-model/index.js').WorldModelSystem;
  thinking: import('../thinking/index.js').ThinkingEngine;
  metacognitive: import('../reasoning/metacognitive-controller.js').MetacognitiveController;
  grounding: import('../grounding/index.js').GroundingSystem;
  mctsEngine: any;
  outcomeIntegrator: any;

  // Autonomous
  goalSystem: any;
  attentionController: any;
  selfReflection: any;
  governance: import('../governance/index.js').GovernanceSystem;

  // Market & Content
  marketStrategist: any;
  contentOrchestrator: any;
  newsletter: any;
  mcpClient: any;

  // Tools & Agents
  toolRegistry: Map<string, import('../tools/index.js').Tool>;
  agentPool: import('../agents/index.js').AgentPool;

  // Observability
  dashboard: any;

  // Core (v35)
  agentLoop: import('./agent-loop.js').AgentLoop;
}

export type ServiceToken = keyof ServiceTokenMap;

// ============================================================================
// Typed Resolution
// ============================================================================

let bootstrapped = false;

/**
 * Bootstrap the DI container: validate dependency graph and
 * initialize eager (non-lazy) services.
 *
 * Call once at startup. Safe to call multiple times (idempotent).
 */
export async function bootstrap(): Promise<void> {
  if (bootstrapped) return;

  const container = getDIContainer();
  await container.bootstrap();
  bootstrapped = true;
}

/**
 * Resolve a service by its typed token.
 *
 * @example
 *   const memory = await resolve('memory');
 *   // TypeScript knows: memory is MemorySystem
 */
export async function resolve<K extends ServiceToken>(
  token: K
): Promise<ServiceTokenMap[K]> {
  const container = getDIContainer();
  return container.resolve<ServiceTokenMap[K]>(token);
}

/**
 * Resolve a service synchronously (only works if already resolved).
 * Throws if the service hasn't been resolved yet or factory is async.
 */
export function resolveSync<K extends ServiceToken>(
  token: K
): ServiceTokenMap[K] {
  const container = getDIContainer();
  return container.resolveSync<ServiceTokenMap[K]>(token);
}

/**
 * Check if a service is registered.
 */
export function hasService(token: ServiceToken): boolean {
  return getDIContainer().has(token);
}

/**
 * Check if a service has been resolved (instance exists).
 */
export function isResolved(token: ServiceToken): boolean {
  return getDIContainer().isResolved(token);
}

/**
 * Get all services by tag.
 */
export function getServicesByTag(tag: string): ServiceToken[] {
  return getDIContainer().getByTag(tag) as ServiceToken[];
}

/**
 * Shutdown all services in reverse dependency order.
 */
export async function shutdown(): Promise<void> {
  const container = getDIContainer();
  await container.shutdown();
  bootstrapped = false;
}

/**
 * Get the raw container (escape hatch for advanced use).
 */
export function getContainer(): DIContainer {
  return getDIContainer();
}
