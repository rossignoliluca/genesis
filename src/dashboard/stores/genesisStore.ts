import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface ConsciousnessState {
  phi: number;
  state: 'awake' | 'focused' | 'vigilant' | 'dreaming' | 'dormant';
  integration: number;
  complexity: number;
  trend: 'up' | 'down' | 'stable';
}

export interface NeuromodState {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  cortisol: number;
}

export interface KernelState {
  mode: string;
  level: number;
  freeEnergy: number;
  predictionError: number;
  levels: {
    l1: { active: boolean; load: number };
    l2: { active: boolean; load: number };
    l3: { active: boolean; load: number };
    l4: { active: boolean; load: number };
  };
}

export interface AgentState {
  total: number;
  active: number;
  queued: number;
  providers: string[];
}

export interface EconomyState {
  cash: number;
  revenue: number;
  costs: number;
  runway: number;
  ness: number;
  isReal: boolean; // True when connected to real LLM cost tracking
  totalCosts?: number; // Total costs over period
  totalRevenue?: number; // Total revenue over period
}

export interface MemoryState {
  episodic: number;
  semantic: number;
  procedural: number;
  consolidationProgress: number;
}

// ============================================================================
// Self-Improvement Types
// ============================================================================

export type ImprovementStage = 'idle' | 'observe' | 'reflect' | 'propose' | 'apply' | 'verify';

export interface ModificationProposal {
  id: string;
  category: 'performance' | 'consciousness' | 'memory' | 'reliability' | 'capability';
  target: string;
  change: string;
  reason: string;
  expected: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reversible: boolean;
}

export interface SandboxStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  progress?: number;
}

export interface InvariantResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
}

export interface ModificationRecord {
  id: string;
  timestamp: number;
  description: string;
  status: 'success' | 'failed' | 'rolled_back';
  metrics?: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  commitHash?: string;
  rollbackHash?: string;
  reason?: string;
}

export interface Lesson {
  id: string;
  content: string;
  type: 'positive' | 'negative';
  confidence: number;
  appliedCount: number;
  lastApplied?: number;
  retention: number;
  category: 'performance' | 'memory' | 'errors' | 'phi' | 'agents';
}

export interface CodeQuery {
  query: string;
  results: number;
  timestamp: number;
  file?: string;
}

// ============================================================================
// Active Inference Types
// ============================================================================

export interface ActiveInferenceState {
  currentCycle: number;
  beliefs: Record<string, string>;
  selectedAction: string | null;
  lastSurprise: number;
  avgSurprise: number;
  isRunning: boolean;
  surpriseHistory: Array<{ value: number; timestamp: number }>;
}

// ============================================================================
// Nociception (Pain) Types
// ============================================================================

export interface PainStimulus {
  id: string;
  location: string;
  intensity: number;
  type: 'acute' | 'chronic' | 'phantom';
  timestamp: number;
}

export interface NociceptionState {
  totalPain: number;
  threshold: number;
  adaptation: number;
  activeStimuli: PainStimulus[];
  painHistory: Array<{ value: number; timestamp: number }>;
}

// ============================================================================
// Allostasis Types
// ============================================================================

export interface AllostasisVariable {
  name: string;
  current: number;
  setpoint: number;
  urgency: number;
  action?: string;
}

export interface AllostasisState {
  variables: AllostasisVariable[];
  isThrottled: boolean;
  throttleMagnitude: number;
  isHibernating: boolean;
  hibernationDuration: number;
  deferredVariables: string[];
}

// ============================================================================
// World Model Types
// ============================================================================

export interface WorldPrediction {
  id: string;
  domain: string;
  prediction: string;
  confidence: number;
  timestamp: number;
  verified?: boolean;
}

export interface ConsistencyViolation {
  id: string;
  claim: string;
  conflictsWith: string;
  resolution: string;
  timestamp: number;
}

export interface WorldModelState {
  totalFacts: number;
  predictions: WorldPrediction[];
  violations: ConsistencyViolation[];
  causalChainsActive: number;
}

// ============================================================================
// Daemon Types
// ============================================================================

export interface DaemonTask {
  id: string;
  name: string;
  status: 'scheduled' | 'started' | 'completed' | 'failed' | 'cancelled';
  priority: 'critical' | 'high' | 'normal' | 'low' | 'idle';
  scheduledFor?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface DaemonState {
  state: 'stopped' | 'starting' | 'running' | 'dreaming' | 'maintaining' | 'stopping' | 'error';
  previousState?: string;
  tasks: DaemonTask[];
  dreamPhase: string | null;
  dreamConsolidations: number;
  dreamInsights: number;
  lastMaintenance: number | null;
  maintenanceIssues: number;
  maintenanceFixed: number;
}

// ============================================================================
// Finance Types
// ============================================================================

export interface FinancePosition {
  symbol: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  direction: 'long' | 'short';
  openedAt: number;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  uncertainty: number;
  action: 'buy' | 'sell' | 'hold';
  timestamp: number;
}

export interface FinanceState {
  totalPortfolioValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  positions: FinancePosition[];
  signals: TradingSignal[];
  regime: string;
  riskLevel: number;
  drawdown: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
}

// ============================================================================
// Revenue Types
// ============================================================================

export interface RevenueOpportunity {
  id: string;
  stream: string;
  estimatedRevenue: number;
  estimatedCost: number;
  roi: number;
  risk: number;
  timestamp: number;
}

export interface RevenueTask {
  id: string;
  stream: string;
  success: boolean;
  actualRevenue: number;
  actualCost: number;
  timestamp: number;
}

export interface RevenueStream {
  name: string;
  status: 'active' | 'paused' | 'error';
  totalEarned: number;
  successRate: number;
  taskCount: number;
}

export interface RevenueState {
  totalEarned: number;
  streams: RevenueStream[];
  opportunities: RevenueOpportunity[];
  recentTasks: RevenueTask[];
  avgROI: number;
}

// ============================================================================
// Content Types
// ============================================================================

export interface ContentItem {
  id: string;
  type: 'article' | 'thread' | 'post' | 'newsletter' | 'tutorial' | 'announcement';
  topic: string;
  platforms: string[];
  status: 'draft' | 'scheduled' | 'published';
  scheduledFor?: number;
  publishedAt?: number;
  engagementRate?: number;
}

export interface ContentInsight {
  id: string;
  type: 'best_platform' | 'optimal_time' | 'trending_topic' | 'performance_alert';
  platform?: string;
  recommendation: string;
  confidence: number;
  timestamp: number;
}

export interface ContentState {
  totalPublished: number;
  totalScheduled: number;
  avgEngagementRate: number;
  topPlatform: string | null;
  content: ContentItem[];
  insights: ContentInsight[];
}

// ============================================================================
// Swarm Types
// ============================================================================

export interface EmergentPattern {
  id: string;
  pattern: string;
  agents: string[];
  confidence: number;
  timestamp: number;
}

export interface SwarmState {
  agentCount: number;
  activeCoordinations: number;
  patterns: EmergentPattern[];
  collectiveIntelligence: number;
  consensusLevel: number;
}

// ============================================================================
// Healing Types
// ============================================================================

export interface HealingEvent {
  id: string;
  target: string;
  status: 'started' | 'completed' | 'failed';
  issuesFixed: number;
  timestamp: number;
}

export interface HealingState {
  isActive: boolean;
  currentTarget: string | null;
  issuesDetected: number;
  issuesRepaired: number;
  history: HealingEvent[];
}

// ============================================================================
// Grounding Types
// ============================================================================

export interface VerifiedClaim {
  id: string;
  claim: string;
  verified: boolean;
  confidence: number;
  source?: string;
  timestamp: number;
}

export interface GroundingState {
  claimsVerified: number;
  claimsPending: number;
  factAccuracy: number;
  recentClaims: VerifiedClaim[];
}

export interface SelfImprovementState {
  // Cycle state
  currentStage: ImprovementStage;
  cycleEnabled: boolean;
  currentProposal: ModificationProposal | null;

  // Metrics
  phi: number;
  errorRate: number;
  memoryReuse: number;
  responseTime: number;

  // Sandbox state
  sandboxPath: string | null;
  sandboxProgress: SandboxStep[];
  invariantResults: InvariantResult[];
  buildOutput: string[];

  // History
  modifications: ModificationRecord[];

  // Learning
  lessons: Lesson[];
  successRate: number;
  totalAttempts: number;

  // Code understanding
  moduleUnderstanding: Record<string, number>;
  recentQueries: CodeQuery[];
  analyzingFile: string | null;
  analyzingProgress: number;
}

export interface GenesisState {
  connected: boolean;
  lastUpdate: number;
  consciousness: ConsciousnessState;
  neuromod: NeuromodState;
  kernel: KernelState;
  agents: AgentState;
  economy: EconomyState;
  memory: MemoryState;
  selfImprovement: SelfImprovementState;
  activeInference: ActiveInferenceState;
  nociception: NociceptionState;
  allostasis: AllostasisState;
  worldModel: WorldModelState;
  daemon: DaemonState;
  finance: FinanceState;
  revenue: RevenueState;
  content: ContentState;
  swarm: SwarmState;
  healing: HealingState;
  grounding: GroundingState;
  events: Array<{ id: string; type: string; timestamp: number; data: unknown }>;
}

interface GenesisStore extends GenesisState {
  // Actions
  setConnected: (connected: boolean) => void;
  updateState: (partial: Partial<GenesisState>) => void;
  updateConsciousness: (consciousness: Partial<ConsciousnessState>) => void;
  updateNeuromod: (neuromod: Partial<NeuromodState>) => void;
  updateKernel: (kernel: Partial<KernelState>) => void;
  updateAgents: (agents: Partial<AgentState>) => void;
  updateEconomy: (economy: Partial<EconomyState>) => void;
  updateMemory: (memory: Partial<MemoryState>) => void;
  updateSelfImprovement: (selfImprovement: Partial<SelfImprovementState>) => void;
  updateActiveInference: (activeInference: Partial<ActiveInferenceState>) => void;
  updateNociception: (nociception: Partial<NociceptionState>) => void;
  updateAllostasis: (allostasis: Partial<AllostasisState>) => void;
  updateWorldModel: (worldModel: Partial<WorldModelState>) => void;
  updateDaemon: (daemon: Partial<DaemonState>) => void;
  updateFinance: (finance: Partial<FinanceState>) => void;
  updateRevenue: (revenue: Partial<RevenueState>) => void;
  updateContent: (content: Partial<ContentState>) => void;
  updateSwarm: (swarm: Partial<SwarmState>) => void;
  updateHealing: (healing: Partial<HealingState>) => void;
  updateGrounding: (grounding: Partial<GroundingState>) => void;
  addModification: (modification: ModificationRecord) => void;
  addLesson: (lesson: Lesson) => void;
  addCodeQuery: (query: CodeQuery) => void;
  addBuildOutput: (line: string) => void;
  addPainStimulus: (stimulus: PainStimulus) => void;
  addWorldPrediction: (prediction: WorldPrediction) => void;
  addConsistencyViolation: (violation: ConsistencyViolation) => void;
  addDaemonTask: (task: DaemonTask) => void;
  addFinancePosition: (position: FinancePosition) => void;
  addTradingSignal: (signal: TradingSignal) => void;
  addRevenueOpportunity: (opportunity: RevenueOpportunity) => void;
  addContentItem: (item: ContentItem) => void;
  addContentInsight: (insight: ContentInsight) => void;
  addEmergentPattern: (pattern: EmergentPattern) => void;
  addHealingEvent: (event: HealingEvent) => void;
  addVerifiedClaim: (claim: VerifiedClaim) => void;
  addEvent: (event: { type: string; data: unknown }) => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialSelfImprovementState: SelfImprovementState = {
  currentStage: 'idle',
  cycleEnabled: false,
  currentProposal: null,
  phi: 0.5,
  errorRate: 0.05,
  memoryReuse: 0.5,
  responseTime: 100,
  sandboxPath: null,
  sandboxProgress: [],
  invariantResults: [],
  buildOutput: [],
  modifications: [],
  lessons: [],
  successRate: 0,
  totalAttempts: 0,
  moduleUnderstanding: {
    kernel: 0.85,
    memory: 0.72,
    agents: 0.68,
    mcp: 0.45,
    tools: 0.90,
  },
  recentQueries: [],
  analyzingFile: null,
  analyzingProgress: 0,
};

const initialActiveInferenceState: ActiveInferenceState = {
  currentCycle: 0,
  beliefs: {},
  selectedAction: null,
  lastSurprise: 0,
  avgSurprise: 0,
  isRunning: false,
  surpriseHistory: [],
};

const initialNociceptionState: NociceptionState = {
  totalPain: 0,
  threshold: 0.7,
  adaptation: 0,
  activeStimuli: [],
  painHistory: [],
};

const initialAllostasisState: AllostasisState = {
  variables: [
    { name: 'energy', current: 0.8, setpoint: 0.7, urgency: 0.1 },
    { name: 'memory', current: 0.6, setpoint: 0.5, urgency: 0.2 },
    { name: 'attention', current: 0.7, setpoint: 0.6, urgency: 0.15 },
  ],
  isThrottled: false,
  throttleMagnitude: 0,
  isHibernating: false,
  hibernationDuration: 0,
  deferredVariables: [],
};

const initialWorldModelState: WorldModelState = {
  totalFacts: 0,
  predictions: [],
  violations: [],
  causalChainsActive: 0,
};

const initialDaemonState: DaemonState = {
  state: 'stopped',
  previousState: undefined,
  tasks: [],
  dreamPhase: null,
  dreamConsolidations: 0,
  dreamInsights: 0,
  lastMaintenance: null,
  maintenanceIssues: 0,
  maintenanceFixed: 0,
};

const initialFinanceState: FinanceState = {
  totalPortfolioValue: 0,
  unrealizedPnL: 0,
  realizedPnL: 0,
  positions: [],
  signals: [],
  regime: 'neutral',
  riskLevel: 0.5,
  drawdown: 0,
  maxDrawdown: 0,
  winRate: 0,
  sharpeRatio: 0,
};

const initialRevenueState: RevenueState = {
  totalEarned: 0,
  streams: [],
  opportunities: [],
  recentTasks: [],
  avgROI: 0,
};

const initialContentState: ContentState = {
  totalPublished: 0,
  totalScheduled: 0,
  avgEngagementRate: 0,
  topPlatform: null,
  content: [],
  insights: [],
};

const initialSwarmState: SwarmState = {
  agentCount: 0,
  activeCoordinations: 0,
  patterns: [],
  collectiveIntelligence: 0,
  consensusLevel: 0,
};

const initialHealingState: HealingState = {
  isActive: false,
  currentTarget: null,
  issuesDetected: 0,
  issuesRepaired: 0,
  history: [],
};

const initialGroundingState: GroundingState = {
  claimsVerified: 0,
  claimsPending: 0,
  factAccuracy: 0,
  recentClaims: [],
};

const initialState: GenesisState = {
  connected: false,
  lastUpdate: 0,
  consciousness: {
    phi: 0.5,
    state: 'awake',
    integration: 0.5,
    complexity: 0.6,
    trend: 'stable',
  },
  neuromod: {
    dopamine: 0.5,
    serotonin: 0.5,
    norepinephrine: 0.3,
    cortisol: 0.2,
  },
  kernel: {
    mode: 'awake',
    level: 2,
    freeEnergy: 1.0,
    predictionError: 0.1,
    levels: {
      l1: { active: true, load: 0.3 },
      l2: { active: true, load: 0.4 },
      l3: { active: true, load: 0.5 },
      l4: { active: true, load: 0.2 },
    },
  },
  agents: {
    total: 10,
    active: 3,
    queued: 2,
    providers: ['anthropic', 'openai'],
  },
  economy: {
    cash: 10000,
    revenue: 500,
    costs: 300,
    runway: 50,
    ness: 0.7,
    isReal: false,
  },
  memory: {
    episodic: 1000,
    semantic: 500,
    procedural: 100,
    consolidationProgress: 0,
  },
  selfImprovement: initialSelfImprovementState,
  activeInference: initialActiveInferenceState,
  nociception: initialNociceptionState,
  allostasis: initialAllostasisState,
  worldModel: initialWorldModelState,
  daemon: initialDaemonState,
  finance: initialFinanceState,
  revenue: initialRevenueState,
  content: initialContentState,
  swarm: initialSwarmState,
  healing: initialHealingState,
  grounding: initialGroundingState,
  events: [],
};

// ============================================================================
// Store
// ============================================================================

export const useGenesisStore = create<GenesisStore>((set) => ({
  ...initialState,

  setConnected: (connected) =>
    set({ connected, lastUpdate: Date.now() }),

  updateState: (partial) =>
    set((state) => ({ ...state, ...partial, lastUpdate: Date.now() })),

  updateConsciousness: (consciousness) =>
    set((state) => ({
      consciousness: { ...state.consciousness, ...consciousness },
      lastUpdate: Date.now(),
    })),

  updateNeuromod: (neuromod) =>
    set((state) => ({
      neuromod: { ...state.neuromod, ...neuromod },
      lastUpdate: Date.now(),
    })),

  updateKernel: (kernel) =>
    set((state) => ({
      kernel: { ...state.kernel, ...kernel },
      lastUpdate: Date.now(),
    })),

  updateAgents: (agents) =>
    set((state) => ({
      agents: { ...state.agents, ...agents },
      lastUpdate: Date.now(),
    })),

  updateEconomy: (economy) =>
    set((state) => ({
      economy: { ...state.economy, ...economy },
      lastUpdate: Date.now(),
    })),

  updateMemory: (memory) =>
    set((state) => ({
      memory: { ...state.memory, ...memory },
      lastUpdate: Date.now(),
    })),

  updateSelfImprovement: (selfImprovement) =>
    set((state) => ({
      selfImprovement: { ...state.selfImprovement, ...selfImprovement },
      lastUpdate: Date.now(),
    })),

  updateActiveInference: (activeInference) =>
    set((state) => ({
      activeInference: { ...state.activeInference, ...activeInference },
      lastUpdate: Date.now(),
    })),

  updateNociception: (nociception) =>
    set((state) => ({
      nociception: { ...state.nociception, ...nociception },
      lastUpdate: Date.now(),
    })),

  updateAllostasis: (allostasis) =>
    set((state) => ({
      allostasis: { ...state.allostasis, ...allostasis },
      lastUpdate: Date.now(),
    })),

  updateWorldModel: (worldModel) =>
    set((state) => ({
      worldModel: { ...state.worldModel, ...worldModel },
      lastUpdate: Date.now(),
    })),

  updateDaemon: (daemon) =>
    set((state) => ({
      daemon: { ...state.daemon, ...daemon },
      lastUpdate: Date.now(),
    })),

  updateFinance: (finance) =>
    set((state) => ({
      finance: { ...state.finance, ...finance },
      lastUpdate: Date.now(),
    })),

  updateRevenue: (revenue) =>
    set((state) => ({
      revenue: { ...state.revenue, ...revenue },
      lastUpdate: Date.now(),
    })),

  updateContent: (content) =>
    set((state) => ({
      content: { ...state.content, ...content },
      lastUpdate: Date.now(),
    })),

  updateSwarm: (swarm) =>
    set((state) => ({
      swarm: { ...state.swarm, ...swarm },
      lastUpdate: Date.now(),
    })),

  updateHealing: (healing) =>
    set((state) => ({
      healing: { ...state.healing, ...healing },
      lastUpdate: Date.now(),
    })),

  updateGrounding: (grounding) =>
    set((state) => ({
      grounding: { ...state.grounding, ...grounding },
      lastUpdate: Date.now(),
    })),

  addModification: (modification) =>
    set((state) => ({
      selfImprovement: {
        ...state.selfImprovement,
        modifications: [modification, ...state.selfImprovement.modifications.slice(0, 99)],
        totalAttempts: state.selfImprovement.totalAttempts + 1,
        successRate: modification.status === 'success'
          ? ((state.selfImprovement.successRate * state.selfImprovement.totalAttempts) + 1) / (state.selfImprovement.totalAttempts + 1)
          : (state.selfImprovement.successRate * state.selfImprovement.totalAttempts) / (state.selfImprovement.totalAttempts + 1),
      },
      lastUpdate: Date.now(),
    })),

  addLesson: (lesson) =>
    set((state) => ({
      selfImprovement: {
        ...state.selfImprovement,
        lessons: [lesson, ...state.selfImprovement.lessons.slice(0, 99)],
      },
      lastUpdate: Date.now(),
    })),

  addCodeQuery: (query) =>
    set((state) => ({
      selfImprovement: {
        ...state.selfImprovement,
        recentQueries: [query, ...state.selfImprovement.recentQueries.slice(0, 19)],
      },
      lastUpdate: Date.now(),
    })),

  addBuildOutput: (line) =>
    set((state) => ({
      selfImprovement: {
        ...state.selfImprovement,
        buildOutput: [...state.selfImprovement.buildOutput.slice(-49), line],
      },
      lastUpdate: Date.now(),
    })),

  addPainStimulus: (stimulus) =>
    set((state) => ({
      nociception: {
        ...state.nociception,
        activeStimuli: [stimulus, ...state.nociception.activeStimuli.slice(0, 19)],
        painHistory: [
          { value: state.nociception.totalPain, timestamp: Date.now() },
          ...state.nociception.painHistory.slice(0, 99),
        ],
      },
      lastUpdate: Date.now(),
    })),

  addWorldPrediction: (prediction) =>
    set((state) => ({
      worldModel: {
        ...state.worldModel,
        predictions: [prediction, ...state.worldModel.predictions.slice(0, 49)],
      },
      lastUpdate: Date.now(),
    })),

  addConsistencyViolation: (violation) =>
    set((state) => ({
      worldModel: {
        ...state.worldModel,
        violations: [violation, ...state.worldModel.violations.slice(0, 49)],
      },
      lastUpdate: Date.now(),
    })),

  addDaemonTask: (task) =>
    set((state) => ({
      daemon: {
        ...state.daemon,
        tasks: [task, ...state.daemon.tasks.slice(0, 99)],
      },
      lastUpdate: Date.now(),
    })),

  addFinancePosition: (position) =>
    set((state) => ({
      finance: {
        ...state.finance,
        positions: [...state.finance.positions.filter(p => p.symbol !== position.symbol), position],
      },
      lastUpdate: Date.now(),
    })),

  addTradingSignal: (signal) =>
    set((state) => ({
      finance: {
        ...state.finance,
        signals: [signal, ...state.finance.signals.slice(0, 49)],
      },
      lastUpdate: Date.now(),
    })),

  addRevenueOpportunity: (opportunity) =>
    set((state) => ({
      revenue: {
        ...state.revenue,
        opportunities: [opportunity, ...state.revenue.opportunities.slice(0, 49)],
      },
      lastUpdate: Date.now(),
    })),

  addContentItem: (item) =>
    set((state) => ({
      content: {
        ...state.content,
        content: [item, ...state.content.content.slice(0, 99)],
      },
      lastUpdate: Date.now(),
    })),

  addContentInsight: (insight) =>
    set((state) => ({
      content: {
        ...state.content,
        insights: [insight, ...state.content.insights.slice(0, 19)],
      },
      lastUpdate: Date.now(),
    })),

  addEmergentPattern: (pattern) =>
    set((state) => ({
      swarm: {
        ...state.swarm,
        patterns: [pattern, ...state.swarm.patterns.slice(0, 19)],
      },
      lastUpdate: Date.now(),
    })),

  addHealingEvent: (event) =>
    set((state) => ({
      healing: {
        ...state.healing,
        history: [event, ...state.healing.history.slice(0, 49)],
      },
      lastUpdate: Date.now(),
    })),

  addVerifiedClaim: (claim) =>
    set((state) => ({
      grounding: {
        ...state.grounding,
        recentClaims: [claim, ...state.grounding.recentClaims.slice(0, 49)],
        claimsVerified: state.grounding.claimsVerified + (claim.verified ? 1 : 0),
      },
      lastUpdate: Date.now(),
    })),

  addEvent: (event) =>
    set((state) => ({
      events: [
        { ...event, id: crypto.randomUUID(), timestamp: Date.now() },
        ...state.events.slice(0, 99), // Keep last 100 events
      ],
      lastUpdate: Date.now(),
    })),

  reset: () => set(initialState),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectPhi = (state: GenesisStore) => state.consciousness.phi;
export const selectNeuromod = (state: GenesisStore) => state.neuromod;
export const selectKernel = (state: GenesisStore) => state.kernel;
export const selectAgents = (state: GenesisStore) => state.agents;
export const selectEconomy = (state: GenesisStore) => state.economy;
export const selectConnected = (state: GenesisStore) => state.connected;
export const selectSelfImprovement = (state: GenesisStore) => state.selfImprovement;
export const selectCurrentStage = (state: GenesisStore) => state.selfImprovement.currentStage;
export const selectModifications = (state: GenesisStore) => state.selfImprovement.modifications;
export const selectLessons = (state: GenesisStore) => state.selfImprovement.lessons;
export const selectActiveInference = (state: GenesisStore) => state.activeInference;
export const selectNociception = (state: GenesisStore) => state.nociception;
export const selectAllostasis = (state: GenesisStore) => state.allostasis;
export const selectWorldModel = (state: GenesisStore) => state.worldModel;
export const selectDaemon = (state: GenesisStore) => state.daemon;
export const selectFinance = (state: GenesisStore) => state.finance;
export const selectRevenue = (state: GenesisStore) => state.revenue;
export const selectContent = (state: GenesisStore) => state.content;
export const selectSwarm = (state: GenesisStore) => state.swarm;
export const selectHealing = (state: GenesisStore) => state.healing;
export const selectGrounding = (state: GenesisStore) => state.grounding;
