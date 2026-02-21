/**
 * MAP-Elites Diversity Engine for the Tool Factory
 *
 * Maintains a quality-diversity (QD) archive so the tool factory never
 * converges to a narrow set of similar tools.  Each archive cell holds the
 * single best-performing tool for a unique behavioral niche; new tools
 * compete within their niche rather than against the whole population.
 *
 * Reference: Mouret & Clune (2015) "Illuminating search spaces by mapping
 * elites"; AlphaEvolve (2025) QD extension.
 */

import { DynamicTool, JSONSchema } from './types.js';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface DimensionSpec {
  /** Human-readable label, e.g. "complexity" */
  name: string;
  /** Number of discrete bins along this dimension */
  bins: number;
  /** Minimum raw value (maps to bin 0) */
  min: number;
  /** Maximum raw value (maps to bin bins-1) */
  max: number;
}

export interface MAPElitesConfig {
  /** Absolute ceiling on individuals stored across all cells */
  maxArchiveSize: number;
  /**
   * When a cell is full and a new candidate arrives:
   * - 'fitness'   → keep whichever has higher fitness
   * - 'novelty'   → keep the one that is most different from its neighbours
   * - 'curiosity' → weighted combination of fitness + novelty (uses weights below)
   */
  replacementStrategy: 'fitness' | 'novelty' | 'curiosity';
  /** Weight on fitness term when strategy === 'curiosity' */
  fitnessWeight: number;
  /** Weight on novelty term when strategy === 'curiosity' */
  noveltyWeight: number;
}

const DEFAULT_CONFIG: MAPElitesConfig = {
  maxArchiveSize: 1_000,
  replacementStrategy: 'fitness',
  fitnessWeight: 0.7,
  noveltyWeight: 0.3,
};

interface CellEntry<T> {
  individual: T;
  fitness: number;
  /** Raw behavioral descriptor (continuous, pre-binning) */
  descriptor: number[];
}

// ---------------------------------------------------------------------------
// MAPElitesArchive
// ---------------------------------------------------------------------------

export class MAPElitesArchive<T> {
  private readonly dims: DimensionSpec[];
  private readonly cfg: MAPElitesConfig;

  /**
   * Flat map from cell-key (comma-joined bin indices) → best entry.
   * Using a Map gives O(1) lookup without allocating a dense n-d array.
   */
  private readonly cells = new Map<string, CellEntry<T>>();

  /** Total number of cells in the theoretical full grid */
  private readonly totalCells: number;

  constructor(dimensions: DimensionSpec[], config: Partial<MAPElitesConfig> = {}) {
    if (dimensions.length === 0) {
      throw new Error('[map-elites] At least one dimension is required');
    }
    this.dims = dimensions;
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.totalCells = dimensions.reduce((acc, d) => acc * d.bins, 1);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attempt to add an individual.
   * Returns true when the individual was actually inserted (either as the
   * first occupant of a cell or as a replacement for the previous elite).
   */
  add(individual: T, descriptor: number[], fitness: number): boolean {
    if (descriptor.length !== this.dims.length) {
      throw new Error(
        `[map-elites] Descriptor length ${descriptor.length} !== dimension count ${this.dims.length}`,
      );
    }

    const binIndices = this.toBinIndices(descriptor);
    const key = binIndices.join(',');
    const existing = this.cells.get(key);

    if (!existing) {
      // Respect hard archive cap before inserting
      if (this.cells.size >= this.cfg.maxArchiveSize) {
        // Evict the globally worst-fitness cell to make room
        this.evictWorst();
      }
      this.cells.set(key, { individual, fitness, descriptor });
      return true;
    }

    if (this.shouldReplace(existing, { individual, fitness, descriptor }, binIndices)) {
      this.cells.set(key, { individual, fitness, descriptor });
      return true;
    }

    return false;
  }

  /**
   * Retrieve the elite for the cell identified by integer bin indices.
   * Returns null when the cell is unoccupied.
   */
  getElite(cellIndex: number[]): { individual: T; fitness: number } | null {
    const key = cellIndex.join(',');
    const entry = this.cells.get(key);
    return entry ? { individual: entry.individual, fitness: entry.fitness } : null;
  }

  /** All occupied cells, sorted by fitness descending. */
  getOccupied(): Array<{ cell: number[]; individual: T; fitness: number }> {
    const result: Array<{ cell: number[]; individual: T; fitness: number }> = [];
    for (const [key, entry] of this.cells) {
      result.push({
        cell: key.split(',').map(Number),
        individual: entry.individual,
        fitness: entry.fitness,
      });
    }
    return result.sort((a, b) => b.fitness - a.fitness);
  }

  /** Fraction of theoretical grid cells that are occupied (0 to 1). */
  coverage(): number {
    return this.cells.size / this.totalCells;
  }

  /**
   * QD-score: sum of all elite fitnesses.
   * Higher is better — reflects both quality and diversity simultaneously.
   */
  qdScore(): number {
    let sum = 0;
    for (const entry of this.cells.values()) {
      sum += entry.fitness;
    }
    return sum;
  }

  /**
   * Return up to k individuals drawn one per occupied cell, ordered by
   * fitness descending (highest-quality diverse sample).
   */
  diverseSample(k: number): T[] {
    const occupied = this.getOccupied();
    const count = Math.min(k, occupied.length);
    return occupied.slice(0, count).map(o => o.individual);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Map continuous descriptor values to discrete bin indices. */
  private toBinIndices(descriptor: number[]): number[] {
    return descriptor.map((value, i) => {
      const dim = this.dims[i];
      const clamped = Math.max(dim.min, Math.min(dim.max, value));
      const ratio = (clamped - dim.min) / (dim.max - dim.min || 1);
      // Clamp to [0, bins-1] — a ratio of exactly 1.0 must not overflow
      return Math.min(dim.bins - 1, Math.floor(ratio * dim.bins));
    });
  }

  private shouldReplace(
    existing: CellEntry<T>,
    candidate: CellEntry<T>,
    binIndices: number[],
  ): boolean {
    switch (this.cfg.replacementStrategy) {
      case 'fitness':
        return candidate.fitness > existing.fitness;

      case 'novelty': {
        const existingNovelty = this.noveltyScore(existing.descriptor, binIndices);
        const candidateNovelty = this.noveltyScore(candidate.descriptor, binIndices);
        return candidateNovelty > existingNovelty;
      }

      case 'curiosity': {
        const existingNovelty = this.noveltyScore(existing.descriptor, binIndices);
        const candidateNovelty = this.noveltyScore(candidate.descriptor, binIndices);
        const existingScore =
          this.cfg.fitnessWeight * existing.fitness +
          this.cfg.noveltyWeight * existingNovelty;
        const candidateScore =
          this.cfg.fitnessWeight * candidate.fitness +
          this.cfg.noveltyWeight * candidateNovelty;
        return candidateScore > existingScore;
      }
    }
  }

  /**
   * Novelty is approximated as the average Euclidean distance in descriptor
   * space from the target descriptor to the descriptors of its occupied
   * von-Neumann neighbours (adjacent cells +-1 along each dimension).
   *
   * A descriptor isolated from all neighbours has high novelty (large average
   * distance) and is more likely to be preserved when a competitor arrives.
   */
  private noveltyScore(descriptor: number[], binIndices: number[]): number {
    const neighbours = this.neighbourDescriptors(binIndices);
    if (neighbours.length === 0) return 1.0;

    const totalDist = neighbours.reduce(
      (sum, neighbourDesc) => sum + euclidean(descriptor, neighbourDesc),
      0,
    );
    return totalDist / neighbours.length;
  }

  private neighbourDescriptors(binIndices: number[]): number[][] {
    const result: number[][] = [];
    for (let d = 0; d < this.dims.length; d++) {
      for (const delta of [-1, 1]) {
        const neighbourBins = [...binIndices];
        neighbourBins[d] += delta;
        if (neighbourBins[d] < 0 || neighbourBins[d] >= this.dims[d].bins) continue;
        const key = neighbourBins.join(',');
        const entry = this.cells.get(key);
        if (entry) result.push(entry.descriptor);
      }
    }
    return result;
  }

  /** Remove the globally lowest-fitness cell to enforce the hard size cap. */
  private evictWorst(): void {
    let worstKey: string | null = null;
    let worstFitness = Infinity;
    for (const [key, entry] of this.cells) {
      if (entry.fitness < worstFitness) {
        worstFitness = entry.fitness;
        worstKey = key;
      }
    }
    if (worstKey !== null) this.cells.delete(worstKey);
  }
}

// ---------------------------------------------------------------------------
// Euclidean distance (pure, no external deps)
// ---------------------------------------------------------------------------

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ---------------------------------------------------------------------------
// ToolBehaviorDescriptor
// ---------------------------------------------------------------------------

/**
 * Map a DynamicTool to a 4-dimensional behavioral descriptor:
 *
 *   [0] complexity  — normalised source-code length + structural complexity proxy
 *   [1] domain      — stable hash of the parameter schema types, folded to [0,1]
 *   [2] io-type     — ratio of input property count to total (input + description tokens)
 *   [3] reliability — empirical success rate, or 0.5 prior when untested
 *
 * All values are continuous in [0, 1] so they compose cleanly with the
 * DimensionSpec ranges defined in createToolArchive().
 */
export function describeToolBehavior(tool: DynamicTool): number[] {
  return [
    complexityScore(tool.source),
    domainScore(tool.paramSchema),
    ioTypeScore(tool.paramSchema),
    reliabilityScore(tool),
  ];
}

// --- Dimension 0: Complexity ---

/**
 * Combines a line-count signal with a simple cyclomatic-complexity proxy
 * (count of branching keywords in the source).  Result clamped to [0, 1].
 *
 * The sigmoid is centred so that a ~200-line function with ~15 branches
 * scores 0.5 — a deliberately moderate reference point.
 */
function complexityScore(source: string): number {
  const lines = source.split('\n').length;
  const lengthScore = sigmoid((lines - 200) / 80);

  const branchPattern = /\b(if|else|for|while|switch|catch|&&|\|\||\?)\b/g;
  const branchCount = (source.match(branchPattern) ?? []).length;
  const branchScore = sigmoid((branchCount - 15) / 6);

  return clamp01(0.5 * lengthScore + 0.5 * branchScore);
}

// --- Dimension 1: Domain ---

/**
 * Extracts all primitive type strings from the JSON Schema property
 * definitions and folds their combined fingerprint into [0, 1].
 * Tools that accept only strings cluster near one region; tools that
 * mix numbers, arrays, and objects scatter across the dimension.
 */
function domainScore(schema: JSONSchema): number {
  const types = collectTypes(schema);
  if (types.length === 0) return 0.0;

  // Deterministic fingerprint: polynomial rolling hash of sorted type names
  const joined = types.sort().join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) >>> 0; // unsigned 32-bit
  }
  return hash / 0xffffffff;
}

function collectTypes(schema: JSONSchema, out: string[] = []): string[] {
  if (schema.type) out.push(schema.type);
  if (schema.properties) {
    for (const child of Object.values(schema.properties)) {
      collectTypes(child, out);
    }
  }
  if (schema.items) collectTypes(schema.items, out);
  return out;
}

// --- Dimension 2: IO-type ---

/**
 * Ratio of input parameter count to a rough estimate of total complexity
 * (inputs + description token count as a proxy for output richness).
 *
 * Pure transformers (many inputs, terse description) score near 1.
 * Generators (few inputs, rich description) score near 0.
 */
function ioTypeScore(schema: JSONSchema): number {
  const inputCount = schema.properties ? Object.keys(schema.properties).length : 0;
  const descTokens = (schema.description ?? '').split(/\s+/).filter(Boolean).length;
  const total = inputCount + descTokens;
  return total === 0 ? 0.5 : clamp01(inputCount / total);
}

// --- Dimension 3: Reliability ---

function reliabilityScore(tool: DynamicTool): number {
  if (tool.usageCount === 0) return 0.5; // uninformative prior for untested tools
  return clamp01(tool.successCount / tool.usageCount);
}

// --- Math utilities ---

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ---------------------------------------------------------------------------
// Fitness function for DynamicTool
// ---------------------------------------------------------------------------

/**
 * Scalar fitness combining reliability, activity level, and creation recency.
 *
 *   fitness = 0.6 * successRate
 *           + 0.3 * log1p(usageCount) / log1p(1000)   [normalised activity]
 *           + 0.1 * (1 - ageDecay)                     [slight recency bonus]
 *
 * The 0.5 prior on successRate ensures untested tools enter the archive
 * rather than being silently excluded, while their low activity score
 * naturally gives them below-average fitness until exercised.
 */
export function toolFitness(tool: DynamicTool): number {
  const successRate = tool.usageCount > 0 ? tool.successCount / tool.usageCount : 0.5;

  const activityNorm = Math.log1p(tool.usageCount) / Math.log1p(1_000);

  const ageMs = Date.now() - tool.createdAt.getTime();
  const ageDays = ageMs / 86_400_000;
  // Decay window of 180 days — penalises very old unused tools gently
  const ageDecay = clamp01(ageDays / 180);

  return clamp01(0.6 * successRate + 0.3 * activityNorm + 0.1 * (1 - ageDecay));
}

// ---------------------------------------------------------------------------
// Integration — canonical archive for the tool factory
// ---------------------------------------------------------------------------

/**
 * Create the standard 4-dimensional MAP-Elites archive used by the
 * tool factory.  Each dimension aligns with the describeToolBehavior() output.
 *
 *   complexity  x 5 bins
 *   domain      x 8 bins
 *   io-type     x 4 bins
 *   reliability x 5 bins
 *
 * Total theoretical grid size: 5 x 8 x 4 x 5 = 800 cells.
 * In practice only a fraction will be occupied, giving the coverage()
 * metric a meaningful dynamic range.
 */
export function createToolArchive(
  config?: Partial<MAPElitesConfig>,
): MAPElitesArchive<DynamicTool> {
  return new MAPElitesArchive<DynamicTool>(
    [
      { name: 'complexity',  bins: 5, min: 0, max: 1 },
      { name: 'domain',      bins: 8, min: 0, max: 1 },
      { name: 'io-type',     bins: 4, min: 0, max: 1 },
      { name: 'reliability', bins: 5, min: 0, max: 1 },
    ],
    config,
  );
}
