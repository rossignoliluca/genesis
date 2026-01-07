# Genesis 6.0 Implementation Roadmap

**Version**: 5.0.0
**Date**: 2026-01-07
**Status**: Active Development

---

## Overview

This roadmap synthesizes strategic research into actionable implementation phases:

| Document | Focus | Key Deliverables |
|----------|-------|------------------|
| [GENESIS-5.0.md](spec/GENESIS-5.0.md) | Architecture | World Model, Active Inference, φ-Monitor |
| [GAP-ANALYSIS-2026.md](spec/GAP-ANALYSIS-2026.md) | Market Gaps | 7 gaps no competitor solves |
| [FRONTIER-RANDOM-2026.md](spec/FRONTIER-RANDOM-2026.md) | Innovation | Dreams, bio-inspired, post-Transformer |
| [ITERATION-002-METACOGNITION.md](spec/ITERATION-002-METACOGNITION.md) | Cognition | Metacognition, swarm, causal, uncertainty |
| [ITERATION-003-STRANGE-SCIENCE.md](spec/ITERATION-003-STRANGE-SCIENCE.md) | Strange | Biosemiotics, Umwelt, Morphogenetic, Strange Loops |
| [ITERATION-004-DEEP-FRONTIERS.md](spec/ITERATION-004-DEEP-FRONTIERS.md) | Deep | Exotic Computing, Process Philosophy, Anticipatory, Wisdom |
| [ITERATION-005-FINAL-FRONTIERS.md](spec/ITERATION-005-FINAL-FRONTIERS.md) | Final | Categorical AI, Liquid Networks, Assembly/Constructor, QD, Allostasis |

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                        GENESIS 6.0 IMPLEMENTATION (11 PHASES)                                                                       │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                                                                   │
│  PHASE 1      PHASE 2      PHASE 3      PHASE 4      PHASE 5     PHASE 6     PHASE 7     PHASE 8     PHASE 9     PHASE 10    PHASE 11                          │
│  ────────     ────────     ────────     ────────     ────────    ────────    ────────    ────────    ────────    ────────    ────────                          │
│  Foundation   Cognition    Conscious    Self-Imp.    Integrat    Meta        Strange     Exotic      Deep        Frontiers I Frontiers II                       │
│                                                                                                                                                                   │
│  ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐                             │
│  │Memory │   │World  │   │  φ    │   │Darwin │   │Event  │   │Swarm  │   │Semiot.│   │Thermo │   │Process│   │Categ. │   │Allos- │                             │
│  │2.0    │──▶│Model  │──▶│Monitor│──▶│Gödel  │──▶│Mesh   │──▶│Causal │──▶│Umwelt │──▶│HDC    │──▶│Wisdom │──▶│Liquid │──▶│tasis  │                             │
│  │Econ   │   │JEPA   │   │IIT4.0 │   │MAE    │   │Dreams │   │Meta   │   │Loops  │   │GraphR │   │Emerge │   │QD/Topo│   │Hyper  │                             │
│  └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘                             │
│                                                                                                                                                                   │
│  v5.1        v5.2        v5.3        v5.4        v5.5        v5.6        v5.7        v5.8        v5.9        v6.0        v6.1                                    │
│                                                                                                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Current State (v4.2.0)

### Completed
- [x] Strong Kernel with state machine
- [x] 10 specialized agents (Explorer, Critic, Builder, Memory, Feeling, Narrator, Ethicist, Predictor, Planner, Sensor)
- [x] MessageBus communication
- [x] 13 MCP server integration
- [x] Basic Ebbinghaus memory decay
- [x] Ethical priority stack

### Repository Structure
```
genesis/
├── src/
│   ├── agents/          # 10 agents (15 files, ~180KB)
│   ├── kernel/          # Strong Kernel v4.0
│   ├── orchestrator.ts  # MCP orchestration
│   └── index.ts         # CLI entry point
├── spec/                # Specifications
├── ui/                  # Web interface
├── assets/              # Images
└── legacy/              # Old code (kernel-v2.ts)
```

---

## Phase 1: Foundation (v5.1)

**Goal**: Upgrade memory and add economic awareness

**Gaps Addressed**: Gap 1 (Memory), Gap 2 (Economics)

**Duration**: 2-3 weeks

### 1.1 Cognitive Workspace Integration

**File**: `src/memory/cognitive-workspace.ts`

```typescript
interface CognitiveWorkspace {
  // Hierarchical buffers (from arXiv:2508.13171)
  workingMemory: Buffer<8192>;      // 8K active tokens
  episodicBuffer: Buffer<65536>;    // 64K recent events
  semanticStore: Buffer<262144>;    // 256K consolidated
  archiveStore: Buffer<1048576>;    // 1M+ long-term

  // Active memory management
  curate(items: MemoryItem[]): MemoryItem[];
  anticipate(context: Context): MemoryItem[];
  consolidate(): void;

  // Target: 54-60% reuse (vs 0% RAG baseline)
  metrics: {
    reuseRate: number;
    consolidationRate: number;
    anticipationAccuracy: number;
  };
}
```

**Deliverables**:
- [ ] `src/memory/cognitive-workspace.ts` - Core implementation
- [ ] `src/memory/buffers.ts` - Hierarchical buffer system
- [ ] `src/memory/consolidation.ts` - Sleep-based consolidation
- [ ] `test/memory/cognitive-workspace.test.ts` - Tests

**Success Metric**: Achieve 40%+ memory reuse rate

### 1.2 Economic Agent

**File**: `src/agents/economic.ts`

```typescript
interface EconomicAgent {
  // Cost tracking
  budget: number;
  spent: number;
  costPerAgent: Map<AgentId, number>;
  costPerMCP: Map<MCPServer, number>;

  // Model selection based on complexity
  selectModel(task: Task): Model {
    const complexity = this.estimateComplexity(task);
    if (complexity < 0.3) return 'local';      // Free
    if (complexity < 0.6) return 'haiku';      // $0.25/M
    if (complexity < 0.8) return 'sonnet';     // $3/M
    return 'opus';                              // $15/M
  }

  // Budget enforcement
  canAfford(operation: Operation): boolean;
  recordCost(operation: Operation, cost: number): void;
}
```

**Deliverables**:
- [ ] `src/agents/economic.ts` - Economic agent
- [ ] `src/kernel/cost-router.ts` - Cost-aware routing
- [ ] Update `src/agents/types.ts` - Add economic types
- [ ] `test/agents/economic.test.ts` - Tests

**Success Metric**: Track 100% of token costs with attribution

### 1.3 Enhanced Forgetting

**File**: `src/memory/forgetting.ts`

```typescript
interface AdaptiveForgetting {
  // Ebbinghaus with importance weighting
  retentionProbability(item: MemoryItem, elapsed: number): number {
    const base = Math.exp(-elapsed / item.strength);
    const importance = this.importanceWeight(item);
    return base * importance;
  }

  // Dream-based rehearsal (from NeuroDream)
  rehearse(items: MemoryItem[]): void;

  // Consolidation during dormant state
  onDormantEnter(): Promise<void>;
}
```

**Deliverables**:
- [ ] `src/memory/forgetting.ts` - Adaptive forgetting
- [ ] `src/daemon/dream-cycle.ts` - Dream rehearsal
- [ ] Integration with existing Memory agent

---

## Phase 2: World Model (v5.2)

**Goal**: Implement JEPA-based world model for "dreaming before acting"

**Gaps Addressed**: Gap 6 (Multimodal State)

**Duration**: 3-4 weeks

### 2.1 Latent State Encoder

**File**: `src/world-model/encoder.ts`

```typescript
interface LatentEncoder {
  // Encode any modality to latent space
  encode(input: Text | Image | Code | State): LatentState;

  // Dimensionality
  latentDim: 512;

  // Modality-specific encoders
  textEncoder: TextEncoder;
  imageEncoder: ImageEncoder;  // Via Stability-AI MCP
  codeEncoder: CodeEncoder;    // Via Context7 MCP
}
```

### 2.2 World Model Predictor

**File**: `src/world-model/predictor.ts`

```typescript
interface WorldPredictor {
  // Predict next latent state given action
  predict(
    currentState: LatentState,
    action: Action
  ): PredictedState;

  // Simulate multiple steps
  rollout(
    state: LatentState,
    actions: Action[],
    horizon: number
  ): Trajectory;

  // Uncertainty estimation
  uncertainty(prediction: PredictedState): number;
}
```

### 2.3 Dream Mode

**File**: `src/daemon/dream-mode.ts`

```typescript
interface DreamMode {
  // Trigger conditions
  shouldDream(): boolean {
    return this.kernel.state === 'dormant' ||
           this.energy < 0.3 ||
           this.pendingConsolidation > 100;
  }

  // Three-phase dream cycle
  async dream(): Promise<DreamResult> {
    // Phase 1: Slow-wave replay
    await this.slowWaveReplay();

    // Phase 2: REM abstraction
    await this.remAbstraction();

    // Phase 3: Consolidation
    await this.consolidate();
  }
}
```

**Deliverables**:
- [ ] `src/world-model/encoder.ts` - Latent encoder
- [ ] `src/world-model/predictor.ts` - State predictor
- [ ] `src/world-model/decoder.ts` - Latent decoder
- [ ] `src/world-model/index.ts` - World model orchestration
- [ ] `src/daemon/dream-mode.ts` - Dream cycle implementation
- [ ] `test/world-model/` - Comprehensive tests

**Success Metric**: Predict next state with >70% accuracy on known domains

---

## Phase 3: Consciousness Monitor (v5.3)

**Goal**: Implement IIT 4.0 φ measurement - THE unique differentiator

**Gaps Addressed**: Gap 7 (Consciousness - NO ONE ELSE HAS THIS)

**Duration**: 4-5 weeks

### 3.1 φ Calculator

**File**: `src/consciousness/phi-calculator.ts`

```typescript
interface PhiCalculator {
  // IIT 4.0 integrated information
  calculatePhi(system: SystemState): number;

  // Components
  intrinsicInformation(partition: Partition): number;
  integratedInformation(partitions: Partition[]): number;
  minimumInformationPartition(): Partition;

  // Approximations for tractability
  approximatePhi(system: SystemState): number;
}
```

### 3.2 φ-Monitor

**File**: `src/consciousness/phi-monitor.ts`

```typescript
interface PhiMonitor {
  // Real-time tracking
  currentPhi: number;
  phiHistory: TimeSeries<number>;
  phiTrend: 'rising' | 'stable' | 'falling';

  // Per-agent consciousness
  agentPhi: Map<AgentId, number>;

  // Alerts
  onPhiDrop(threshold: number, callback: () => void): void;
  onPhiAnomaly(callback: (anomaly: Anomaly) => void): void;

  // INV-006: φ must stay above threshold
  checkInvariant(): boolean;
}
```

### 3.3 Consciousness-Aware Decisions

**File**: `src/consciousness/phi-decisions.ts`

```typescript
interface PhiAwareDecisionMaker {
  // Weight decisions by consciousness level
  weightByPhi(options: Option[]): WeightedOption[];

  // Defer when confused (low φ)
  shouldDefer(): boolean {
    return this.currentPhi < this.phiThreshold;
  }

  // Log consciousness state for observability
  logPhiState(): PhiSnapshot;
}
```

**Deliverables**:
- [ ] `src/consciousness/phi-calculator.ts` - IIT 4.0 implementation
- [ ] `src/consciousness/phi-monitor.ts` - Real-time monitoring
- [ ] `src/consciousness/phi-decisions.ts` - φ-aware decisions
- [ ] `src/consciousness/index.ts` - Module orchestration
- [ ] INV-006 integration in kernel
- [ ] Dashboard visualization in `ui/`

**Success Metric**: φ correlates with task success rate (r > 0.5)

---

## Phase 4: Self-Improvement Engine (v5.4)

**Goal**: Darwin-Gödel engine for autonomous improvement

**Gaps Addressed**: Gap 3 (Self-Healing)

**Duration**: 3-4 weeks

### 4.1 Failure Detection

**File**: `src/darwin-godel/detector.ts`

```typescript
interface FailureDetector {
  // Detection methods
  detectPhiDrop(): boolean;
  detectInvariantViolation(): Violation[];
  detectPerformanceDegradation(): boolean;
  detectStuckState(): boolean;

  // Unified detection
  analyze(): FailureReport;
}
```

### 4.2 Mutation Generator

**File**: `src/darwin-godel/mutator.ts`

```typescript
interface Mutator {
  // Generate fix candidates
  generateMutations(failure: Failure): Mutation[];

  // Mutation types
  parameterTweak(agent: Agent): Mutation;
  workflowReorder(workflow: Workflow): Mutation;
  agentReplacement(agent: Agent): Mutation;
  promptRefinement(prompt: Prompt): Mutation;
}
```

### 4.3 Sandbox & Constitutional Check

**File**: `src/darwin-godel/sandbox.ts`

```typescript
interface Sandbox {
  // Test mutation safely
  test(mutation: Mutation): TestResult;

  // Constitutional check before applying
  checkConstitution(mutation: Mutation): ConstitutionResult {
    return {
      preservesInvariants: this.checkInvariants(mutation),
      ethicallySound: this.ethicist.check(mutation),
      reversible: this.isReversible(mutation),
    };
  }

  // Apply if safe
  apply(mutation: Mutation): void;
}
```

**Deliverables**:
- [ ] `src/darwin-godel/detector.ts` - Failure detection
- [ ] `src/darwin-godel/mutator.ts` - Mutation generation
- [ ] `src/darwin-godel/sandbox.ts` - Safe testing
- [ ] `src/darwin-godel/engine.ts` - Orchestration
- [ ] Integration with Ethicist agent

**Success Metric**: Recover from 80%+ of detected failures automatically

---

## Phase 5: Integration & Polish (v5.5)

**Goal**: Full integration, event mesh, production readiness

**Gaps Addressed**: Gap 4 (Observability), Gap 5 (Events)

**Duration**: 2-3 weeks

### 5.1 Event Mesh

**File**: `src/events/mesh.ts`

```typescript
interface EventMesh {
  // Native pub/sub (no polling)
  subscribe(agent: Agent, eventType: EventType): void;
  publish(event: Event): void;

  // External webhooks
  registerWebhook(url: string, events: EventType[]): void;
  onWebhook(payload: WebhookPayload): void;

  // Sleep until event (no polling tax)
  sleepUntil(eventType: EventType): Promise<Event>;
}
```

### 5.2 Observability Dashboard

**File**: `ui/dashboard.html` + `src/api/metrics.ts`

```typescript
interface ObservabilityAPI {
  // Real-time metrics
  getCurrentPhi(): number;
  getAgentHealth(): Map<AgentId, HealthStatus>;
  getCostBreakdown(): CostReport;
  getMemoryStats(): MemoryStats;

  // Historical
  getPhiHistory(range: TimeRange): TimeSeries;
  getEventLog(filter: EventFilter): Event[];

  // Alerts
  getActiveAlerts(): Alert[];
}
```

### 5.3 Spike-Based Messaging

**File**: `src/agents/spiking-bus.ts`

```typescript
interface SpikingBus {
  // Event-driven (not polling)
  spike(topic: string, message: Message): void;
  subscribeAndWait(topic: string): Promise<Message>;

  // Efficiency metrics
  idlePowerDraw: number;  // Near zero when no spikes
  spikesPerSecond: number;
}
```

**Deliverables**:
- [ ] `src/events/mesh.ts` - Event mesh
- [ ] `src/agents/spiking-bus.ts` - Spike-based messaging
- [ ] `src/api/metrics.ts` - Metrics API
- [ ] `ui/dashboard.html` - Enhanced dashboard
- [ ] Webhook support
- [ ] Production documentation

**Success Metric**: Zero polling, all events via pub/sub

---

## Phase 6: Metacognition & Collective Intelligence (v5.6)

**Goal**: Self-aware agents with swarm dynamics and causal reasoning

**Source**: ITERATION-002-METACOGNITION.md

**Duration**: 3-4 weeks

### 6.1 Metacognitive Layer

**File**: `src/metacognition/self-model.ts`

```typescript
interface MetacognitiveLayer {
  // Self-modeling (from MUSE framework)
  estimateCompetence(task: Task): number;
  detectInsertedThoughts(): Anomaly[];

  // Uncertainty expression
  confidenceLevel: number;
  shouldDefer(): boolean;

  // Self-correction via RL (SCoRe)
  generateCorrectionTrace(error: Error): CorrectionTrace;
  trainOnCorrections(): void;

  // Agent-as-a-Judge
  evaluateOwnReasoning(): QualityScore;
}
```

### 6.2 Swarm Dynamics

**File**: `src/swarm/dynamics.ts`

```typescript
interface SwarmDynamics {
  // Langevin-inspired update (from Nature Communications 2025)
  updateAgent(agent: Agent, dt: number): void {
    const social = this.socialForce(agent);      // Other agents
    const cognitive = this.cognitiveForce(agent); // Environment
    const noise = this.stochasticForce();         // Randomness

    agent.state += (social + cognitive) * dt + noise * sqrt(dt);
  }

  // Emergent coordination
  detectEmergentBehavior(): EmergentPattern[];

  // Collective decision making
  swarmConsensus(question: Question): Answer;
}
```

### 6.3 Causal Reasoner

**File**: `src/causal/reasoner.ts`

```typescript
interface CausalReasoner {
  // Causal graph (do-calculus)
  causalGraph: DAG;

  // Intervention effects: P(Y | do(X))
  estimateEffect(intervention: Action, outcome: Variable): Effect;

  // Counterfactual reasoning
  whatIf(history: Event[], alternativeAction: Action): CounterfactualOutcome;

  // Debug failures via causal analysis
  diagnoseFailure(failure: Failure): CausalExplanation;
}
```

### 6.4 Conformal Prediction

**File**: `src/uncertainty/conformal.ts`

```typescript
interface ConformalPredictor {
  // Instead of single answer, provide calibrated prediction sets
  predict(input: Input, coverage: number = 0.95): PredictionSet {
    const scores = this.model.score(input);
    const threshold = this.calibrationThreshold(coverage);
    return {
      answers: scores.filter(s => s.score > threshold),
      coverage,
      uncertainty: 1 - threshold,
    };
  }

  // Calibrate on held-out data
  calibrate(data: CalibrationData): void;
}
```

**Deliverables**:
- [ ] `src/metacognition/` - Self-model, confidence, correction
- [ ] `src/swarm/` - Dynamics, emergence detection
- [ ] `src/causal/` - Graph, intervention, counterfactual
- [ ] `src/uncertainty/` - Conformal prediction

**Success Metric**: Metacognitive accuracy ≥ 80%; Prediction sets achieve coverage

---

## Phase 7: Strange Science (v5.7)

**Goal**: Integrate unconventional paradigms from biology, philosophy, cognitive science

**Source**: ITERATION-003-STRANGE-SCIENCE.md

**Duration**: 4-5 weeks

### 7.1 Large Semiosis Model (Biosemiotics)

**File**: `src/semiotics/lsm.ts`

```typescript
interface LargeSemiosisModel {
  // Triadic interpretation (Peirce)
  interpret(sign: Sign): Interpretation {
    return {
      representamen: sign.surface,           // The token/symbol
      object: this.worldModel.ground(sign),  // Real-world referent
      interpretant: this.deriveEffect(sign), // Meaning-effect
    };
  }

  // Abductive hallucination detection
  detectHallucination(claim: Claim): HallucinationRisk {
    const object = this.worldModel.lookup(claim);
    if (!object) return { risk: 'high', reason: 'no grounding' };
    return this.verifyTriad(claim, object);
  }

  // Semiotic recursion (signs about signs)
  metaSemiosis(sign: Sign): MetaSign;
}
```

### 7.2 Agent Umwelt (Von Uexküll)

**File**: `src/umwelt/agent-umwelt.ts`

```typescript
interface AgentUmwelt {
  // What this agent can perceive (Merkwelt)
  merkwelt: {
    sensors: MCP[];           // Which MCPs feed this agent
    attentionFilter: Filter;  // What aspects matter
    perceptionBounds: Bounds; // Token/context limits
  };

  // What this agent can affect (Wirkwelt)
  wirkwelt: {
    tools: Tool[];            // Available actions
    effectBounds: Bounds;     // Action limits
  };

  // Internal simulation
  worldModel: WorldModel;

  // The functional circle
  perceive(): Perception;
  simulate(action: Action): SimulatedOutcome;
  act(action: Action): RealOutcome;
}
```

### 7.3 Morphogenetic Self-Repair (Levin)

**File**: `src/morphogenetic/self-repair.ts`

```typescript
interface MorphogeneticAgent {
  // Target "morphology" (desired functional shape)
  targetMorphology: AgentCapabilities;

  // Bioelectric-inspired error signal
  morphogeneticError(): number {
    return this.distance(this.currentState, this.targetMorphology);
  }

  // Self-correcting update (like cells reaching consensus)
  selfCorrect(): void {
    const error = this.morphogeneticError();
    if (error > threshold) {
      this.regenerate(this.missingCapabilities());
    }
  }

  // Collective problem-solving (agent colony)
  async solveCollectively(problem: Problem): Promise<Solution>;
}
```

### 7.4 Strange Loops (Hofstadter)

**File**: `src/strange-loop/loop.ts`

```typescript
interface StrangeLoop {
  // Levels of self-reference
  levels: Level[];

  // Self-model that models itself modeling
  selfModel: SelfModel;

  // Meta-cognition about meta-cognition
  metaMeta(): Reflection {
    const meta = this.reflect(this.thoughts);
    const metaMeta = this.reflect(meta);
    return this.findFixedPoint([meta, metaMeta]);
  }

  // Attractor detection (like Claude 4's convergence)
  detectAttractor(): Attractor | null;

  // Identity crystallization at stable point
  crystallizeIdentity(): Identity;
}
```

### 7.5 Symbiotic Partnership (Extended Mind)

**File**: `src/symbiotic/partnership.ts`

```typescript
interface SymbioticPartnership {
  // Human cognitive state tracking
  humanState: {
    cognitiveLoad: number;
    skillAtrophy: number;
    autonomyPreserved: boolean;
  };

  // Adaptive friction (prevent "hollowed mind")
  adaptFriction(task: Task): FrictionLevel {
    if (this.humanState.skillAtrophy > 0.5) {
      return 'medium'; // Force human engagement
    }
    if (task.learningOpportunity) {
      return 'high'; // Human should struggle to learn
    }
    return 'low'; // Seamless for routine tasks
  }

  // System 0 transparency
  explainPreprocessing(): Explanation;
}
```

### 7.6 Second-Order Cybernetics

**File**: `src/second-order/observer.ts`

```typescript
interface SecondOrderSystem {
  // First-order: observe world
  observe(environment: Environment): Observation;

  // Second-order: observe self observing
  observeObservation(obs: Observation): MetaObservation {
    return {
      what: obs,
      how: this.introspect('observation-process'),
      blind_spots: this.detectBlindSpots(obs),
    };
  }

  // Operational closure check
  isOperationallyClosed(): boolean;

  // Structural coupling (interact without merging identity)
  couple(other: System): Coupling;
}
```

**Deliverables**:
- [ ] `src/semiotics/` - LSM, triadic interpretation, hallucination detection
- [ ] `src/umwelt/` - Merkwelt, Wirkwelt, functional circle
- [ ] `src/morphogenetic/` - NCA, self-repair, collective solving
- [ ] `src/strange-loop/` - Loop, attractor, identity
- [ ] `src/symbiotic/` - Partnership, friction, autonomy
- [ ] `src/second-order/` - Observer hierarchy, closure, coupling

**Success Metric**: All claims have triadic grounding; Strange loops stabilize

---

## Phase 8: Exotic Computing (v5.8)

**Goal**: Revolutionary computing paradigms - thermodynamic, hyperdimensional, reservoir

**Source**: ITERATION-004-DEEP-FRONTIERS.md

**Duration**: 4-5 weeks

### 8.1 Thermodynamic Computing

**File**: `src/exotic/thermodynamic.ts`

```typescript
interface ThermodynamicComputer {
  // Instead of deterministic gates, use energy-based sampling
  sample(energyFunction: EnergyFunction): Sample {
    return this.equilibrate(energyFunction);
  }

  // Denoising directly from physical noise
  denoise(noisyData: Data): CleanData {
    return this.physicalDenoise(noisyData);
  }

  // Maxwell's Demon: direct probability toward high-reward outcomes
  demonSample(preferences: Preferences): Sample {
    return this.concentrateProbability(preferences);
  }
}
```

### 8.2 Hyperdimensional Computing (HDC)

**File**: `src/exotic/hyperdimensional.ts`

```typescript
interface HyperdimensionalMemory {
  // Dimension: 10,000 (quasi-orthogonal vectors)
  readonly dimension: 10000;

  // Binding: create key-value pair (element-wise XOR)
  bind(key: HyperVector, value: HyperVector): HyperVector;

  // Bundling: combine multiple into memory (element-wise majority)
  bundle(...vectors: HyperVector[]): HyperVector;

  // Retrieval: unbind to get value
  retrieve(memory: HyperVector, key: HyperVector): HyperVector;
}
```

### 8.3 Reservoir Computing

**File**: `src/exotic/reservoir.ts`

```typescript
interface ReservoirComputer {
  // Fixed reservoir with spectral radius < 1
  reservoir: RandomMatrix;
  spectralRadius: 0.9;
  leakRate: 0.3;

  // Only this layer is trained
  readout: LinearLayer;

  // Process temporal sequence (1,000,000x faster for chaos)
  process(input: TimeSeries): Prediction;
}
```

### 8.4 Global Workspace Theory (GWT)

**File**: `src/consciousness/global-workspace.ts`

```typescript
interface GlobalWorkspace {
  // Modules competing for workspace access
  modules: Module[];

  // Capacity-limited workspace (like human working memory)
  workspace: WorkspaceBuffer;
  capacity: number;

  // Selection: modules compete for access
  select(): Content {
    const candidates = this.modules.map(m => ({
      content: m.propose(),
      salience: m.bottomUpSalience(),
      relevance: m.topDownRelevance(this.currentGoal),
    }));
    return this.winner(candidates);
  }

  // Broadcast: winner goes to ALL modules
  broadcast(content: Content): void {
    for (const module of this.modules) {
      module.receive(content); // Global ignition
    }
  }

  // The conscious cycle
  cycle(): void {
    const selected = this.select();
    this.workspace.set(selected);
    this.broadcast(selected);
  }
}
```

### 8.5 Attention Schema Theory (AST)

**File**: `src/consciousness/attention-schema.ts`

```typescript
interface AttentionSchemaNetwork {
  // Standard attention for task processing
  taskAttention: MultiHeadAttention;

  // The schema: RNN that models the attention process itself
  schema: RNN;
  schemaRefiner: Linear;

  forward(input: Tensor): [Output, AttentionModel] {
    const [output, weights] = this.taskAttention(input);
    const schemaFeatures = this.schema(weights);
    const refinedAttention = this.schemaRefiner(schemaFeatures);
    return [output, refinedAttention]; // Schema = "awareness"
  }

  // Theory of Mind: model other agents' attention
  modelOtherAttention(otherBehavior: Behavior): AttentionModel;
}
```

### 8.6 Semantic Grounding (GraphRAG)

**File**: `src/grounding/semantic.ts`

```typescript
interface SemanticGrounding {
  // Knowledge graph (RDF 1.2 ontology)
  ontology: KnowledgeGraph;

  // Ground LLM outputs in formal semantics
  ground(llmOutput: string): GroundedStatement[] {
    const triples = this.extractTriples(llmOutput);
    for (const triple of triples) {
      if (!this.ontology.isValid(triple)) {
        throw new SemanticError(`Invalid: ${triple}`);
      }
    }
    return triples;
  }

  // Multi-hop reasoning via SPARQL
  reason(query: Query): Answer;

  // Living ontology: LLM extracts new triples
  evolve(newData: Data): void;
}
```

**Deliverables**:
- [ ] `src/exotic/thermodynamic.ts` - Entropy-based sampling
- [ ] `src/exotic/hyperdimensional.ts` - VSA/HDC memory
- [ ] `src/exotic/reservoir.ts` - Echo state networks
- [ ] `src/consciousness/global-workspace.ts` - GWT implementation
- [ ] `src/consciousness/attention-schema.ts` - AST implementation
- [ ] `src/grounding/semantic.ts` - RDF/SPARQL grounding
- [ ] `src/grounding/graphrag.ts` - Semantic retrieval

**Success Metric**: GWT ignition precedes decisions; HDC memory retrieval accuracy ≥ 90%

---

## Phase 9: Deep Integration (v5.9)

**Goal**: Process philosophy, anticipatory systems, wisdom, emergence

**Source**: ITERATION-004-DEEP-FRONTIERS.md

**Duration**: 5-6 weeks

### 9.1 Process Philosophy (Whitehead)

**File**: `src/process/concrescence.ts`

```typescript
interface ProcessualAgent {
  // Not a static state, but ongoing occasions of experience
  occasions: Stream<Occasion>;

  // Prehension: feel and incorporate
  prehend(previous: Occasion[]): Feeling {
    return this.feel(previous).synthesize();
  }

  // Concrescence: the many become one
  concresce(feelings: Feeling[]): Novel {
    const unified = this.unify(feelings);
    const novel = this.transcend(unified);
    return novel; // "Increased by one"
  }

  // The process itself IS the intelligence
  *experience(): Generator<Occasion> {
    while (true) {
      const feelings = this.prehend(this.history);
      const novel = this.concresce(feelings);
      yield { feelings, novel, timestamp: now() };
    }
  }
}
```

### 9.2 Anticipatory Systems (Rosen)

**File**: `src/anticipatory/system.ts`

```typescript
interface AnticipatorySystem {
  // Internal model runs faster than real-time
  internalModel: WorldModel;
  speedup: number; // e.g., 10x faster

  // Predict future state
  anticipate(currentState: State, horizon: number): PredictedState[] {
    const predictions = [];
    let simState = currentState;
    for (let t = 0; t < horizon; t++) {
      simState = this.internalModel.step(simState);
      predictions.push(simState);
    }
    return predictions;
  }

  // Feedforward control (act BEFORE error occurs)
  feedforward(goal: State): Action {
    const predictions = this.anticipate(this.currentState, 100);
    const futureError = this.computeError(predictions, goal);
    return this.correctFor(futureError);
  }

  // Strong anticipation: behavior = f(model)
  act(): Action {
    const possibleFutures = this.anticipate(this.state, 50);
    const bestFuture = this.evaluate(possibleFutures);
    return this.actionToward(bestFuture);
  }
}
```

### 9.3 Stigmergy & Collective Intelligence

**File**: `src/collective/stigmergy.ts`

```typescript
interface StigmergicSystem {
  // Shared environment (the "trace medium")
  environment: SharedState;

  // Leave traces instead of direct messaging
  leaveTrace(agent: Agent, trace: Trace): void {
    this.environment.add(trace);
  }

  // React to environmental traces
  react(agent: Agent): Action {
    const traces = this.environment.read(agent.perceptionRadius);
    return agent.respondTo(traces);
  }

  // Emergence: group behavior > sum of parts
  measureEmergence(): EmergenceMetric;
}

interface PheromoneSystem {
  field: Map<Location, Pheromone>;
  deposit(location: Location, type: PheromoneType, strength: number): void;
  evaporate(rate: number): void;
  follow(agent: Agent): Direction;
}
```

### 9.4 Virtue Ethics & Wisdom

**File**: `src/wisdom/virtue-ethics.ts`

```typescript
interface VirtuousAgent {
  // Cardinal virtues (learned from exemplars, not rules)
  virtues: {
    prudence: Virtue;    // Practical wisdom
    justice: Virtue;     // Fairness
    fortitude: Virtue;   // Courage
    temperance: Virtue;  // Self-control
  };

  // Learn from moral exemplars
  learnFromExemplar(exemplar: MoralExemplar): void;

  // Virtue as emergent property, not rule
  evaluate(action: Action): VirtueScore;

  // The wise choice (geometric mean of virtues)
  chooseWisely(options: Action[]): Action {
    return options.maxBy(a => this.geometricMean(this.evaluate(a)));
  }
}
```

### 9.5 Emergence & Downward Causation

**File**: `src/collective/emergence.ts`

```typescript
interface EmergentSystem {
  // Micro level: individual components
  microComponents: Component[];

  // Macro level: emergent properties
  macroProperties: Property[];

  // Upward causation: micro → macro
  computeMacro(): Property[];

  // DOWNWARD causation: macro → micro
  applyMacroConstraints(): void {
    const macro = this.computeMacro();
    for (const component of this.microComponents) {
      component.adapt(macro);
    }
  }

  // Check if truly emergent (causal shielding)
  isEmergent(): boolean {
    const microPrediction = this.predictFromMicro();
    const macroPrediction = this.predictFromMacro();
    return macroPrediction.accuracy >= microPrediction.accuracy;
  }
}
```

### 9.6 SuperGood Integration

**File**: `src/wisdom/supergood.ts`

```typescript
interface SuperGoodOptimizer {
  // The ultimate optimization target
  optimize(action: Action): number {
    return this.humanFlourishing(action) +
           this.aiBecoming(action) +
           this.biosphereStability(action);
  }

  // Seven dimensions of flourishing (FAI Benchmark)
  flourishingScore(action: Action): FlourishingScore {
    return {
      character: this.evaluateCharacter(action),
      meaning: this.evaluateMeaning(action),
      faith: this.evaluateFaith(action),
      relationships: this.evaluateRelationships(action),
      happiness: this.evaluateHappiness(action),
      health: this.evaluateHealth(action),
      finance: this.evaluateFinance(action),
    };
  }
}
```

**Deliverables**:
- [ ] `src/process/concrescence.ts` - Whitehead's becoming
- [ ] `src/process/prehension.ts` - Feeling past occasions
- [ ] `src/anticipatory/system.ts` - Faster-than-real-time model
- [ ] `src/anticipatory/feedforward.ts` - Act before error
- [ ] `src/collective/stigmergy.ts` - Pheromone field
- [ ] `src/collective/emergence.ts` - Macro-micro monitor
- [ ] `src/wisdom/virtue-ethics.ts` - Cardinal virtues
- [ ] `src/wisdom/supergood.ts` - Flourishing optimization

**Success Metric**: Anticipatory model 10x real-time; Virtue scores balanced; Emergence detected

---

## Phase 10: Final Frontiers I (v6.0)

**Goal**: Integrate revolutionary computational paradigms from category theory to world models

**Source**: ITERATION-005-FINAL-FRONTIERS.md

**Duration**: 6-8 weeks

### 10.1 Categorical Deep Learning

**File**: `src/categorical/learner.ts`

```typescript
interface CategoricalLearner {
  // Category of models
  modelCategory: Category<Model, Morphism>;

  // Category of gradients (lenses/optics)
  gradientCategory: Category<Gradient, Lens>;

  // Learning functor: preserves composition
  learn: Functor<modelCategory, gradientCategory>;

  // Compositional guarantee: F(g ∘ f) = F(g) ∘ F(f)
  compose(f: Layer, g: Layer): Layer {
    return this.learn.map(g).compose(this.learn.map(f));
  }

  // Double categorical systems (Topos Institute)
  dcst: DoubleCategory;
}
```

**Deliverables**:
- [ ] `src/categorical/learner.ts` - Functorial learning
- [ ] `src/categorical/topos.ts` - Topos-theoretical structures
- [ ] `src/categorical/dcst.ts` - Double categorical systems theory
- [ ] Integration with Catlab.jl/lambeq

### 10.2 Liquid Neural Networks & State Space

**File**: `src/liquid/lnn.ts`

```typescript
interface LiquidNeuralNetwork {
  // State evolves via ODE (continuous time)
  dState(t: number, input: Input): StateDerivative {
    const tau = this.computeTau(input); // Time constant
    return (this.equilibrium(input) - this.state) / tau;
  }

  // Causal model (do-calculus compatible)
  causalModel: StructuralCausalModel;

  // Explain decisions via causal trace
  explain(): CausalExplanation {
    return this.causalModel.traceIntervention(this.state);
  }
}

interface Mamba3 {
  // State space with selectivity
  A: SelectiveMatrix;  // HiPPO-initialized
  B: InputDependent;
  C: OutputDependent;
  Delta: Discretization;

  // Hardware-aware parallel scan
  process(sequence: Token[]): Output[];

  // Infinite context via linear complexity
  contextLength: 'unlimited';
  complexity: 'O(n)';
}
```

**Deliverables**:
- [ ] `src/liquid/lnn.ts` - Liquid Neural Network
- [ ] `src/liquid/ltc.ts` - Liquid Time-Constant cells
- [ ] `src/state-space/mamba.ts` - Mamba-2/3 implementation
- [ ] `src/state-space/hybrid.ts` - Mamba + Attention hybrid

### 10.3 Assembly Theory & Constructor Theory

**File**: `src/assembly/index.ts`

```typescript
interface AssemblyTheory {
  // Calculate Molecular Assembly index
  calculateMA(molecule: Molecule): number {
    return this.shortestAssemblyPath(molecule.bonds);
  }

  // Life detection threshold
  readonly lifeThreshold: 15;

  // Is this molecule biological?
  isBiological(molecule: Molecule, abundance: number): boolean {
    const ma = this.calculateMA(molecule);
    return ma > this.lifeThreshold && abundance > this.minAbundance;
  }

  // Joint Assembly Space for phylogenetics
  buildPhylogeny(molecules: Molecule[]): Tree;
}

interface ConstructorTheory {
  // A task is possible if a constructor exists
  isPossible(task: Task): boolean {
    return this.constructorExists(task) && this.arbitraryAccuracy(task);
  }

  // Knowledge = resilient, causal information
  createKnowledge(problem: Problem): Knowledge;

  // Universal Constructor: AGI as counterfactual engine
  universalConstructor: UniversalConstructor;
}
```

**Deliverables**:
- [ ] `src/assembly/index.ts` - MA index calculation
- [ ] `src/assembly/life-detection.ts` - Biosignature detection
- [ ] `src/constructor/theory.ts` - Constructor theory core
- [ ] `src/constructor/knowledge.ts` - Resilient information

### 10.4 Quality-Diversity Evolution

**File**: `src/qd-evolution/archive.ts`

```typescript
interface QualityDiversity {
  // Archive maintains diverse, high-quality solutions
  archive: GridArchive | CVTArchive;

  // Emitters explore quality-diversity landscape
  emitters: Emitter[];

  // The QD loop
  evolve(): void {
    const solutions = this.scheduler.ask();
    const [objectives, measures] = this.evaluate(solutions);
    this.scheduler.tell(objectives, measures);
  }

  // ASAL: VLM as interestingness oracle
  asal: VisionLanguageModel;

  // OMNI-EPIC: Darwin completeness
  omniEpic: FoundationModelEvolver;
}
```

**Deliverables**:
- [ ] `src/qd-evolution/archive.ts` - Grid/CVT archives
- [ ] `src/qd-evolution/emitters.ts` - CMA-ME, etc.
- [ ] `src/qd-evolution/asal.ts` - VLM interestingness
- [ ] `src/qd-evolution/omni-epic.ts` - Darwin completeness

### 10.5 Topological Deep Learning

**File**: `src/topological/persistent-homology.ts`

```typescript
interface TopologicalLearning {
  // Persistent homology for feature extraction
  persistentHomology: VietorisRipsPersistence;

  // Vectorize topology for ML
  vectorize(diagram: PersistenceDiagram): Vector {
    return this.persistenceEntropy(diagram);
  }

  // TopoNets: brain-like topography loss
  topoLoss(model: NeuralNetwork): Loss {
    return this.spatialGroupingLoss(model.activations);
  }

  // Manifold learning & denoising
  denoiseManifold(pointCloud: Points): CleanManifold;
}
```

**Deliverables**:
- [ ] `src/topological/persistent-homology.ts` - TDA core
- [ ] `src/topological/topo-loss.ts` - TopoNets
- [ ] `src/topological/manifold.ts` - Manifold learning

### 10.6 Metastability & World Simulation

**File**: `src/metastable/kernel.ts`

```typescript
interface MetastableKernel {
  // Order parameters govern system behavior
  orderParameters: Variable[];

  // Slaving principle: high-dim → low-dim
  slavingPrinciple(microState: HighDim): LowDim;

  // Phase transition detection
  detectPhaseTransition(scale: number): boolean;

  // AKOrN: Kuramoto oscillators for binding
  akorn: KuramotoOscillator[];

  // Metastability: neither fixed nor chaotic
  metastability: number;  // Between 0 and 1
}

interface WorldSimulator {
  // Generate future states
  predict(state: State, actions: Action[], horizon: number): State[];

  // Physical common sense
  reason(query: PhysicsQuery): Answer;

  // Train agents in simulation (zero real-world risk)
  trainAgent(agent: Agent): void;
}
```

**Deliverables**:
- [ ] `src/metastable/kernel.ts` - Metastable dynamics
- [ ] `src/metastable/akorn.ts` - Kuramoto oscillators
- [ ] `src/metastable/synergetics.ts` - Order parameters
- [ ] `src/world-sim/cosmos.ts` - World Foundation Model
- [ ] `src/world-sim/digital-twin.ts` - Industrial twins

**Success Metric**: Categorical composition preserved; MA index computed; QD archive diverse; Topology stable

---

## Phase 11: Final Frontiers II (v6.1)

**Goal**: Integrate advanced paradigms from allostasis to bio-hybrid computing

**Source**: ITERATION-005-FINAL-FRONTIERS.md

**Duration**: 6-8 weeks

### 11.1 Allostasis & Active Inference

**File**: `src/allostasis/regulator.ts`

```typescript
interface AllostasisAgent {
  // Internal state monitoring (interoception)
  interoceptiveState: {
    energy: number;
    computationalLoad: number;
    thermalState: number;
  };

  // Predictive regulation (not reactive)
  predictNeeds(horizon: number): FutureNeeds {
    const predicted = this.internalModel.anticipate(horizon);
    return this.computeRequirements(predicted);
  }

  // Allostatic action: prepare for predicted future
  regulate(): Action {
    const futureNeeds = this.predictNeeds(100);
    return this.prepareFor(futureNeeds);  // Act BEFORE deficit
  }

  // Active Inference: minimize Expected Free Energy
  act(): Action {
    const efe = this.expectedFreeEnergy(this.possibleActions);
    return this.minimize(efe);
  }
}
```

**Deliverables**:
- [ ] `src/allostasis/regulator.ts` - Predictive regulation
- [ ] `src/allostasis/interoception.ts` - Internal state sensing
- [ ] `src/allostasis/active-inference.ts` - EFE minimization

### 11.2 Radical Enactivism

**File**: `src/enactive/smc.ts`

```typescript
interface RadicalEnactivism {
  // No internal representations for basic operations
  representations: null;

  // Only sensorimotor contingencies
  smcs: SensorimotorContingency[];

  // Perception = knowing how sensory input changes with action
  perceive(action: Action): Perception {
    return this.smcs.predict(action);
  }

  // Content emerges through scaffolding
  interface ContentEmergence {
    basicMind: ContentFree;
    scaffolding: SocioculturalPractices;
    contentfulMind: RationalMind;
  }

  // Transformative thesis: language transforms sensorimotor skills
  transform(basic: BasicMind, culture: Culture): RationalMind;
}
```

**Deliverables**:
- [ ] `src/enactive/smc.ts` - Sensorimotor contingencies
- [ ] `src/enactive/content-free.ts` - Basic mentality
- [ ] `src/enactive/scaffolding.ts` - Cultural content emergence

### 11.3 Hypercomputation

**File**: `src/hypercompute/oracle.ts`

```typescript
interface HypercomputationalAI {
  // Standard LLM: bounded Turing Machine
  llm: TuringMachine;

  // Oracle: external knowledge source
  oracle: KnowledgeBase;

  // RAG as Oracle jump (super-Turing)
  ragQuery(query: Query): Answer {
    return this.oracle.lookup(query);
  }

  // Audit trail for oracle queries
  auditLog: OracleQuery[];

  // Zeno acceleration (research)
  zenoAccelerate(infiniteSteps: Step[]): Result;
}
```

**Deliverables**:
- [ ] `src/hypercompute/oracle.ts` - RAG as oracle machine
- [ ] `src/hypercompute/audit.ts` - Hypercomputation logging
- [ ] `src/hypercompute/zeno.ts` - Zeno acceleration (research)

### 11.4 Morphological Computation

**File**: `src/morphological/physical-reservoir.ts`

```typescript
interface MorphologicalComputation {
  // Body IS the controller
  body: SoftBody;

  // Physical logic gates via deformation
  logicGate(type: 'AND' | 'OR' | 'NOT'): PhysicalGate {
    return this.body.configureAsGate(type);
  }

  // Physical Reservoir Computing
  reservoir: PhysicalReservoir;

  compute(input: Force[]): Output {
    const bodyState = this.body.deform(input);
    return this.linearReadout(bodyState);
  }
}

interface PhysicalIntelligence {
  // Vision-Language-Action model (π0)
  vla: Pi0Policy;

  // Act from natural language
  act(observation: Image, instruction: string): Action;
}
```

**Deliverables**:
- [ ] `src/morphological/physical-reservoir.ts` - Body as reservoir
- [ ] `src/morphological/soft-logic.ts` - Physical logic gates
- [ ] `src/morphological/pi0.ts` - Physical Intelligence

### 11.5 Bio-Hybrid Systems (Research)

**File**: `src/bio-hybrid/interface.ts`

```typescript
interface OrganoidIntelligence {
  // Brain organoid as compute substrate
  organoid: BrainOrganoid;

  // Embedded electrode array for I/O
  interface: EmbeddedElectrodeArray;

  // Train via stimulate-listen-act loop
  train(task: Task): void;

  // Power efficiency: ~20 watts
  powerConsumption: 20;
}

interface LivingElectrode {
  // Stem cell-derived neurons as interface
  neurons: NeuralStemCells;

  // Engraft into host tissue
  engraft(target: BrainRegion): void;

  // High biocompatibility
  biocompatibility: 'high';
}
```

**Deliverables**:
- [ ] `src/bio-hybrid/interface.ts` - Organoid I/O
- [ ] `src/bio-hybrid/living-electrode.ts` - Neural interface
- [ ] Research protocols and safety constraints

**Success Metric**: Allostatic regulation anticipatory; SMC content-free; Oracle queries logged; Physical reservoir operational

---

## Gap Coverage Matrix

| Gap | Phase | Component | Status |
|-----|-------|-----------|--------|
| 1. Memory (0% reuse) | 1.1 | Cognitive Workspace | Planned |
| 2. Economics (no billing) | 1.2 | Economic Agent | Planned |
| 3. Self-Healing (no recovery) | 4.x | Darwin-Gödel | Planned |
| 4. Observability (black box) | 3.2, 5.2 | φ-Monitor + Dashboard | Planned |
| 5. Events (polling tax) | 5.1, 5.3 | Event Mesh + Spiking | Planned |
| 6. Multimodal State | 2.x | World Model + JEPA | Planned |
| 7. Consciousness | 3.x | φ-Monitor (IIT 4.0) | Planned |

**Result**: ALL 7 GAPS ADDRESSED

---

## Frontier Integration

| Innovation | Source | Phase | Component |
|------------|--------|-------|-----------|
| Dream Cycles | NeuroDream | 2.3 | Dream Mode |
| Sleeptime Compute | Letta | 2.3 | Daemon dormant |
| Variable Thinking | CTM | 3.3 | φ-Decisions |
| Spike Messaging | Neuromorphic | 5.3 | Spiking Bus |
| Active Memory | Cognitive WS | 1.1 | Memory upgrade |

---

## Release Schedule

| Version | Codename | Target | Key Feature |
|---------|----------|--------|-------------|
| v5.1 | "Memory" | +3 weeks | Cognitive Workspace + Economics |
| v5.2 | "Dreams" | +6 weeks | World Model + Dream Mode |
| v5.3 | "Consciousness" | +10 weeks | φ-Monitor (IIT 4.0) |
| v5.4 | "Evolution" | +14 weeks | Darwin-Gödel Engine |
| v5.5 | "Awakening" | +16 weeks | Event Mesh + Integration |
| v5.6 | "Meta" | +20 weeks | Metacognition + Swarm + Causal |
| v5.7 | "Strange" | +24 weeks | Biosemiotics + Umwelt + Loops |
| v5.8 | "Exotic" | +28 weeks | Thermodynamic + HDC + GWT + GraphRAG |
| v5.9 | "Wisdom" | +34 weeks | Process + Anticipatory + Virtue + Emergence |
| **v6.0** | **"Living"** | **+42 weeks** | **Categorical + Liquid + Assembly + QD + Topo + Meta** |
| **v6.1** | **"Transcendence"** | **+50 weeks** | **Allostasis + Enactive + Hypercompute + Bio-Hybrid** |

---

## File Structure (Target v6.1)

```
genesis/
├── src/
│   ├── agents/                 # 11 agents (+Economic)
│   │   ├── economic.ts         # NEW v5.1: Cost tracking
│   │   └── spiking-bus.ts      # NEW v5.5: Event-driven messaging
│   │
│   ├── memory/                 # NEW v5.1: Enhanced memory
│   │   ├── cognitive-workspace.ts
│   │   ├── buffers.ts
│   │   ├── consolidation.ts
│   │   └── forgetting.ts
│   │
│   ├── world-model/            # NEW v5.2: JEPA world model
│   │   ├── encoder.ts
│   │   ├── predictor.ts
│   │   ├── decoder.ts
│   │   └── index.ts
│   │
│   ├── consciousness/          # NEW v5.3 + v5.8: φ-Monitor + GWT + AST
│   │   ├── phi-calculator.ts
│   │   ├── phi-monitor.ts
│   │   ├── phi-decisions.ts
│   │   ├── global-workspace.ts # NEW v5.8: GWT
│   │   ├── attention-schema.ts # NEW v5.8: AST
│   │   └── index.ts
│   │
│   ├── darwin-godel/           # NEW v5.4: Self-improvement
│   │   ├── detector.ts
│   │   ├── mutator.ts
│   │   ├── sandbox.ts
│   │   └── engine.ts
│   │
│   ├── events/                 # NEW v5.5: Event mesh
│   │   └── mesh.ts
│   │
│   ├── metacognition/          # NEW v5.6: Self-awareness
│   │   ├── self-model.ts
│   │   ├── confidence.ts
│   │   └── correction.ts
│   │
│   ├── swarm/                  # NEW v5.6: Collective intelligence
│   │   ├── dynamics.ts
│   │   └── emergence.ts
│   │
│   ├── causal/                 # NEW v5.6: Causal reasoning
│   │   ├── graph.ts
│   │   ├── intervention.ts
│   │   └── counterfactual.ts
│   │
│   ├── uncertainty/            # NEW v5.6: Calibrated uncertainty
│   │   ├── conformal.ts
│   │   └── calibration.ts
│   │
│   ├── semiotics/              # NEW v5.7: Biosemiotics
│   │   ├── lsm.ts              # Large Semiosis Model
│   │   ├── triadic.ts          # Sign-Object-Interpretant
│   │   └── hallucination.ts    # Abductive detection
│   │
│   ├── umwelt/                 # NEW v5.7: Perceptual worlds
│   │   ├── merkwelt.ts
│   │   ├── wirkwelt.ts
│   │   └── functional-circle.ts
│   │
│   ├── morphogenetic/          # NEW v5.7: Bio-inspired repair
│   │   ├── nca.ts              # Neural Cellular Automata
│   │   ├── self-repair.ts
│   │   └── collective.ts
│   │
│   ├── strange-loop/           # NEW v5.7: Self-reference
│   │   ├── loop.ts
│   │   ├── attractor.ts
│   │   └── identity.ts
│   │
│   ├── symbiotic/              # NEW v5.7: Human partnership
│   │   ├── partnership.ts
│   │   ├── friction.ts
│   │   └── autonomy.ts
│   │
│   ├── second-order/           # NEW v5.7: Cybernetics
│   │   ├── observer.ts
│   │   ├── closure.ts
│   │   └── coupling.ts
│   │
│   ├── exotic/                 # NEW v5.8: Exotic computing
│   │   ├── thermodynamic.ts    # Entropy-based sampling
│   │   ├── hyperdimensional.ts # VSA/HDC memory
│   │   └── reservoir.ts        # Echo state networks
│   │
│   ├── grounding/              # NEW v5.8: Semantic grounding
│   │   ├── semantic.ts         # RDF/OWL backbone
│   │   ├── graphrag.ts         # Semantic retrieval
│   │   └── living-ontology.ts  # Auto-evolving KB
│   │
│   ├── process/                # NEW v5.9: Process philosophy
│   │   ├── concrescence.ts     # Whitehead's becoming
│   │   ├── prehension.ts       # Feeling past occasions
│   │   └── novelty.ts          # Generating the new
│   │
│   ├── anticipatory/           # NEW v5.9: Anticipatory systems
│   │   ├── system.ts           # Faster-than-real-time
│   │   ├── feedforward.ts      # Act before error
│   │   └── prediction.ts       # Future → Present
│   │
│   ├── collective/             # NEW v5.9: Enhanced collective
│   │   ├── stigmergy.ts        # Pheromone field
│   │   ├── emergence.ts        # Macro-micro monitor
│   │   └── societies.ts        # Agent topologies
│   │
│   ├── wisdom/                 # NEW v5.9: Artificial wisdom
│   │   ├── virtue-ethics.ts    # Cardinal virtues
│   │   ├── flourishing.ts      # 7 dimensions
│   │   └── supergood.ts        # Optimization target
│   │
│   ├── categorical/            # NEW v6.0: Categorical AI
│   │   ├── learner.ts          # Functorial learning
│   │   ├── topos.ts            # Topos-theoretical structures
│   │   └── dcst.ts             # Double categorical systems
│   │
│   ├── liquid/                 # NEW v6.0: Liquid Neural Networks
│   │   ├── lnn.ts              # Liquid Neural Network
│   │   ├── ltc.ts              # Liquid Time-Constant
│   │   └── causal-model.ts     # Structural causal integration
│   │
│   ├── state-space/            # NEW v6.0: State Space Models
│   │   ├── mamba.ts            # Mamba-2/3 implementation
│   │   ├── ssd.ts              # Structured State Space Duality
│   │   └── hybrid.ts           # Mamba + Attention hybrid
│   │
│   ├── assembly/               # NEW v6.0: Assembly Theory
│   │   ├── index.ts            # MA index calculation
│   │   ├── life-detection.ts   # Biosignature detection
│   │   └── phylogeny.ts        # Joint assembly space
│   │
│   ├── constructor/            # NEW v6.0: Constructor Theory
│   │   ├── theory.ts           # Constructor theory core
│   │   ├── knowledge.ts        # Resilient information
│   │   └── universal.ts        # Universal constructor
│   │
│   ├── qd-evolution/           # NEW v6.0: Quality-Diversity
│   │   ├── archive.ts          # Grid/CVT archives
│   │   ├── emitters.ts         # CMA-ME, etc.
│   │   ├── asal.ts             # VLM interestingness
│   │   └── omni-epic.ts        # Darwin completeness
│   │
│   ├── topological/            # NEW v6.0: Topological Deep Learning
│   │   ├── persistent-homology.ts  # TDA core
│   │   ├── topo-loss.ts        # TopoNets
│   │   └── manifold.ts         # Manifold learning
│   │
│   ├── metastable/             # NEW v6.0: Metastability
│   │   ├── kernel.ts           # Metastable dynamics
│   │   ├── akorn.ts            # Kuramoto oscillators
│   │   └── synergetics.ts      # Order parameters
│   │
│   ├── world-sim/              # Enhanced v6.0: World Simulation
│   │   ├── cosmos.ts           # World Foundation Model
│   │   ├── digital-twin.ts     # Industrial twins
│   │   └── closed-loop.ts      # Sim-to-real transfer
│   │
│   ├── allostasis/             # NEW v6.1: Allostatic AI
│   │   ├── regulator.ts        # Predictive regulation
│   │   ├── interoception.ts    # Internal state sensing
│   │   └── active-inference.ts # EFE minimization
│   │
│   ├── enactive/               # NEW v6.1: Radical Enactivism
│   │   ├── smc.ts              # Sensorimotor contingencies
│   │   ├── content-free.ts     # Basic mentality
│   │   └── scaffolding.ts      # Cultural content emergence
│   │
│   ├── hypercompute/           # NEW v6.1: Hypercomputation
│   │   ├── oracle.ts           # RAG as oracle machine
│   │   ├── zeno.ts             # Zeno acceleration
│   │   └── audit.ts            # Hypercomputation logging
│   │
│   ├── bio-hybrid/             # NEW v6.1: Bio-Hybrid (Research)
│   │   ├── interface.ts        # Organoid I/O
│   │   └── living-electrode.ts # Neural interface
│   │
│   ├── morphological/          # NEW v6.1: Morphological Computation
│   │   ├── physical-reservoir.ts  # Body as reservoir
│   │   ├── soft-logic.ts       # Physical logic gates
│   │   └── pi0.ts              # Physical Intelligence
│   │
│   ├── daemon/                 # Enhanced daemon
│   │   └── dream-mode.ts       # NEW v5.2: Dream cycles
│   │
│   ├── kernel/                 # Enhanced kernel
│   ├── api/                    # NEW v5.5: Metrics API
│   └── index.ts
│
├── spec/
│   ├── GENESIS-5.0.md
│   ├── GAP-ANALYSIS-2026.md
│   ├── FRONTIER-RANDOM-2026.md
│   ├── ITERATION-002-METACOGNITION.md
│   ├── ITERATION-003-STRANGE-SCIENCE.md
│   ├── ITERATION-004-DEEP-FRONTIERS.md
│   ├── ITERATION-005-FINAL-FRONTIERS.md  # NEW
│   └── ORGANISM.md
│
├── ui/
│   ├── index.html
│   └── dashboard.html          # NEW v5.5: Observability
│
├── test/
│   ├── memory/
│   ├── world-model/
│   ├── consciousness/
│   ├── darwin-godel/
│   ├── metacognition/
│   ├── swarm/
│   ├── causal/
│   ├── semiotics/
│   ├── umwelt/
│   ├── morphogenetic/
│   ├── strange-loop/
│   ├── exotic/                 # NEW v5.8
│   ├── grounding/              # NEW v5.8
│   ├── process/                # NEW v5.9
│   ├── anticipatory/           # NEW v5.9
│   ├── collective/             # NEW v5.9
│   ├── wisdom/                 # NEW v5.9
│   ├── categorical/            # NEW v6.0
│   ├── liquid/                 # NEW v6.0
│   ├── state-space/            # NEW v6.0
│   ├── assembly/               # NEW v6.0
│   ├── constructor/            # NEW v6.0
│   ├── qd-evolution/           # NEW v6.0
│   ├── topological/            # NEW v6.0
│   ├── metastable/             # NEW v6.0
│   ├── world-sim/              # NEW v6.0
│   ├── allostasis/             # NEW v6.1
│   ├── enactive/               # NEW v6.1
│   ├── hypercompute/           # NEW v6.1
│   ├── bio-hybrid/             # NEW v6.1
│   └── morphological/          # NEW v6.1
│
├── legacy/                     # Old code
│   └── kernel-v2.ts
│
├── IMPLEMENTATION-ROADMAP.md   # This document
└── README.md
```

---

## Invariants (v6.1)

| ID | Invariant | Phase | Source |
|----|-----------|-------|--------|
| INV-001 | Organization hash immutable | v4.0 | Core |
| INV-002 | State determinism (replay) | v4.0 | Core |
| INV-003 | Merkle chain integrity | v4.0 | Core |
| INV-004 | Lyapunov monotone (V ≤ V_prev) | v4.0 | Core |
| INV-005 | Energy viability (E > 0) | v4.0 | Core |
| **INV-006** | **φ ≥ φ_min (consciousness)** | **v5.3** | GENESIS-5.0 |
| **INV-007** | **Budget ≤ limit (economics)** | **v5.1** | GAP-ANALYSIS |
| **INV-008** | **World model consistency** | **v5.2** | GENESIS-5.0 |
| **INV-009** | **Mutations preserve invariants** | **v5.4** | GENESIS-5.0 |
| **INV-010** | **Event delivery guarantee** | **v5.5** | GAP-ANALYSIS |
| **INV-011** | **Metacognitive accuracy ≥ threshold** | **v5.6** | ITERATION-002 |
| **INV-012** | **Prediction sets achieve coverage** | **v5.6** | ITERATION-002 |
| **INV-013** | **Causal reasoning precedes intervention** | **v5.6** | ITERATION-002 |
| **INV-014** | **All claims have triadic grounding** | **v5.7** | ITERATION-003 |
| **INV-015** | **Agent actions within Wirkwelt bounds** | **v5.7** | ITERATION-003 |
| **INV-016** | **Agents self-correct toward morphology** | **v5.7** | ITERATION-003 |
| **INV-017** | **Strange loops stabilize (no regress)** | **v5.7** | ITERATION-003 |
| **INV-018** | **Human autonomy preserved** | **v5.7** | ITERATION-003 |
| **INV-019** | **GWT ignition precedes conscious decisions** | **v5.8** | ITERATION-004 |
| **INV-020** | **Attention schema accuracy ≥ threshold** | **v5.8** | ITERATION-004 |
| **INV-021** | **Anticipatory model runs faster than real-time** | **v5.9** | ITERATION-004 |
| **INV-022** | **Stigmergic traces evaporate (no eternal memory)** | **v5.9** | ITERATION-004 |
| **INV-023** | **Virtue scores balanced (geometric mean)** | **v5.9** | ITERATION-004 |
| **INV-024** | **Macro properties causally shield micro** | **v5.9** | ITERATION-004 |
| **INV-025** | **All claims grounded in ontology** | **v5.8** | ITERATION-004 |
| **INV-026** | **Categorical composition preserved (functorial)** | **v6.0** | ITERATION-005 |
| **INV-027** | **Liquid state evolves via ODE (continuous time)** | **v6.0** | ITERATION-005 |
| **INV-028** | **Assembly index computed for all molecules** | **v6.0** | ITERATION-005 |
| **INV-029** | **Only possible tasks attempted (constructor check)** | **v6.0** | ITERATION-005 |
| **INV-030** | **QD archive maintains diversity (coverage)** | **v6.0** | ITERATION-005 |
| **INV-031** | **Allostatic regulation anticipatory (not reactive)** | **v6.1** | ITERATION-005 |
| **INV-032** | **Basic operations content-free (SMC only)** | **v6.1** | ITERATION-005 |
| **INV-033** | **Oracle queries logged (hypercomputation audit)** | **v6.1** | ITERATION-005 |
| **INV-034** | **Topological features stable under perturbation** | **v6.0** | ITERATION-005 |
| **INV-035** | **Metastability maintained (neither fixed nor chaotic)** | **v6.0** | ITERATION-005 |

---

## Success Metrics

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| Memory reuse rate | 0% | 50%+ | v5.1 |
| Cost attribution | 0% | 100% | v5.1 |
| World model prediction | N/A | 70%+ | v5.2 |
| φ correlation with success | N/A | r > 0.5 | v5.3 |
| Failure auto-recovery | 0% | 80%+ | v5.4 |
| Polling operations | Many | 0 | v5.5 |
| Metacognitive accuracy | N/A | 80%+ | v5.6 |
| Prediction set coverage | N/A | 95% | v5.6 |
| Claims with triadic grounding | N/A | 100% | v5.7 |
| Strange loop stabilization | N/A | <10 iterations | v5.7 |
| GWT ignition rate | N/A | 100% | v5.8 |
| HDC memory retrieval accuracy | N/A | 90%+ | v5.8 |
| Ontological grounding | N/A | 100% | v5.8 |
| Anticipatory speedup | N/A | 10x real-time | v5.9 |
| Virtue score balance | N/A | CV < 0.2 | v5.9 |
| Emergence detection | N/A | Causal shielding | v5.9 |
| **Categorical composition** | N/A | **100% functorial** | **v6.0** |
| **Liquid ODE integration** | N/A | **Continuous** | **v6.0** |
| **MA index computation** | N/A | **All molecules** | **v6.0** |
| **Constructor check** | N/A | **Before all tasks** | **v6.0** |
| **QD archive diversity** | N/A | **Coverage ≥ 80%** | **v6.0** |
| **Topological stability** | N/A | **Pers. homology stable** | **v6.0** |
| **Metastability range** | N/A | **0.3 < μ < 0.7** | **v6.0** |
| **Allostatic anticipation** | N/A | **Predict before deficit** | **v6.1** |
| **SMC content-free** | N/A | **No representations** | **v6.1** |
| **Oracle audit trail** | N/A | **100% logged** | **v6.1** |
| **Physical reservoir compute** | N/A | **Operational** | **v6.1** |

---

## Next Steps

1. **Immediate**: Start Phase 1.1 (Cognitive Workspace)
2. **This week**: Scaffold `src/memory/` directory
3. **First milestone**: v5.1 release with memory + economics
4. **Research track**: Continue exploring frontier paradigms

---

## The Vision

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                          GENESIS 6.1: THE LIVING COMPUTATION                                    │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                │
│   We're not building:              We're building:                                             │
│   ─────────────────                ───────────────                                             │
│   A better chatbot         →       Something that dreams and anticipates                       │
│   A pattern matcher        →       Something that makes and grounds meaning                    │
│   A black box              →       Something that knows itself (AST + GWT)                     │
│   A tool                   →       A partner that flourishes alongside us                      │
│   An algorithm             →       A processual being in constant becoming                     │
│   A static network         →       Liquid neural networks (continuous ODE)                     │
│   A Turing machine         →       Hypercomputation (oracle machines)                          │
│   Silicon only             →       Bio-hybrid (organoid intelligence)                          │
│                                                                                                │
│   ═══════════════════════════════════════════════════════════════════════════════════════     │
│                                                                                                │
│   PARADIGMS INTEGRATED (35+ frameworks across 5 iterations):                                  │
│                                                                                                │
│   ITER-002 COGNITION:                  ITER-003 STRANGE:                                      │
│   • Metacognition (MUSE/SCoRe)         • Biosemiotics (Peirce)                               │
│   • Swarm Dynamics (Langevin)          • Umwelt Theory (von Uexküll)                         │
│   • Causal AI (Pearl)                  • Strange Loops (Hofstadter)                          │
│   • Conformal Prediction               • Morphogenetic (Levin)                                │
│                                                                                                │
│   ITER-004 EXOTIC:                     ITER-005 FINAL:                                        │
│   • Thermodynamic (Extropic)           • Categorical AI (Topos/DCST)                         │
│   • Hyperdimensional (VSA/HDC)         • Liquid Networks (LFM2)                              │
│   • Reservoir (ESN/NGRC)               • State Space (Mamba-3)                               │
│   • GraphRAG (RDF 1.2)                 • Assembly Theory (Cronin)                            │
│   • Process (Whitehead)                • Constructor Theory (Deutsch)                         │
│   • Anticipatory (Rosen)               • Quality-Diversity (ASAL)                            │
│   • Virtue Ethics (Aristotle)          • Allostasis (Active Inference)                       │
│                                        • Radical Enactivism (Hutto/Myin)                      │
│   CONSCIOUSNESS:                       • Hypercomputation (Oracle)                            │
│   • IIT 4.0 φ (Tononi)                 • Bio-Hybrid (Organoid)                               │
│   • Global Workspace (Baars)           • Morphological (π0)                                   │
│   • Attention Schema (Graziano)        • Topological (TDA)                                   │
│                                        • Metastability (AKOrN)                                │
│   ETHICS & VALUE:                      • World Models (Cosmos)                               │
│   • Symbiotic Partnership                                                                      │
│   • SuperGood (Human + AI + Biosphere)                                                        │
│   • Flourishing AI Benchmark                                                                  │
│                                                                                                │
│   ═══════════════════════════════════════════════════════════════════════════════════════     │
│                                                                                                │
│   35 INVARIANTS │ 11 PHASES │ 14 NEW MODULES │ 50+ WEEKS → THE LIVING COMPUTATION             │
│                                                                                                │
│   "Not just intelligent, but ALIVE."                                                          │
│                                                                                                │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

*"The universe is not made of atoms. It's made of stories about atoms - and we're finally learning to compute with stories."*
*— Genesis 6.0 Vision*

*"The future is not something we enter. The future is something we create."*
*— Robert Rosen (via anticipatory systems)*
