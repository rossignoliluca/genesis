/**
 * Genesis — Runtime Constants
 *
 * Centralizes all hardcoded numeric values from genesis.ts.
 * Each constant reads from an env var with a fallback to the original default.
 *
 * Env var naming: GENESIS_<CATEGORY>_<NAME>
 * No behavior changes — defaults match the original hardcoded values.
 */

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** SSE dashboard port (observability UI) */
export const DASHBOARD_PORT = envInt('GENESIS_DASHBOARD_PORT', 9876);

/** A2A HTTP server port */
export const A2A_HTTP_PORT = envInt('GENESIS_A2A_HTTP_PORT', 9877);

/** A2A WebSocket server port */
export const A2A_WS_PORT = envInt('GENESIS_A2A_WS_PORT', 9878);

/** REST API server port */
export const API_PORT = envInt('GENESIS_API_PORT', 3001);

/** WebSocket real-time API port */
export const WS_PORT = envInt('GENESIS_WS_PORT', 3002);

// ---------------------------------------------------------------------------
// Intervals (milliseconds)
// ---------------------------------------------------------------------------

/** State persistence auto-save interval */
export const PERSISTENCE_AUTO_SAVE_MS = envInt('GENESIS_PERSISTENCE_AUTO_SAVE_MS', 60_000);

/** Revenue tracker auto-save interval */
export const REVENUE_AUTO_SAVE_MS = envInt('GENESIS_REVENUE_AUTO_SAVE_MS', 60_000);

/** Competitive intel check interval */
export const COMP_INTEL_CHECK_MS = envInt('GENESIS_COMP_INTEL_CHECK_MS', 6 * 60 * 60 * 1000);

/** Competitive intel daily digest interval */
export const COMP_INTEL_DIGEST_MS = envInt('GENESIS_COMP_INTEL_DIGEST_MS', 24 * 60 * 60 * 1000);

/** Bounty orchestrator autonomous cycle interval */
export const BOUNTY_CYCLE_MS = envInt('GENESIS_BOUNTY_CYCLE_MS', 30 * 60 * 1000);

/** Finance module data update interval */
export const FINANCE_UPDATE_MS = envInt('GENESIS_FINANCE_UPDATE_MS', 60_000);

/** Content scheduler poll interval */
export const CONTENT_SCHEDULER_MS = envInt('GENESIS_CONTENT_SCHEDULER_MS', 60_000);

/** Strategy orchestrator evaluation interval */
export const STRATEGY_EVAL_MS = envInt('GENESIS_STRATEGY_EVAL_MS', 5 * 60 * 1000);

/** Strategy orchestrator minimum strategy duration */
export const STRATEGY_MIN_DURATION_MS = envInt('GENESIS_STRATEGY_MIN_DURATION_MS', 10 * 60 * 1000);

/** Self-reflection engine reflection interval */
export const REFLECTION_INTERVAL_MS = envInt('GENESIS_REFLECTION_INTERVAL_MS', 30 * 60 * 1000);

/** Goal system evaluation interval */
export const GOAL_EVAL_MS = envInt('GENESIS_GOAL_EVAL_MS', 5 * 60 * 1000);

/** Goal system maximum goal lifetime */
export const GOAL_TIMEOUT_MS = envInt('GENESIS_GOAL_TIMEOUT_MS', 24 * 60 * 60 * 1000);

/** Attention controller evaluation interval */
export const ATTENTION_EVAL_MS = envInt('GENESIS_ATTENTION_EVAL_MS', 10 * 1000);

/** Attention controller minimum focus duration before switching */
export const ATTENTION_SWITCH_COOLDOWN_MS = envInt('GENESIS_ATTENTION_SWITCH_COOLDOWN_MS', 30 * 1000);

/** Skill acquisition evaluation interval */
export const SKILL_EVAL_MS = envInt('GENESIS_SKILL_EVAL_MS', 15 * 60 * 1000);

/** WebSocket heartbeat interval */
export const WS_HEARTBEAT_MS = envInt('GENESIS_WS_HEARTBEAT_MS', 30_000);

/** WebSocket client inactivity timeout */
export const WS_CLIENT_TIMEOUT_MS = envInt('GENESIS_WS_CLIENT_TIMEOUT_MS', 60_000);

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Consciousness bridge φ gate threshold */
export const PHI_THRESHOLD = envFloat('GENESIS_PHI_THRESHOLD', 0.3);

/** A2A server minimum trust level for incoming requests */
export const A2A_MIN_TRUST = envFloat('GENESIS_A2A_MIN_TRUST', 0.3);

/** Bounty orchestrator minimum EFE score to pursue */
export const BOUNTY_MIN_EFE = envFloat('GENESIS_BOUNTY_MIN_EFE', 0.6);

/** Bounty orchestrator minimum success probability to pursue */
export const BOUNTY_MIN_SUCCESS_PROB = envFloat('GENESIS_BOUNTY_MIN_SUCCESS_PROB', 0.5);

/** Revenue system minimum ROI threshold */
export const REVENUE_MIN_ROI = envFloat('GENESIS_REVENUE_MIN_ROI', 0.5);

/** Decision engine exploration rate */
export const DECISION_EXPLORATION_RATE = envFloat('GENESIS_DECISION_EXPLORATION_RATE', 0.2);

/** Decision engine risk tolerance */
export const DECISION_RISK_TOLERANCE = envFloat('GENESIS_DECISION_RISK_TOLERANCE', 0.4);

/** Decision engine minimum confidence */
export const DECISION_MIN_CONFIDENCE = envFloat('GENESIS_DECISION_MIN_CONFIDENCE', 0.6);

// ---------------------------------------------------------------------------
// Budget multipliers
// ---------------------------------------------------------------------------

/** Monthly budget multiplier (dailyBudget * N = monthlyLimit) */
export const BUDGET_MONTHLY_MULTIPLIER = envFloat('GENESIS_BUDGET_MONTHLY_MULTIPLIER', 30);

/** Per-transaction budget fraction (dailyBudget * N = perTransactionLimit) */
export const BUDGET_PER_TX_FRACTION = envFloat('GENESIS_BUDGET_PER_TX_FRACTION', 0.5);

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envFloat(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
}
