/**
 * Genesis v11.5 - Strategy Executor Bridge
 *
 * Bridges MetacognitiveController's strategy selection with ThinkingEngine's
 * actual reasoning implementations. Maps strategy names to ThinkingEngine methods.
 *
 * This module translates the metacognitive controller's decisions into
 * concrete ThinkingEngine calls (sequential, ToT, GoT, SuperCorrect, etc.)
 */

import {
  ThinkingEngine,
  getThinkingEngine,
  ThinkingResult,
  ToTResult,
  GoTResult,
} from '../thinking/index.js';
import { ReasoningStrategy } from './metacognitive-controller.js';

// ============================================================================
// Types
// ============================================================================

export interface StrategyExecutionResult {
  response: string;
  confidence: number;
  tokens: number;
  strategyUsed: ReasoningStrategy;
  details?: {
    thinkingSteps?: number;
    nodesExpanded?: number;
    escalationReason?: string;
  };
}

// ============================================================================
// Strategy Executor
// ============================================================================

/**
 * Execute a reasoning strategy using the ThinkingEngine.
 *
 * Maps metacognitive strategy names to ThinkingEngine methods:
 * - sequential → think() (5-stage pipeline)
 * - neurosymbolic → think() with enriched context (NSAR adds context upstream)
 * - tree_of_thought → treeOfThought()
 * - graph_of_thought → graphOfThought()
 * - super_correct → superCorrect()
 * - ultimate → treeOfThought + graphOfThought + superCorrect (ensemble)
 */
export async function executeReasoningStrategy(
  strategy: ReasoningStrategy,
  problem: string,
  context: string,
  engine?: ThinkingEngine
): Promise<StrategyExecutionResult> {
  const thinking = engine || getThinkingEngine();

  switch (strategy) {
    case 'sequential':
      return executeSequential(thinking, problem, context);

    case 'neurosymbolic':
      // NSAR enrichment happens upstream in MetacognitiveController
      // Here we just run sequential with the enriched context
      return executeSequential(thinking, problem, context);

    case 'tree_of_thought':
      return executeToT(thinking, problem);

    case 'graph_of_thought':
      return executeGoT(thinking, problem);

    case 'super_correct':
      return executeSuperCorrect(thinking, problem);

    case 'ultimate':
      return executeUltimate(thinking, problem, context);

    default:
      return executeSequential(thinking, problem, context);
  }
}

// ============================================================================
// Individual Strategy Implementations
// ============================================================================

async function executeSequential(
  engine: ThinkingEngine,
  problem: string,
  context: string
): Promise<StrategyExecutionResult> {
  try {
    const result: ThinkingResult = await engine.think(problem, context);

    return {
      response: result.response,
      confidence: result.confidence,
      tokens: result.totalThinkingTokens,
      strategyUsed: 'sequential',
      details: { thinkingSteps: result.thinking.length },
    };
  } catch (error) {
    return {
      response: `Error in sequential reasoning: ${error instanceof Error ? error.message : 'unknown'}`,
      confidence: 0.1,
      tokens: 0,
      strategyUsed: 'sequential',
    };
  }
}

async function executeToT(
  engine: ThinkingEngine,
  problem: string
): Promise<StrategyExecutionResult> {
  try {
    const result: ToTResult = await engine.treeOfThought(problem);

    return {
      response: result.solution,
      confidence: result.confidence,
      tokens: result.treeStats.nodesExpanded * 200, // Estimate
      strategyUsed: 'tree_of_thought',
      details: {
        nodesExpanded: result.treeStats.nodesExpanded,
        thinkingSteps: result.solutionPath.length,
      },
    };
  } catch (error) {
    return {
      response: `Error in Tree-of-Thought: ${error instanceof Error ? error.message : 'unknown'}`,
      confidence: 0.1,
      tokens: 0,
      strategyUsed: 'tree_of_thought',
    };
  }
}

async function executeGoT(
  engine: ThinkingEngine,
  problem: string
): Promise<StrategyExecutionResult> {
  try {
    const result: GoTResult = await engine.graphOfThought(problem);

    return {
      response: result.solution,
      confidence: result.confidence,
      tokens: result.stats.totalNodes * 200, // Estimate
      strategyUsed: 'graph_of_thought',
      details: {
        nodesExpanded: result.stats.totalNodes,
        thinkingSteps: result.stats.refinements,
      },
    };
  } catch (error) {
    return {
      response: `Error in Graph-of-Thought: ${error instanceof Error ? error.message : 'unknown'}`,
      confidence: 0.1,
      tokens: 0,
      strategyUsed: 'graph_of_thought',
    };
  }
}

async function executeSuperCorrect(
  engine: ThinkingEngine,
  problem: string
): Promise<StrategyExecutionResult> {
  try {
    const result = await engine.superCorrect(problem);

    // Get the final corrected solution (last correction round, or original)
    const finalSolution = result.correctionHistory.length > 0
      ? result.correctionHistory[result.correctionHistory.length - 1].correctedSolution
      : result.solution;

    return {
      response: finalSolution,
      confidence: result.stats.finalConfidence,
      tokens: result.stats.totalCorrectionRounds * 500 + 2000, // Estimate
      strategyUsed: 'super_correct',
      details: {
        thinkingSteps: result.stats.totalCorrectionRounds,
      },
    };
  } catch (error) {
    return {
      response: `Error in SuperCorrect: ${error instanceof Error ? error.message : 'unknown'}`,
      confidence: 0.1,
      tokens: 0,
      strategyUsed: 'super_correct',
    };
  }
}

/**
 * Ultimate strategy: run multiple strategies and ensemble the results.
 * Takes the response with highest confidence.
 */
async function executeUltimate(
  engine: ThinkingEngine,
  problem: string,
  context: string
): Promise<StrategyExecutionResult> {
  try {
    // Run three strategies in parallel
    const [sequential, tot, got] = await Promise.allSettled([
      executeSequential(engine, problem, context),
      executeToT(engine, problem),
      executeGoT(engine, problem),
    ]);

    // Collect successful results
    const results: StrategyExecutionResult[] = [];
    if (sequential.status === 'fulfilled') results.push(sequential.value);
    if (tot.status === 'fulfilled') results.push(tot.value);
    if (got.status === 'fulfilled') results.push(got.value);

    if (results.length === 0) {
      return {
        response: 'All strategies failed in ultimate mode',
        confidence: 0.1,
        tokens: 0,
        strategyUsed: 'ultimate',
      };
    }

    // Select best by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    const best = results[0];

    // Boost confidence if multiple strategies agree
    let confidenceBoost = 0;
    if (results.length >= 2) {
      // Check agreement (first 100 chars similarity)
      const first100 = results.map(r => r.response.slice(0, 100).toLowerCase());
      const agreements = first100.filter(r => {
        const words = r.split(/\s+/);
        const bestWords = first100[0].split(/\s+/);
        const overlap = words.filter(w => bestWords.includes(w)).length;
        return overlap / Math.max(words.length, 1) > 0.3;
      });
      confidenceBoost = (agreements.length - 1) * 0.05;
    }

    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

    return {
      response: best.response,
      confidence: Math.min(1, best.confidence + confidenceBoost),
      tokens: totalTokens,
      strategyUsed: 'ultimate',
      details: {
        thinkingSteps: results.length,
        nodesExpanded: results.reduce((sum, r) => sum + (r.details?.nodesExpanded || 0), 0),
      },
    };
  } catch (error) {
    return {
      response: `Error in ultimate reasoning: ${error instanceof Error ? error.message : 'unknown'}`,
      confidence: 0.1,
      tokens: 0,
      strategyUsed: 'ultimate',
    };
  }
}

// ============================================================================
// Factory for MetacognitiveController Integration
// ============================================================================

/**
 * Create an executor function compatible with MetacognitiveController.setStrategyExecutor()
 */
export function createStrategyExecutor(engine?: ThinkingEngine): (
  strategy: ReasoningStrategy,
  problem: string,
  context: string
) => Promise<{ response: string; confidence: number; tokens: number }> {
  return async (strategy, problem, context) => {
    const result = await executeReasoningStrategy(strategy, problem, context, engine);
    return {
      response: result.response,
      confidence: result.confidence,
      tokens: result.tokens,
    };
  };
}
