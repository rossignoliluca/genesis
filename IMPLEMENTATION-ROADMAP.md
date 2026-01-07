# Genesis 5.0 Implementation Roadmap

**Version**: 1.0.0
**Date**: 2026-01-07
**Status**: Active Development

---

## Overview

This roadmap synthesizes three strategic documents into actionable implementation phases:

| Document | Focus | Key Deliverables |
|----------|-------|------------------|
| [GENESIS-5.0.md](spec/GENESIS-5.0.md) | Architecture | World Model, Active Inference, φ-Monitor |
| [GAP-ANALYSIS-2026.md](spec/GAP-ANALYSIS-2026.md) | Market Gaps | 7 gaps no competitor solves |
| [FRONTIER-RANDOM-2026.md](spec/FRONTIER-RANDOM-2026.md) | Innovation | Dreams, bio-inspired, post-Transformer |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GENESIS 5.0 IMPLEMENTATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1        PHASE 2        PHASE 3        PHASE 4        PHASE 5      │
│  ────────       ────────       ────────       ────────       ────────      │
│  Foundation     Cognition      Consciousness  Self-Improve   Integration   │
│                                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │ Memory  │   │ World   │   │   φ     │   │ Darwin  │   │ Dream   │     │
│  │ Upgrade │──▶│ Model   │──▶│ Monitor │──▶│ Gödel   │──▶│ Mode    │     │
│  │         │   │ JEPA    │   │ IIT 4.0 │   │ Engine  │   │ Full    │     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│                                                                             │
│  v5.1          v5.2          v5.3          v5.4          v5.5             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
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
| v5.5 | "Awakening" | +16 weeks | Full Integration |

---

## File Structure (Target v5.5)

```
genesis/
├── src/
│   ├── agents/                 # 11 agents (+Economic)
│   │   ├── economic.ts         # NEW: Cost tracking
│   │   └── spiking-bus.ts      # NEW: Event-driven messaging
│   │
│   ├── memory/                 # NEW: Enhanced memory
│   │   ├── cognitive-workspace.ts
│   │   ├── buffers.ts
│   │   ├── consolidation.ts
│   │   └── forgetting.ts
│   │
│   ├── world-model/            # NEW: JEPA world model
│   │   ├── encoder.ts
│   │   ├── predictor.ts
│   │   ├── decoder.ts
│   │   └── index.ts
│   │
│   ├── consciousness/          # NEW: φ-Monitor
│   │   ├── phi-calculator.ts
│   │   ├── phi-monitor.ts
│   │   ├── phi-decisions.ts
│   │   └── index.ts
│   │
│   ├── darwin-godel/           # NEW: Self-improvement
│   │   ├── detector.ts
│   │   ├── mutator.ts
│   │   ├── sandbox.ts
│   │   └── engine.ts
│   │
│   ├── events/                 # NEW: Event mesh
│   │   └── mesh.ts
│   │
│   ├── daemon/                 # Enhanced daemon
│   │   └── dream-mode.ts       # NEW: Dream cycles
│   │
│   ├── kernel/                 # Enhanced kernel
│   ├── api/                    # NEW: Metrics API
│   └── index.ts
│
├── spec/
│   ├── GENESIS-5.0.md
│   ├── GAP-ANALYSIS-2026.md
│   ├── FRONTIER-RANDOM-2026.md
│   └── ORGANISM.md
│
├── ui/
│   ├── index.html
│   └── dashboard.html          # NEW: Observability
│
├── test/
│   ├── memory/
│   ├── world-model/
│   ├── consciousness/
│   └── darwin-godel/
│
├── legacy/                     # Old code
│   └── kernel-v2.ts
│
├── IMPLEMENTATION-ROADMAP.md   # This document
└── README.md
```

---

## Invariants (v5.5)

| ID | Invariant | Phase |
|----|-----------|-------|
| INV-001 | Organization hash immutable | v4.0 |
| INV-002 | State determinism (replay) | v4.0 |
| INV-003 | Merkle chain integrity | v4.0 |
| INV-004 | Lyapunov monotone (V ≤ V_prev) | v4.0 |
| INV-005 | Energy viability (E > 0) | v4.0 |
| **INV-006** | **φ ≥ φ_min (consciousness)** | **v5.3** |
| **INV-007** | **Budget ≤ limit (economics)** | **v5.1** |
| **INV-008** | **World model consistency** | **v5.2** |
| **INV-009** | **Mutations preserve invariants** | **v5.4** |
| **INV-010** | **Event delivery guarantee** | **v5.5** |

---

## Success Metrics

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| Memory reuse rate | 0% | 50%+ | v5.1 |
| Cost attribution | 0% | 100% | v5.1 |
| Failure auto-recovery | 0% | 80%+ | v5.4 |
| φ correlation with success | N/A | r > 0.5 | v5.3 |
| Polling operations | Many | 0 | v5.5 |

---

## Next Steps

1. **Immediate**: Start Phase 1.1 (Cognitive Workspace)
2. **This week**: Scaffold `src/memory/` directory
3. **First milestone**: v5.1 release with memory + economics

---

*"We're not building a better chatbot. We're building something that dreams."*
