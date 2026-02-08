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
  addModification: (modification: ModificationRecord) => void;
  addLesson: (lesson: Lesson) => void;
  addCodeQuery: (query: CodeQuery) => void;
  addBuildOutput: (line: string) => void;
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
