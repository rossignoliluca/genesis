/**
 * Assets — Passive Revenue Generators
 *
 * Capital-deployed assets that earn yield with minimal active management.
 */

export { YieldOptimizer, getYieldOptimizer, resetYieldOptimizer } from './yield-optimizer.js';
export type { YieldPosition, YieldOpportunity, YieldOptimizerStats, YieldOptimizerConfig } from './yield-optimizer.js';

export { ComputeProvider, getComputeProvider, resetComputeProvider } from './compute-provider.js';
export type { ComputeJob, ComputeSpecs, ComputeProviderStats, ComputeProviderConfig } from './compute-provider.js';
