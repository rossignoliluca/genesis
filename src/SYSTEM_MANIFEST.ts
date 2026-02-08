/**
 * Genesis System Manifest
 *
 * Canonical registry of all modules, their status, and boot order.
 * This file serves as the single source of truth for system architecture.
 *
 * @version 33.0.0
 * @updated 2025-02-08
 */

// ============================================================================
// Module Registry
// ============================================================================

export type ModuleStatus = 'active' | 'deprecated' | 'experimental' | 'internal';
export type BootLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'cross-cutting' | 'infrastructure';

export interface ModuleEntry {
  name: string;
  path: string;
  version: string;
  status: ModuleStatus;
  layer: BootLayer;
  description: string;
  dependencies: string[];
  exports: string[];
}

// ============================================================================
// L1: Autonomic Substrate (Core survival systems)
// ============================================================================

export const L1_MODULES: ModuleEntry[] = [
  {
    name: 'kernel',
    path: './kernel',
    version: '13.0.0',
    status: 'active',
    layer: 'L1',
    description: 'Free Energy Kernel - hierarchical state machine, FEK optimization',
    dependencies: ['persistence'],
    exports: ['FreeEnergyKernel', 'getFreeEnergyKernel', 'getFactorGraph'],
  },
  {
    name: 'persistence',
    path: './persistence',
    version: '13.0.0',
    status: 'active',
    layer: 'L1',
    description: 'State storage to disk, recovery mechanisms',
    dependencies: [],
    exports: ['StateStore'],
  },
  {
    name: 'bus',
    path: './bus',
    version: '13.0.0',
    status: 'active',
    layer: 'L1',
    description: 'Central event backbone - pub/sub for all modules',
    dependencies: [],
    exports: ['getEventBus', 'GenesisEventBus'],
  },
  {
    name: 'neuromodulation',
    path: './neuromodulation',
    version: '13.0.0',
    status: 'active',
    layer: 'L1',
    description: 'Dopamine, serotonin, norepinephrine, cortisol modulation',
    dependencies: ['bus'],
    exports: ['getNeuromodulationSystem', 'NeuromodulationSystem'],
  },
  {
    name: 'nociception',
    path: './nociception',
    version: '13.0.0',
    status: 'active',
    layer: 'L1',
    description: 'Pain/damage detection system with gate control',
    dependencies: ['bus'],
    exports: ['getNociceptiveSystem', 'NociceptiveSystem'],
  },
  {
    name: 'allostasis',
    path: './allostasis',
    version: '13.0.0',
    status: 'active',
    layer: 'L1',
    description: 'Predictive regulation, homeostatic setpoint management',
    dependencies: ['neuromodulation', 'nociception'],
    exports: ['createAllostasisSystem', 'AllostasisSystem'],
  },
];

// ============================================================================
// L2: Reactive Systems (Fast responses, memory, economics)
// ============================================================================

export const L2_MODULES: ModuleEntry[] = [
  {
    name: 'memory',
    path: './memory',
    version: '18.3.0',
    status: 'active',
    layer: 'L2',
    description: 'Episodic, semantic, procedural memory with FSRS scheduling',
    dependencies: ['bus', 'persistence'],
    exports: ['getMemorySystem', 'MemorySystem', 'getComponentMemory'],
  },
  {
    name: 'brain',
    path: './brain',
    version: '13.0.0',
    status: 'active',
    layer: 'L2',
    description: 'LangGraph supervisor, cognitive workspace, self-knowledge',
    dependencies: ['memory', 'consciousness'],
    exports: ['getBrain', 'Brain'],
  },
  {
    name: 'economy',
    path: './economy',
    version: '16.0.0',
    status: 'active',
    layer: 'L2',
    description: 'Economic fiber, NESS monitor, bounty orchestrator',
    dependencies: ['bus'],
    exports: ['getEconomicSystem', 'getEconomicFiber', 'getNESSMonitor', 'getBountyOrchestrator'],
  },
  {
    name: 'active-inference',
    path: './active-inference',
    version: '13.0.0',
    status: 'active',
    layer: 'L2',
    description: 'Consciousness bridge, active inference loops',
    dependencies: ['kernel'],
    exports: ['ConsciousnessBridge'],
  },
  {
    name: 'world-model',
    path: './world-model',
    version: '13.0.0',
    status: 'active',
    layer: 'L2',
    description: 'Predictive world model for FEK prediction error',
    dependencies: ['memory'],
    exports: ['getWorldModelSystem', 'WorldModelSystem'],
  },
];

// ============================================================================
// L3: Cognitive Systems (Deep thinking, reasoning, perception)
// ============================================================================

export const L3_MODULES: ModuleEntry[] = [
  {
    name: 'consciousness',
    path: './consciousness',
    version: '13.0.0',
    status: 'active',
    layer: 'L3',
    description: 'IIT 4.0 phi, Global Workspace, attention schema',
    dependencies: [],
    exports: ['getConsciousnessSystem', 'getCentralAwareness', 'ConsciousnessSystem'],
  },
  {
    name: 'causal',
    path: './causal',
    version: '13.0.0',
    status: 'active',
    layer: 'L3',
    description: 'Causal reasoning, counterfactual analysis',
    dependencies: ['memory'],
    exports: ['CausalReasoner', 'createAgentCausalModel'],
  },
  {
    name: 'perception',
    path: './perception',
    version: '13.0.0',
    status: 'active',
    layer: 'L3',
    description: 'Multi-modal perception processing',
    dependencies: ['consciousness'],
    exports: ['createMultiModalPerception', 'MultiModalPerception'],
  },
  {
    name: 'thinking',
    path: './thinking',
    version: '13.0.0',
    status: 'active',
    layer: 'L3',
    description: 'Tree of Thought, Graph of Thought, deep reasoning',
    dependencies: ['memory', 'consciousness'],
    exports: ['getThinkingEngine', 'ThinkingEngine'],
  },
  {
    name: 'reasoning',
    path: './reasoning',
    version: '13.0.0',
    status: 'active',
    layer: 'L3',
    description: 'Metacognitive controller, strategy selection',
    dependencies: ['thinking', 'memory'],
    exports: ['getMetacognitiveController', 'MetacognitiveController'],
  },
  {
    name: 'grounding',
    path: './grounding',
    version: '13.0.0',
    status: 'active',
    layer: 'L3',
    description: 'Epistemic verification, claim grounding',
    dependencies: ['memory'],
    exports: ['getGroundingSystem', 'GroundingSystem'],
  },
];

// ============================================================================
// L4: Executive Systems (Metacognition, autonomy, strategy)
// ============================================================================

export const L4_MODULES: ModuleEntry[] = [
  {
    name: 'metacognition',
    path: './metacognition',
    version: '13.0.0',
    status: 'active',
    layer: 'L4',
    description: 'MUSE system, confidence estimation, thought audit',
    dependencies: ['consciousness', 'memory'],
    exports: ['createMetacognitionSystem', 'MetacognitionSystem'],
  },
  {
    name: 'learning',
    path: './learning',
    version: '13.0.0',
    status: 'active',
    layer: 'L4',
    description: 'Meta-RL learner, curriculum learning',
    dependencies: ['memory'],
    exports: ['createMetaRLLearner', 'MetaRLLearner'],
  },
  {
    name: 'autonomous',
    path: './autonomous',
    version: '32.0.0',
    status: 'active',
    layer: 'L4',
    description: 'Unified autonomous system with 7 sub-engines',
    dependencies: ['economy', 'memory', 'governance'],
    exports: [
      'AutonomousSystem',
      'getDecisionEngine',      // v25.0
      'getStrategyOrchestrator', // v28.0
      'getSelfReflectionEngine', // v29.0
      'getGoalSystem',          // v30.0
      'getAttentionController', // v31.0
      'getSkillAcquisitionSystem', // v32.0
    ],
  },
  {
    name: 'concurrency',
    path: './concurrency',
    version: '33.0.0',
    status: 'active',
    layer: 'L4',
    description: 'Parallel execution engine with work-stealing',
    dependencies: ['bus'],
    exports: ['getParallelEngine', 'ParallelExecutionEngine'],
  },
  {
    name: 'self-modification',
    path: './self-modification',
    version: '13.0.0',
    status: 'active',
    layer: 'L4',
    description: 'Self-improvement engine, code modification',
    dependencies: ['governance', 'memory'],
    exports: ['getSelfImprovementEngine', 'SelfImprovementEngine'],
  },
];

// ============================================================================
// Cross-Cutting Modules (Span multiple layers)
// ============================================================================

export const CROSS_CUTTING_MODULES: ModuleEntry[] = [
  {
    name: 'agents',
    path: './agents',
    version: '13.0.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Multi-agent coordination pool, feeling agent',
    dependencies: ['bus', 'memory'],
    exports: ['getAgentPool', 'createFeelingAgent', 'AgentPool'],
  },
  {
    name: 'governance',
    path: './governance',
    version: '13.0.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Permission gates, HITL, budget enforcement',
    dependencies: ['bus'],
    exports: ['getGovernanceSystem', 'GovernanceSystem'],
  },
  {
    name: 'healing',
    path: './healing',
    version: '13.0.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Error detection and auto-repair',
    dependencies: ['bus', 'memory'],
    exports: ['healing'],
  },
  {
    name: 'integration',
    path: './integration',
    version: '21.0.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Cross-module wiring, cognitive bridge',
    dependencies: ['*'],
    exports: ['bootstrapIntegration', 'wireAllModules', 'getCognitiveBridge'],
  },
  {
    name: 'daemon',
    path: './daemon',
    version: '13.0.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Background daemon for autonomous operation',
    dependencies: ['bus', 'economy'],
    exports: ['getDaemon', 'Daemon'],
  },
];

// ============================================================================
// Infrastructure Modules (APIs, tools, external integrations)
// ============================================================================

export const INFRASTRUCTURE_MODULES: ModuleEntry[] = [
  {
    name: 'api',
    path: './api',
    version: '26.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'REST API (v23.0) + WebSocket (v26.0)',
    dependencies: ['bus'],
    exports: ['getGenesisAPI', 'getGenesisWebSocket'],
  },
  {
    name: 'mcp',
    path: './mcp',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'MCP client manager, tool infrastructure',
    dependencies: [],
    exports: ['getMCPManager', 'MCPClientManager'],
  },
  {
    name: 'streaming',
    path: './streaming',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'LLM streaming orchestration',
    dependencies: [],
    exports: ['createStreamOrchestrator', 'StreamOrchestrator'],
  },
  {
    name: 'pipeline',
    path: './pipeline',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Multi-step orchestration pipelines',
    dependencies: ['streaming'],
    exports: ['createPipelineExecutor', 'PipelineExecutor'],
  },
  {
    name: 'tools',
    path: './tools',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Bash, edit, git execution tools',
    dependencies: [],
    exports: ['getBashTool', 'getEditTool'],
  },
  {
    name: 'execution',
    path: './execution',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Code execution runtime, sandboxing',
    dependencies: ['tools'],
    exports: ['getCodeRuntime', 'CodeRuntime'],
  },
  {
    name: 'subagents',
    path: './subagents',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Subagent execution and coordination',
    dependencies: ['agents'],
    exports: ['getSubagentExecutor', 'SubagentExecutor'],
  },
  {
    name: 'hooks',
    path: './hooks',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Lifecycle hooks for extensibility',
    dependencies: ['bus'],
    exports: ['getHooksManager', 'HooksManager'],
  },
  {
    name: 'sync',
    path: './sync',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'MCP memory sync across instances',
    dependencies: ['memory', 'mcp'],
    exports: ['getMCPMemorySync', 'MCPMemorySync'],
  },
  {
    name: 'observability',
    path: './observability',
    version: '13.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Dashboard, metrics, SSE streaming',
    dependencies: ['bus'],
    exports: ['getDashboard', 'broadcastToDashboard'],
  },
];

// ============================================================================
// Domain Modules (Finance, content, revenue, etc.)
// ============================================================================

export const DOMAIN_MODULES: ModuleEntry[] = [
  {
    name: 'finance',
    path: './finance',
    version: '13.12.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Market data, signals, risk, portfolio, Polymarket',
    dependencies: ['bus', 'economy'],
    exports: ['createFinanceModule', 'createPolymarketTrader'],
  },
  {
    name: 'revenue',
    path: './revenue',
    version: '13.12.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Autonomous revenue streams (bounty, MCP, content, yield)',
    dependencies: ['economy', 'payments'],
    exports: ['createRevenueSystem', 'getRevenueActivation'],
  },
  {
    name: 'payments',
    path: './payments',
    version: '16.0.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Stripe, x402 micropayments, revenue tracking',
    dependencies: [],
    exports: ['getPaymentService', 'getRevenueTracker'],
  },
  {
    name: 'content',
    path: './content',
    version: '18.1.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Multi-platform content creator, SEO, scheduling',
    dependencies: ['bus', 'memory'],
    exports: ['getContentOrchestrator', 'getContentScheduler', 'getAnalyticsAggregator'],
  },
  {
    name: 'market-strategist',
    path: './market-strategist',
    version: '18.2.0',
    status: 'active',
    layer: 'cross-cutting',
    description: 'Weekly market strategy brief generation',
    dependencies: ['finance', 'content'],
    exports: ['getMarketStrategist', 'generateWeeklyBrief'],
  },
  {
    name: 'mcp-finance',
    path: './mcp-finance',
    version: '13.12.0',
    status: 'active',
    layer: 'infrastructure',
    description: 'Unified financial MCP servers interface',
    dependencies: ['mcp'],
    exports: ['getMCPFinanceManager', 'MCPFinanceManager'],
  },
];

// ============================================================================
// Exotic/Experimental Modules
// ============================================================================

export const EXOTIC_MODULES: ModuleEntry[] = [
  {
    name: 'exotic',
    path: './exotic',
    version: '14.2.0',
    status: 'active',
    layer: 'L4',
    description: 'Thermodynamic, hyperdimensional, reservoir computing',
    dependencies: [],
    exports: ['createExoticComputing', 'ExoticComputing'],
  },
  {
    name: 'strange-loop',
    path: './strange-loop',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L4',
    description: 'Hofstadter strange loops, self-reference',
    dependencies: ['consciousness'],
    exports: ['createStrangeLoop'],
  },
  {
    name: 'morphogenetic',
    path: './morphogenetic',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L4',
    description: 'Morphogenetic fields, developmental patterns',
    dependencies: [],
    exports: ['createMorphogeneticField'],
  },
  {
    name: 'autopoiesis',
    path: './autopoiesis',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L4',
    description: 'Self-organization, autopoietic systems',
    dependencies: [],
    exports: ['createAutopoieticSystem'],
  },
  {
    name: 'semiotics',
    path: './semiotics',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L3',
    description: 'Semiotic sign processing, Peircean triads',
    dependencies: ['memory'],
    exports: ['createSemioticProcessor'],
  },
  {
    name: 'umwelt',
    path: './umwelt',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L3',
    description: 'Agent-specific world modeling (Uexküll)',
    dependencies: ['perception'],
    exports: ['createUmwelt'],
  },
  {
    name: 'second-order',
    path: './second-order',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L4',
    description: 'Second-order cybernetics, observer systems',
    dependencies: ['consciousness'],
    exports: ['createSecondOrderObserver'],
  },
  {
    name: 'rsi',
    path: './rsi',
    version: '14.0.0',
    status: 'experimental',
    layer: 'L4',
    description: 'Recursive self-improvement mechanisms',
    dependencies: ['self-modification'],
    exports: ['createRSIEngine'],
  },
  {
    name: 'swarm',
    path: './swarm',
    version: '14.0.0',
    status: 'experimental',
    layer: 'cross-cutting',
    description: 'Swarm intelligence, collective behavior',
    dependencies: ['agents'],
    exports: ['createSwarmCoordinator'],
  },
  {
    name: 'symbiotic',
    path: './symbiotic',
    version: '14.0.0',
    status: 'experimental',
    layer: 'cross-cutting',
    description: 'Human-AI symbiotic interaction patterns',
    dependencies: ['consciousness'],
    exports: ['createSymbioticInterface'],
  },
];

// ============================================================================
// Deprecated Modules (To be removed in future versions)
// ============================================================================

export const DEPRECATED_MODULES: ModuleEntry[] = [
  {
    name: 'cli',
    path: './cli',
    version: '0.0.0',
    status: 'deprecated',
    layer: 'infrastructure',
    description: 'DEPRECATED: Use api/ instead',
    dependencies: [],
    exports: [],
  },
  {
    name: 'organism',
    path: './organism',
    version: '0.0.0',
    status: 'deprecated',
    layer: 'cross-cutting',
    description: 'DEPRECATED: Replaced by agents/',
    dependencies: [],
    exports: [],
  },
  {
    name: 'lifecycle',
    path: './lifecycle',
    version: '0.0.0',
    status: 'deprecated',
    layer: 'infrastructure',
    description: 'DEPRECATED: Use hooks/ instead',
    dependencies: [],
    exports: [],
  },
  {
    name: 'llm',
    path: './llm',
    version: '0.0.0',
    status: 'deprecated',
    layer: 'infrastructure',
    description: 'DEPRECATED: Use streaming/ instead',
    dependencies: [],
    exports: [],
  },
];

// ============================================================================
// Internal Modules (Used by other modules, not directly by genesis.ts)
// ============================================================================

export const INTERNAL_MODULES: ModuleEntry[] = [
  {
    name: 'embeddings',
    path: './embeddings',
    version: '13.0.0',
    status: 'internal',
    layer: 'infrastructure',
    description: 'INTERNAL: Used by memory/ for vector embeddings',
    dependencies: [],
    exports: ['createEmbedder'],
  },
  {
    name: 'memory-production',
    path: './memory-production',
    version: '13.0.0',
    status: 'internal',
    layer: 'L2',
    description: 'INTERNAL: Used by autonomous/ for production memory',
    dependencies: ['memory'],
    exports: ['getProductionMemory'],
  },
  {
    name: 'dashboard',
    path: './dashboard',
    version: '13.0.0',
    status: 'internal',
    layer: 'infrastructure',
    description: 'INTERNAL: Used by observability/',
    dependencies: [],
    exports: ['createDashboard'],
  },
  {
    name: 'epistemic',
    path: './epistemic',
    version: '13.0.0',
    status: 'internal',
    layer: 'L3',
    description: 'INTERNAL: Epistemic verification utilities',
    dependencies: [],
    exports: ['sanitizeResponse', 'checkResponse'],
  },
  {
    name: 'uncertainty',
    path: './uncertainty',
    version: '13.0.0',
    status: 'internal',
    layer: 'L3',
    description: 'INTERNAL: Conformal prediction intervals',
    dependencies: [],
    exports: ['createAdaptiveConformal'],
  },
];

// ============================================================================
// Complete Module Registry
// ============================================================================

export const ALL_MODULES: ModuleEntry[] = [
  ...L1_MODULES,
  ...L2_MODULES,
  ...L3_MODULES,
  ...L4_MODULES,
  ...CROSS_CUTTING_MODULES,
  ...INFRASTRUCTURE_MODULES,
  ...DOMAIN_MODULES,
  ...EXOTIC_MODULES,
  ...INTERNAL_MODULES,
  ...DEPRECATED_MODULES,
];

// ============================================================================
// Boot Order
// ============================================================================

export const BOOT_ORDER = {
  L1: ['persistence', 'bus', 'kernel', 'neuromodulation', 'nociception', 'allostasis'],
  L2: ['memory', 'brain', 'economy', 'active-inference', 'world-model'],
  L3: ['consciousness', 'causal', 'perception', 'thinking', 'reasoning', 'grounding'],
  L4: ['metacognition', 'learning', 'autonomous', 'concurrency', 'self-modification'],
};

// ============================================================================
// System Statistics
// ============================================================================

export const SYSTEM_STATS = {
  version: '33.0.0',
  totalModules: ALL_MODULES.length,
  activeModules: ALL_MODULES.filter(m => m.status === 'active').length,
  experimentalModules: ALL_MODULES.filter(m => m.status === 'experimental').length,
  deprecatedModules: ALL_MODULES.filter(m => m.status === 'deprecated').length,
  internalModules: ALL_MODULES.filter(m => m.status === 'internal').length,
  byLayer: {
    L1: L1_MODULES.length,
    L2: L2_MODULES.length,
    L3: L3_MODULES.length,
    L4: L4_MODULES.length,
    crossCutting: CROSS_CUTTING_MODULES.length,
    infrastructure: INFRASTRUCTURE_MODULES.length,
    domain: DOMAIN_MODULES.length,
    exotic: EXOTIC_MODULES.length,
  },
};

// ============================================================================
// Validation Helper
// ============================================================================

export function validateModuleRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const names = new Set<string>();

  for (const module of ALL_MODULES) {
    // Check for duplicate names
    if (names.has(module.name)) {
      errors.push(`Duplicate module name: ${module.name}`);
    }
    names.add(module.name);

    // Check for missing exports
    if (module.status === 'active' && module.exports.length === 0) {
      errors.push(`Active module has no exports: ${module.name}`);
    }

    // Check dependencies exist
    for (const dep of module.dependencies) {
      if (dep !== '*' && !names.has(dep) && !ALL_MODULES.some(m => m.name === dep)) {
        // Dependency might be defined later, check full list
        const exists = ALL_MODULES.some(m => m.name === dep);
        if (!exists) {
          errors.push(`Module ${module.name} depends on unknown module: ${dep}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export default {
  ALL_MODULES,
  BOOT_ORDER,
  SYSTEM_STATS,
  validateModuleRegistry,
};
