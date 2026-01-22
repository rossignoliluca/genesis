/**
 * Genesis 6.1 - Active Inference Types
 *
 * Based on pymdp and Free Energy Principle (Friston)
 *
 * Core concepts:
 * - Hidden states: What the system believes about the world
 * - Observations: What the system perceives
 * - Actions: What the system can do
 * - Preferences: What the system wants (C matrix)
 */

// ============================================================================
// Hidden State Space (Factorized)
// ============================================================================

/**
 * Hidden state factors - factorized to avoid combinatorial explosion
 *
 * Instead of 400 states (5×4×5×4), we have 4 factors with small dimensions.
 * This reduces B matrix from 400×400×8 = 1.28M to ~900 parameters.
 */
export type ViabilityLevel = 0 | 1 | 2 | 3 | 4; // critical, low, medium, high, optimal
export type WorldState = 0 | 1 | 2 | 3;          // unknown, stable, changing, hostile
export type CouplingState = 0 | 1 | 2 | 3 | 4;   // none, weak, medium, strong, synced
export type GoalProgress = 0 | 1 | 2 | 3;         // blocked, slow, onTrack, achieved

export interface HiddenState {
  viability: ViabilityLevel;
  worldState: WorldState;
  coupling: CouplingState;
  goalProgress: GoalProgress;
}

export const HIDDEN_STATE_DIMS = {
  viability: 5,
  worldState: 4,
  coupling: 5,
  goalProgress: 4,
} as const;

export const HIDDEN_STATE_LABELS = {
  viability: ['critical', 'low', 'medium', 'high', 'optimal'] as const,
  worldState: ['unknown', 'stable', 'changing', 'hostile'] as const,
  coupling: ['none', 'weak', 'medium', 'strong', 'synced'] as const,
  goalProgress: ['blocked', 'slow', 'onTrack', 'achieved'] as const,
};

// ============================================================================
// Observation Space
// ============================================================================

/**
 * Observation modalities - what the system perceives
 */
export type EnergyObs = 0 | 1 | 2 | 3 | 4;        // depleted, low, medium, high, full
export type PhiObs = 0 | 1 | 2 | 3;               // dormant, low, medium, high
export type ToolObs = 0 | 1 | 2;                  // failed, partial, success
export type CoherenceObs = 0 | 1 | 2;             // broken, degraded, consistent
export type TaskObs = 0 | 1 | 2 | 3;              // none, pending, active, completed
// v9.3 Economic observation for autopoietic self-funding
export type EconomicObs = 0 | 1 | 2 | 3;          // critical, low, stable, growing

export interface Observation {
  energy: EnergyObs;
  phi: PhiObs;
  tool: ToolObs;
  coherence: CoherenceObs;
  task: TaskObs;
  economic?: EconomicObs; // v9.3 - optional for backward compatibility
}

export const OBSERVATION_DIMS = {
  energy: 5,
  phi: 4,
  tool: 3,
  coherence: 3,
  task: 4,
  economic: 4, // v9.3
} as const;

export const OBSERVATION_LABELS = {
  energy: ['depleted', 'low', 'medium', 'high', 'full'] as const,
  phi: ['dormant', 'low', 'medium', 'high'] as const,
  tool: ['failed', 'partial', 'success'] as const,
  coherence: ['broken', 'degraded', 'consistent'] as const,
  task: ['none', 'pending', 'active', 'completed'] as const,
  economic: ['critical', 'low', 'stable', 'growing'] as const, // v9.3
};

// ============================================================================
// Action Space
// ============================================================================

export type ActionType =
  | 'sense.mcp'       // Gather sensory data via MCP
  | 'recall.memory'   // Retrieve from memory
  | 'plan.goals'      // Decompose goals
  | 'verify.ethics'   // Ethical check
  | 'execute.task'    // Execute planned task
  | 'execute.code'    // Execute generated code (Code Execution Mode)
  | 'execute.shell'   // Execute shell command (OWASP-secure)
  | 'adapt.code'      // Adapt code based on errors
  | 'execute.cycle'   // Full execution cycle with iteration
  | 'self.modify'     // Radical self-modification (Darwin-Gödel)
  | 'self.analyze'    // Analyze own code for improvements
  | 'git.push'        // Push to remote repository (requires confirmation)
  | 'dream.cycle'     // Memory consolidation
  | 'rest.idle'       // Do nothing (save energy)
  | 'recharge'        // Restore energy
  // v7.14 - Web & Monetization Actions
  | 'web.search'      // Search web via Brave/Exa MCP
  | 'web.scrape'      // Scrape URLs via Firecrawl MCP
  | 'web.browse'      // Browser automation via Playwright MCP
  | 'deploy.service'  // Deploy to AWS (Lambda, EC2, S3)
  | 'content.generate'// Generate images/text via Stability AI/OpenAI
  | 'market.analyze'  // Market research and competitor analysis
  | 'api.call'        // HTTP API calls (REST/GraphQL)
  | 'github.deploy'   // GitHub operations (repos, PRs, issues)
  // v7.15 - Code Self-Awareness (Autopoiesis)
  | 'code.snapshot'   // Store current code state in memory
  | 'code.history'    // Recall code evolution from git
  | 'code.diff'       // Compare code versions
  // v9.3 - Economic Self-Funding (Autopoiesis)
  | 'econ.check'      // Check economic health (balance, costs, revenue)
  | 'econ.optimize'   // Optimize costs (cheaper LLMs, caching)
  | 'econ.activate'   // Activate a revenue-generating service
  | 'econ.promote'    // Promote services to increase revenue
  // v10.0 - Meta-Improvement
  | 'improve.self';   // High-level self-improvement action

export const ACTIONS: ActionType[] = [
  'sense.mcp',
  'recall.memory',
  'plan.goals',
  'verify.ethics',
  'execute.task',
  'execute.code',
  'execute.shell',
  'adapt.code',
  'execute.cycle',
  'self.modify',
  'self.analyze',
  'git.push',
  'dream.cycle',
  'rest.idle',
  'recharge',
  // v7.14 - Web & Monetization
  'web.search',
  'web.scrape',
  'web.browse',
  'deploy.service',
  'content.generate',
  'market.analyze',
  'api.call',
  'github.deploy',
  // v7.15 - Code Self-Awareness
  'code.snapshot',
  'code.history',
  'code.diff',
  // v9.3 - Economic Self-Funding
  'econ.check',
  'econ.optimize',
  'econ.activate',
  'econ.promote',
  // v10.0 - Meta-Improvement
  'improve.self',
];

export const ACTION_COUNT = ACTIONS.length;

// ============================================================================
// Beliefs (Probability Distributions)
// ============================================================================

/**
 * Beliefs are probability distributions over hidden states
 * Factorized: one distribution per factor
 */
export interface Beliefs {
  viability: number[];   // [P(critical), P(low), P(medium), P(high), P(optimal)]
  worldState: number[];  // [P(unknown), P(stable), P(changing), P(hostile)]
  coupling: number[];    // [P(none), P(weak), P(medium), P(strong), P(synced)]
  goalProgress: number[]; // [P(blocked), P(slow), P(onTrack), P(achieved)]
}

/**
 * Policy is a probability distribution over actions
 */
export type Policy = number[]; // [P(action0), P(action1), ...]

// ============================================================================
// Generative Model Matrices
// ============================================================================

/**
 * A matrix: P(observation | hidden_state)
 * Maps hidden states to expected observations
 *
 * Factorized: A[modality][obs_level][state_level]
 */
export interface AMatrix {
  energy: number[][];    // [5][5] energy obs given viability
  phi: number[][];       // [4][4] phi obs given worldState (placeholder)
  tool: number[][];      // [3][5] tool obs given coupling
  coherence: number[][]; // [3][4] coherence obs given worldState
  task: number[][];      // [4][4] task obs given goalProgress
}

/**
 * B matrix: P(next_state | current_state, action)
 * Transition probabilities
 *
 * Factorized: B[factor][next_state][current_state][action]
 */
export interface BMatrix {
  viability: number[][][];  // [5][5][8] next viability given current × action
  worldState: number[][][]; // [4][4][8]
  coupling: number[][][];   // [5][5][8]
  goalProgress: number[][][]; // [4][4][8]
}

/**
 * C matrix: log P(preferred_observation)
 * Encodes preferences (what the system wants to observe)
 *
 * Negative values = aversive
 * Positive values = attractive
 */
export interface CMatrix {
  energy: number[];     // Prefer high energy
  phi: number[];        // Prefer high consciousness
  tool: number[];       // Prefer successful tools
  coherence: number[];  // Prefer consistency
  task: number[];       // Prefer task completion
}

/**
 * D matrix: P(initial_state)
 * Prior beliefs about initial state
 */
export interface DMatrix {
  viability: number[];
  worldState: number[];
  coupling: number[];
  goalProgress: number[];
}

// ============================================================================
// Active Inference Engine Interface
// ============================================================================

export interface ActiveInferenceConfig {
  // Inference parameters
  inferenceIterations: number;  // Number of belief update iterations
  policyHorizon: number;        // How far ahead to plan

  // Temperature parameters
  actionTemperature: number;    // Softmax temperature for action selection

  // Prior strength
  priorWeight: number;          // Weight of D matrix (prior beliefs)

  // Learning rates (for online learning)
  learningRateA: number;        // A matrix learning rate
  learningRateB: number;        // B matrix learning rate

  // v10.4.1: Exploration-exploitation balance
  explorationBonus: number;     // Weight of information gain in EFE (epistemic value)
}

export const DEFAULT_CONFIG: ActiveInferenceConfig = {
  inferenceIterations: 26, // Auto-improved: Φ was 0.43 // Self-improved: +50% iterations for accuracy
  policyHorizon: 3,
  actionTemperature: 1.0,
  priorWeight: 0.1,
  learningRateA: 0.01,
  learningRateB: 0.01,
  explorationBonus: 1.0,        // Balance exploration vs exploitation (higher = more exploration)
};

// ============================================================================
// Events
// ============================================================================

export type AIEventType =
  | 'beliefs_updated'
  | 'policy_inferred'
  | 'action_selected'
  | 'action_executed'
  | 'observation_received'
  | 'surprise_high'
  | 'goal_achieved'
  | 'energy_critical';

export interface AIEvent {
  type: AIEventType;
  timestamp: Date;
  data: Record<string, any>;
}

export type AIEventHandler = (event: AIEvent) => void;
