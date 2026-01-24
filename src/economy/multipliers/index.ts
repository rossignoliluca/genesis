/**
 * Multipliers — Non-Linear Revenue Amplifiers
 *
 * One-time or periodic high-value opportunities (grants, arbitrage).
 */

export { GrantsManager, getGrantsManager, resetGrantsManager } from './grants.js';
export type { GrantProgram, GrantApplication, GrantsStats, GrantsConfig } from './grants.js';

export { CrossL2Arbitrageur, getCrossL2Arbitrageur, resetCrossL2Arbitrageur } from './cross-l2-arb.js';
export type { ArbOpportunity, ArbExecution, ArbStats, ArbConfig } from './cross-l2-arb.js';
