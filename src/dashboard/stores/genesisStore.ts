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
}

export interface MemoryState {
  episodic: number;
  semantic: number;
  procedural: number;
  consolidationProgress: number;
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
  addEvent: (event: { type: string; data: unknown }) => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

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
  },
  memory: {
    episodic: 1000,
    semantic: 500,
    procedural: 100,
    consolidationProgress: 0,
  },
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
