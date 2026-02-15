/**
 * Causal Reasoning Module - do-calculus and counterfactual reasoning
 *
 * Implements Pearl's causal inference framework:
 * - Causal graphs (DAGs) representing causal relationships
 * - do-calculus for intervention effects P(Y | do(X))
 * - Counterfactual reasoning "what if X had been different?"
 * - Causal diagnosis of failures
 *
 * Key distinction from correlation:
 * - P(Y | X) = "What is Y given that we OBSERVED X?"
 * - P(Y | do(X)) = "What would Y be if we SET X to a value?"
 */

import { EventEmitter } from 'events';
import { createPublisher } from '../bus/index.js';

const publisher = createPublisher('causal');
publisher.publish('system.booted', {
  source: 'causal',
  precision: 1.0,
  module: 'causal'
} as any);

// ============================================================================
// Types
// ============================================================================

export interface Variable {
  name: string;
  type: 'continuous' | 'discrete' | 'binary';
  domain?: number[] | string[];
  value?: number | string | boolean;
}

export interface CausalEdge {
  from: string;          // Parent variable
  to: string;            // Child variable
  strength?: number;     // Causal strength (0-1)
  mechanism?: (parents: Record<string, unknown>) => unknown;
}

export interface CausalGraph {
  variables: Map<string, Variable>;
  edges: CausalEdge[];
  confounders: string[];  // Variables that confound relationships
}

export interface Intervention {
  variable: string;
  value: unknown;
}

export interface Effect {
  variable: string;
  expectedValue: number;
  confidence: number;
  bounds: [number, number];  // Confidence interval
}

export interface CounterfactualQuery {
  factual: Record<string, unknown>;     // What actually happened
  intervention: Intervention;            // What we're changing
  outcome: string;                       // What we want to know
}

export interface CounterfactualResult {
  query: CounterfactualQuery;
  factualOutcome: unknown;
  counterfactualOutcome: unknown;
  attributableEffect: number;
  probability: number;
}

export interface CausalExplanation {
  failure: Error;
  rootCauses: CausalPath[];
  contributingFactors: Variable[];
  recommendations: string[];
}

export interface CausalPath {
  nodes: string[];
  strength: number;
  description: string;
}

export interface AdjustmentSet {
  variables: string[];
  isValid: boolean;
  isMinimal: boolean;
}

// ============================================================================
// Causal Graph Operations
// ============================================================================

class CausalGraphManager {
  private graph: CausalGraph;

  constructor() {
    this.graph = {
      variables: new Map(),
      edges: [],
      confounders: []
    };
  }

  /**
   * Add a variable to the graph
   */
  addVariable(variable: Variable): void {
    this.graph.variables.set(variable.name, variable);
  }

  /**
   * Add a causal edge
   */
  addEdge(edge: CausalEdge): void {
    // Validate variables exist
    if (!this.graph.variables.has(edge.from)) {
      throw new Error(`Variable ${edge.from} not found`);
    }
    if (!this.graph.variables.has(edge.to)) {
      throw new Error(`Variable ${edge.to} not found`);
    }

    // Check for cycles
    if (this.wouldCreateCycle(edge)) {
      throw new Error(`Edge ${edge.from} -> ${edge.to} would create a cycle`);
    }

    this.graph.edges.push(edge);
  }

  /**
   * Mark a variable as a confounder
   */
  markConfounder(variable: string): void {
    if (!this.graph.variables.has(variable)) {
      throw new Error(`Variable ${variable} not found`);
    }
    this.graph.confounders.push(variable);
  }

  /**
   * Check if adding an edge would create a cycle
   */
  private wouldCreateCycle(newEdge: CausalEdge): boolean {
    // DFS from newEdge.to to see if we can reach newEdge.from
    const visited = new Set<string>();
    const stack = [newEdge.to];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === newEdge.from) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // Find all children
      for (const edge of this.graph.edges) {
        if (edge.from === current) {
          stack.push(edge.to);
        }
      }
    }

    return false;
  }

  /**
   * Get parents of a variable
   */
  getParents(variable: string): string[] {
    return this.graph.edges
      .filter(e => e.to === variable)
      .map(e => e.from);
  }

  /**
   * Get children of a variable
   */
  getChildren(variable: string): string[] {
    return this.graph.edges
      .filter(e => e.from === variable)
      .map(e => e.to);
  }

  /**
   * Get ancestors (all upstream variables)
   */
  getAncestors(variable: string): string[] {
    const ancestors = new Set<string>();
    const stack = this.getParents(variable);

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (ancestors.has(current)) continue;
      ancestors.add(current);
      stack.push(...this.getParents(current));
    }

    return Array.from(ancestors);
  }

  /**
   * Get descendants (all downstream variables)
   */
  getDescendants(variable: string): string[] {
    const descendants = new Set<string>();
    const stack = this.getChildren(variable);

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (descendants.has(current)) continue;
      descendants.add(current);
      stack.push(...this.getChildren(current));
    }

    return Array.from(descendants);
  }

  /**
   * Find all paths between two variables
   */
  findPaths(from: string, to: string): string[][] {
    const paths: string[][] = [];
    const currentPath: string[] = [from];

    const dfs = (current: string): void => {
      if (current === to) {
        paths.push([...currentPath]);
        return;
      }

      for (const child of this.getChildren(current)) {
        if (!currentPath.includes(child)) {
          currentPath.push(child);
          dfs(child);
          currentPath.pop();
        }
      }
    };

    dfs(from);
    return paths;
  }

  /**
   * Check if two variables are d-separated given a set
   */
  dSeparated(x: string, y: string, given: string[]): boolean {
    // Simplified d-separation check using ancestor relationships
    const givenSet = new Set(given);

    // Check all paths from x to y
    const paths = this.findAllUndirectedPaths(x, y);

    for (const path of paths) {
      if (this.isPathBlocked(path, givenSet)) {
        continue;
      }
      // Found an unblocked path
      return false;
    }

    return true;
  }

  /**
   * Find all undirected paths (for d-separation)
   */
  private findAllUndirectedPaths(from: string, to: string): string[][] {
    const paths: string[][] = [];
    const currentPath: string[] = [from];
    const visited = new Set<string>();

    const dfs = (current: string): void => {
      if (current === to) {
        paths.push([...currentPath]);
        return;
      }

      visited.add(current);

      // Get all neighbors (both parents and children)
      const neighbors = [...this.getParents(current), ...this.getChildren(current)];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          currentPath.push(neighbor);
          dfs(neighbor);
          currentPath.pop();
        }
      }

      visited.delete(current);
    };

    dfs(from);
    return paths;
  }

  /**
   * Check if a path is blocked by the conditioning set
   */
  private isPathBlocked(path: string[], given: Set<string>): boolean {
    if (path.length < 3) return false;

    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];

      // Check if curr is a collider (both edges point to it)
      const isCollider =
        this.hasEdge(prev, curr) && this.hasEdge(next, curr);

      if (isCollider) {
        // Collider blocks unless conditioned on
        const descendants = this.getDescendants(curr);
        const ancestorsConditioned = given.has(curr) ||
          descendants.some(d => given.has(d));

        if (!ancestorsConditioned) {
          return true; // Blocked by unconditioned collider
        }
      } else {
        // Non-collider blocks if conditioned on
        if (given.has(curr)) {
          return true; // Blocked by conditioned non-collider
        }
      }
    }

    return false;
  }

  /**
   * Check if an edge exists
   */
  private hasEdge(from: string, to: string): boolean {
    return this.graph.edges.some(e => e.from === from && e.to === to);
  }

  /**
   * Get valid adjustment set for causal effect X -> Y
   */
  getAdjustmentSet(treatment: string, outcome: string): AdjustmentSet {
    // Back-door criterion: find variables that block all back-door paths
    const parents = this.getParents(treatment);
    const ancestors = this.getAncestors(treatment);

    // Adjustment set = non-descendants of treatment that block backdoor paths
    const adjustmentSet = parents.filter(
      p => !this.getDescendants(treatment).includes(p)
    );

    return {
      variables: adjustmentSet,
      isValid: this.dSeparated(treatment, outcome, adjustmentSet),
      isMinimal: true // Simplified - would need to check subsets
    };
  }

  getGraph(): CausalGraph {
    return { ...this.graph };
  }
}

// ============================================================================
// do-Calculus Engine
// ============================================================================

class DoCalculus {
  private graph: CausalGraphManager;
  private samples: Map<string, number[]>;

  constructor(graph: CausalGraphManager) {
    this.graph = graph;
    this.samples = new Map();
  }

  /**
   * Set observational samples for a variable
   */
  setSamples(variable: string, samples: number[]): void {
    this.samples.set(variable, samples);
    if (this.samples.size > 200) {
      const keys = Array.from(this.samples.keys());
      for (let i = 0; i < 50; i++) this.samples.delete(keys[i]);
    }
  }

  /**
   * Calculate P(Y | do(X = x)) - the interventional distribution
   */
  estimateEffect(
    treatment: string,
    treatmentValue: unknown,
    outcome: string
  ): Effect {
    // Get valid adjustment set
    const adjustment = this.graph.getAdjustmentSet(treatment, outcome);

    if (!adjustment.isValid) {
      // Cannot identify causal effect
      return {
        variable: outcome,
        expectedValue: NaN,
        confidence: 0,
        bounds: [NaN, NaN]
      };
    }

    // Adjustment formula: P(Y | do(X)) = Σ_z P(Y | X, Z) P(Z)
    const expectedValue = this.computeAdjustedExpectation(
      treatment,
      treatmentValue,
      outcome,
      adjustment.variables
    );

    // Compute confidence bounds
    const bounds = this.computeConfidenceBounds(
      treatment,
      treatmentValue,
      outcome,
      adjustment.variables
    );

    return {
      variable: outcome,
      expectedValue,
      confidence: adjustment.isValid ? 0.8 : 0.3,
      bounds
    };
  }

  /**
   * Compute adjusted expectation using the back-door adjustment
   */
  private computeAdjustedExpectation(
    treatment: string,
    treatmentValue: unknown,
    outcome: string,
    adjustmentSet: string[]
  ): number {
    // Simplified computation using sample averages
    const outcomeSamples = this.samples.get(outcome) || [];
    const treatmentSamples = this.samples.get(treatment) || [];

    if (outcomeSamples.length === 0 || treatmentSamples.length === 0) {
      return NaN;
    }

    // Filter samples where treatment matches intervention value
    const matchingIndices: number[] = [];
    for (let i = 0; i < treatmentSamples.length; i++) {
      if (Math.abs(treatmentSamples[i] - Number(treatmentValue)) < 0.1) {
        matchingIndices.push(i);
      }
    }

    if (matchingIndices.length === 0) {
      // No matching samples - extrapolate
      return this.extrapolateEffect(treatmentSamples, outcomeSamples, Number(treatmentValue));
    }

    // Average outcome for matching treatment values
    let sum = 0;
    for (const idx of matchingIndices) {
      if (idx < outcomeSamples.length) {
        sum += outcomeSamples[idx];
      }
    }

    return sum / matchingIndices.length;
  }

  /**
   * Extrapolate effect using linear regression
   */
  private extrapolateEffect(
    treatment: number[],
    outcome: number[],
    targetTreatment: number
  ): number {
    // Simple linear regression
    const n = Math.min(treatment.length, outcome.length);
    if (n < 2) return NaN;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += treatment[i];
      sumY += outcome[i];
      sumXY += treatment[i] * outcome[i];
      sumX2 += treatment[i] * treatment[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return slope * targetTreatment + intercept;
  }

  /**
   * Compute confidence bounds for effect
   */
  private computeConfidenceBounds(
    treatment: string,
    treatmentValue: unknown,
    outcome: string,
    adjustmentSet: string[]
  ): [number, number] {
    const outcomeSamples = this.samples.get(outcome) || [];

    if (outcomeSamples.length < 10) {
      return [NaN, NaN];
    }

    // Bootstrap confidence interval
    const bootSamples: number[] = [];
    const numBootstrap = 100;

    for (let b = 0; b < numBootstrap; b++) {
      // Resample
      const resampledOutcome = this.resample(outcomeSamples);
      const resampledTreatment = this.resample(this.samples.get(treatment) || []);

      const effect = this.extrapolateEffect(
        resampledTreatment,
        resampledOutcome,
        Number(treatmentValue)
      );

      if (!isNaN(effect)) {
        bootSamples.push(effect);
      }
    }

    if (bootSamples.length < 10) {
      return [NaN, NaN];
    }

    bootSamples.sort((a, b) => a - b);
    const lower = bootSamples[Math.floor(bootSamples.length * 0.025)];
    const upper = bootSamples[Math.floor(bootSamples.length * 0.975)];

    return [lower, upper];
  }

  /**
   * Resample with replacement
   */
  private resample(samples: number[]): number[] {
    const resampled: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const idx = Math.floor(Math.random() * samples.length);
      resampled.push(samples[idx]);
    }
    return resampled;
  }

  /**
   * Compare effect of two interventions
   */
  compareInterventions(
    treatment: string,
    value1: unknown,
    value2: unknown,
    outcome: string
  ): { effect1: Effect; effect2: Effect; difference: number } {
    const effect1 = this.estimateEffect(treatment, value1, outcome);
    const effect2 = this.estimateEffect(treatment, value2, outcome);

    return {
      effect1,
      effect2,
      difference: effect2.expectedValue - effect1.expectedValue
    };
  }
}

// ============================================================================
// Counterfactual Reasoning
// ============================================================================

class CounterfactualEngine {
  private graph: CausalGraphManager;
  private doCalculus: DoCalculus;

  constructor(graph: CausalGraphManager, doCalculus: DoCalculus) {
    this.graph = graph;
    this.doCalculus = doCalculus;
  }

  /**
   * Answer counterfactual query: "What would Y have been if X had been x?"
   */
  evaluate(query: CounterfactualQuery): CounterfactualResult {
    const { factual, intervention, outcome } = query;

    // Step 1: Abduction - infer exogenous variables from factual evidence
    const exogenous = this.abduction(factual);

    // Step 2: Action - modify structural equations with intervention
    const modifiedGraph = this.applyIntervention(intervention);

    // Step 3: Prediction - compute counterfactual outcome
    const counterfactualOutcome = this.predict(
      modifiedGraph,
      exogenous,
      outcome
    );

    // Get the actual factual outcome
    const factualOutcome = factual[outcome];

    // Compute attributable effect
    const attributableEffect = Number(counterfactualOutcome) - Number(factualOutcome);

    return {
      query,
      factualOutcome,
      counterfactualOutcome,
      attributableEffect,
      probability: this.computeProbability(query, counterfactualOutcome)
    };
  }

  /**
   * Abduction: infer latent variables from observations
   */
  private abduction(factual: Record<string, unknown>): Record<string, unknown> {
    // In a full implementation, this would solve for exogenous variables
    // that explain the observed endogenous variables
    return { ...factual };
  }

  /**
   * Apply intervention to graph (graph surgery)
   */
  private applyIntervention(intervention: Intervention): CausalGraphManager {
    // Create modified graph where intervention variable has no parents
    const modified = new CausalGraphManager();
    const original = this.graph.getGraph();

    // Copy variables
    for (const [name, variable] of original.variables) {
      modified.addVariable({ ...variable });
    }

    // Copy edges, except those pointing to intervention variable
    for (const edge of original.edges) {
      if (edge.to !== intervention.variable) {
        modified.addEdge({ ...edge });
      }
    }

    return modified;
  }

  /**
   * Predict outcome under modified graph
   */
  private predict(
    modifiedGraph: CausalGraphManager,
    exogenous: Record<string, unknown>,
    outcome: string
  ): unknown {
    // Topological sort for evaluation order
    const order = this.topologicalSort(modifiedGraph);

    // Evaluate in order
    const values: Record<string, unknown> = { ...exogenous };

    for (const variable of order) {
      if (values[variable] === undefined) {
        // Compute from parents using structural equation
        const parents = modifiedGraph.getParents(variable);
        const parentValues: Record<string, unknown> = {};
        for (const parent of parents) {
          parentValues[parent] = values[parent];
        }

        // Default linear mechanism
        values[variable] = this.computeFromParents(parentValues);
      }
    }

    return values[outcome];
  }

  /**
   * Topological sort of graph
   */
  private topologicalSort(graph: CausalGraphManager): string[] {
    const graphData = graph.getGraph();
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (node: string): void => {
      if (visited.has(node)) return;
      visited.add(node);

      for (const parent of graph.getParents(node)) {
        visit(parent);
      }

      result.push(node);
    };

    for (const [name] of graphData.variables) {
      visit(name);
    }

    return result;
  }

  /**
   * Default mechanism: linear combination of parents
   */
  private computeFromParents(parentValues: Record<string, unknown>): number {
    let sum = 0;
    for (const [, value] of Object.entries(parentValues)) {
      sum += Number(value) || 0;
    }
    return sum / Math.max(Object.keys(parentValues).length, 1);
  }

  /**
   * Compute probability of counterfactual
   */
  private computeProbability(
    query: CounterfactualQuery,
    outcome: unknown
  ): number {
    const graph = this.graph.getGraph();
    const { intervention } = query;

    // Base probability from edge strengths along causal path
    const parents = this.graph.getParents(query.outcome);
    let pathStrength = 1.0;
    for (const edge of graph.edges) {
      if (edge.to === query.outcome || edge.from === intervention.variable) {
        pathStrength *= (edge.strength ?? 0.8);
      }
    }

    // Discount for confounders (unobserved common causes)
    const confounderDiscount = Math.pow(0.9, graph.confounders.length);

    // Discount for distance (more hops = more uncertainty)
    const hopDiscount = parents.length > 0 ? Math.pow(0.95, parents.length) : 1.0;

    // Outcome certainty: numeric outcomes closer to 0/1 are more certain
    const outcomeNum = Number(outcome);
    const outcomeCertainty = isNaN(outcomeNum) ? 0.7 : Math.min(1, 0.5 + Math.abs(outcomeNum) * 0.3);

    return Math.max(0.1, Math.min(1.0, pathStrength * confounderDiscount * hopDiscount * outcomeCertainty));
  }

  /**
   * Probability of necessity: P(Y' = 0 | X' = 0, X = 1, Y = 1)
   * "Was X necessary for Y?"
   */
  probabilityOfNecessity(
    treatment: string,
    outcome: string,
    factual: Record<string, unknown>
  ): number {
    const result = this.evaluate({
      factual,
      intervention: { variable: treatment, value: 0 },
      outcome
    });

    // Necessary if counterfactual outcome is different
    return result.factualOutcome !== result.counterfactualOutcome ? 1 : 0;
  }

  /**
   * Probability of sufficiency: P(Y' = 1 | X' = 1, X = 0, Y = 0)
   * "Would X have been sufficient for Y?"
   */
  probabilityOfSufficiency(
    treatment: string,
    outcome: string,
    factual: Record<string, unknown>
  ): number {
    const result = this.evaluate({
      factual,
      intervention: { variable: treatment, value: 1 },
      outcome
    });

    // Sufficient if counterfactual outcome changes
    return result.counterfactualOutcome !== result.factualOutcome ? 1 : 0;
  }
}

// ============================================================================
// Causal Diagnostics
// ============================================================================

class CausalDiagnostics {
  private graph: CausalGraphManager;
  private counterfactual: CounterfactualEngine;

  constructor(graph: CausalGraphManager, counterfactual: CounterfactualEngine) {
    this.graph = graph;
    this.counterfactual = counterfactual;
  }

  /**
   * Diagnose failure using causal analysis
   */
  diagnoseFailure(
    failure: Error,
    observedState: Record<string, unknown>
  ): CausalExplanation {
    // Find potential root causes
    const rootCauses = this.findRootCauses(failure, observedState);

    // Find contributing factors
    const contributingFactors = this.findContributingFactors(observedState);

    // Generate recommendations
    const recommendations = this.generateRecommendations(rootCauses);

    return {
      failure,
      rootCauses,
      contributingFactors,
      recommendations
    };
  }

  /**
   * Find root causes of failure
   */
  private findRootCauses(
    failure: Error,
    observedState: Record<string, unknown>
  ): CausalPath[] {
    const paths: CausalPath[] = [];

    // Assume failure is related to some outcome variable
    const outcomeVar = this.inferFailureVariable(failure);
    if (!outcomeVar) return paths;

    // Find all ancestor paths
    const ancestors = this.graph.getAncestors(outcomeVar);

    for (const ancestor of ancestors) {
      const pathNodes = this.graph.findPaths(ancestor, outcomeVar);

      for (const pathNode of pathNodes) {
        // Compute path strength
        const strength = this.computePathStrength(pathNode, observedState);

        if (strength > 0.3) {
          paths.push({
            nodes: pathNode,
            strength,
            description: `${ancestor} → ${outcomeVar} (strength: ${strength.toFixed(2)})`
          });
        }
      }
    }

    // Sort by strength
    paths.sort((a, b) => b.strength - a.strength);

    return paths.slice(0, 5); // Top 5 root causes
  }

  /**
   * Infer which variable the failure relates to
   */
  private inferFailureVariable(failure: Error): string | null {
    // Extract variable name from error message
    const message = failure.message.toLowerCase();

    const graphData = this.graph.getGraph();
    for (const [name] of graphData.variables) {
      if (message.includes(name.toLowerCase())) {
        return name;
      }
    }

    return null;
  }

  /**
   * Compute causal strength along a path
   */
  private computePathStrength(
    path: string[],
    observedState: Record<string, unknown>
  ): number {
    if (path.length < 2) return 0;

    let strength = 1;
    const graphData = this.graph.getGraph();

    for (let i = 0; i < path.length - 1; i++) {
      const edge = graphData.edges.find(
        e => e.from === path[i] && e.to === path[i + 1]
      );

      if (edge && edge.strength !== undefined) {
        strength *= edge.strength;
      } else {
        strength *= 0.5; // Default strength
      }
    }

    return strength;
  }

  /**
   * Find contributing factors
   */
  private findContributingFactors(
    observedState: Record<string, unknown>
  ): Variable[] {
    const factors: Variable[] = [];
    const graphData = this.graph.getGraph();

    for (const [name, variable] of graphData.variables) {
      // Check if variable is in unusual state
      const observedValue = observedState[name];
      if (observedValue !== undefined) {
        // Check if value is extreme
        if (typeof observedValue === 'number') {
          if (Math.abs(observedValue) > 2) { // More than 2 std devs
            factors.push({
              ...variable,
              value: observedValue
            });
          }
        }
      }
    }

    return factors;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(rootCauses: CausalPath[]): string[] {
    const recommendations: string[] = [];

    for (const cause of rootCauses.slice(0, 3)) {
      const rootNode = cause.nodes[0];
      recommendations.push(
        `Investigate and address issues with ${rootNode} (causal strength: ${cause.strength.toFixed(2)})`
      );
    }

    return recommendations;
  }
}

// ============================================================================
// Main Causal Reasoner
// ============================================================================

export class CausalReasoner extends EventEmitter {
  private graph: CausalGraphManager;
  private doCalculus: DoCalculus;
  private counterfactual: CounterfactualEngine;
  private diagnostics: CausalDiagnostics;

  constructor() {
    super();
    this.graph = new CausalGraphManager();
    this.doCalculus = new DoCalculus(this.graph);
    this.counterfactual = new CounterfactualEngine(this.graph, this.doCalculus);
    this.diagnostics = new CausalDiagnostics(this.graph, this.counterfactual);
  }

  /**
   * Add a variable to the causal model
   */
  addVariable(variable: Variable): void {
    this.graph.addVariable(variable);
    this.emit('variable-added', variable);
  }

  /**
   * Add a causal relationship
   */
  addCause(from: string, to: string, strength?: number): void {
    this.graph.addEdge({ from, to, strength });
    this.emit('edge-added', { from, to, strength });
  }

  /**
   * Set observational data
   */
  setData(variable: string, samples: number[]): void {
    this.doCalculus.setSamples(variable, samples);
  }

  /**
   * Estimate causal effect: P(Y | do(X = x))
   */
  estimateEffect(
    treatment: string,
    treatmentValue: unknown,
    outcome: string
  ): Effect {
    return this.doCalculus.estimateEffect(treatment, treatmentValue, outcome);
  }

  /**
   * Answer counterfactual: "What would Y have been if X had been x?"
   */
  whatIf(
    factual: Record<string, unknown>,
    intervention: Intervention,
    outcome: string
  ): CounterfactualResult {
    return this.counterfactual.evaluate({
      factual,
      intervention,
      outcome
    });
  }

  /**
   * Was X necessary for Y?
   */
  wasNecessary(
    treatment: string,
    outcome: string,
    factual: Record<string, unknown>
  ): number {
    return this.counterfactual.probabilityOfNecessity(treatment, outcome, factual);
  }

  /**
   * Would X have been sufficient for Y?
   */
  wouldBeSufficient(
    treatment: string,
    outcome: string,
    factual: Record<string, unknown>
  ): number {
    return this.counterfactual.probabilityOfSufficiency(treatment, outcome, factual);
  }

  /**
   * Diagnose a failure
   */
  diagnoseFailure(
    failure: Error,
    observedState: Record<string, unknown>
  ): CausalExplanation {
    return this.diagnostics.diagnoseFailure(failure, observedState);
  }

  /**
   * Check if X and Y are independent given Z
   */
  areIndependent(x: string, y: string, given: string[]): boolean {
    return this.graph.dSeparated(x, y, given);
  }

  /**
   * Get the causal graph
   */
  getGraph(): CausalGraph {
    return this.graph.getGraph();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a causal reasoner with standard agent variables
 *
 * Uses temporal indexing to model feedback loops without creating cycles:
 * observation_t → belief_t → action_t → outcome_t → next_observation
 *
 * This maintains DAG structure while capturing the feedback nature of
 * perception-action loops in Active Inference agents.
 */
export function createAgentCausalModel(): CausalReasoner {
  const reasoner = new CausalReasoner();

  // Standard agent variables (current timestep)
  reasoner.addVariable({ name: 'observation', type: 'continuous' });
  reasoner.addVariable({ name: 'belief', type: 'continuous' });
  reasoner.addVariable({ name: 'action', type: 'discrete' });
  reasoner.addVariable({ name: 'outcome', type: 'continuous' });
  reasoner.addVariable({ name: 'reward', type: 'continuous' });

  // Temporal variable for next timestep (avoids cycle)
  reasoner.addVariable({ name: 'next_observation', type: 'continuous' });

  // Standard causal relationships (within timestep)
  reasoner.addCause('observation', 'belief', 0.8);
  reasoner.addCause('belief', 'action', 0.9);
  reasoner.addCause('action', 'outcome', 0.7);
  reasoner.addCause('outcome', 'reward', 0.9);

  // Temporal feedback: outcome influences next observation (no cycle)
  reasoner.addCause('outcome', 'next_observation', 0.6);

  return reasoner;
}

export default CausalReasoner;
