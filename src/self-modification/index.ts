/**
 * Genesis Self-Modification Module
 *
 * Radical self-modification with formal verification.
 * Enables Genesis to modify its own core, including decision-making.
 *
 * Architecture:
 * - TCB (Trusted Computing Base): Immutable core that verifies changes
 * - Darwin-Gödel Engine: Applies and verifies modifications
 * - Invariant System: Ensures core properties survive modification
 */

export {
  DarwinGodelEngine,
  getDarwinGodelEngine,
  resetDarwinGodelEngine,
  Modification,
  ModificationPlan,
  VerificationResult,
  ApplyResult,
  DarwinGodelConfig,
} from './darwin-godel.js';

// v7.17: Self-Improvement Cycle
export {
  SelfImprovementEngine,
  getSelfImprovementEngine,
  resetSelfImprovementEngine,
  createSelfImprovementEngine,
  SystemMetrics,
  ImprovementOpportunity,
  ImprovementResult,
  SelfImprovementConfig,
  DEFAULT_IMPROVEMENT_CONFIG,
} from './self-improvement.js';

// v8.4: Self-Model Generator
export {
  SelfModelGenerator,
  getSelfModelGenerator,
  generateSelfModel,
  saveSelfModel,
  SelfModel,
  ModuleInfo,
  MetricInfo,
  PatternInfo,
  // v8.5: MCP Memory persistence
  selfModelToMemoryGraph,
  persistSelfModelToMemory,
  loadSelfModelGraph,
  MemoryEntity,
  MemoryRelation,
} from './self-model.js';

// v8.5: Code RAG (Retrieval-Augmented Generation)
export {
  CodeRAG,
  getCodeRAG,
  resetCodeRAG,
  CodeChunker,
  CodeChunk,
  CodeIndex,
  QueryResult,
  CodeRAGConfig,
} from './code-rag.js';

// v10.1: Code Quality Analyzer
export {
  CodeQualityAnalyzer,
  createCodeQualityAnalyzer,
  runCodeQualityAnalysis,
  storeAnalysisInMemory,
  // MCP Memory integration
  codeQualityToMemoryGraph,
  persistCodeQualityToMemory,
  loadCodeQualityGraph,
  // Types
  CodeQualityReport,
  TestCoverageResult,
  TypeSafetyIssue,
  TodoItem,
  FileComplexity,
  Recommendation,
  CodeQualityConfig,
} from './code-quality-analyzer.js';

// Re-export invariant types for convenience
export {
  invariantRegistry,
  InvariantRegistry,
  InvariantContext,
  InvariantResult,
  InvariantDefinition,
  InvariantChecker,
} from '../kernel/invariants.js';
