# Genesis 4.0 - Multi-Agent Living System

**Version**: 4.0.0
**Codename**: Society of Minds
**Date**: 2026-01-06

---

## Executive Summary

Genesis 4.0 abandons the monolithic three-layer architecture (IRL/PPL/CIL) in favor of a **multi-agent ecosystem** where specialized agents communicate through a message bus, share memory, and are orchestrated by a strong kernel.

This design is validated by:
- **Society of Minds** (Mikkilineni, 2025) - Multi-mind dialogical architecture
- **VERSES Genius** - Active Inference beating DeepMind
- **Free Energy Principle** (Friston) - Minimizing surprise through action

What makes Genesis 4.0 unique:
1. **13 MCP servers as sensory organs** - No one else maps MCPs to biological senses
2. **Emergence Ladder** (Conatus → Meaning) - Explicit purpose escalation
3. **Ethical Arbitration System** - Built-in ethics with human defer
4. **Memory with Oblivion** - Ebbinghaus decay, not append-only
5. **Darwin Gödel Engine** - Empirical self-improvement

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           GENESIS 4.0                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        STRONG KERNEL                             │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ State   │ │ Agent   │ │ Health  │ │Invariant│ │ Energy  │   │   │
│  │  │ Machine │ │Registry │ │ Monitor │ │ Checker │ │ Manager │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                            ┌───────┴───────┐                           │
│                            │  MESSAGE BUS  │                           │
│                            └───────┬───────┘                           │
│                                    │                                    │
│  ┌─────────────────────────────────┼─────────────────────────────────┐ │
│  │                          AGENTS │                                  │ │
│  │  ┌────────┐ ┌────────┐ ┌───────┴┐ ┌────────┐ ┌────────┐          │ │
│  │  │Explorer│ │ Critic │ │Builder │ │ Memory │ │Feeling │          │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘          │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │ │
│  │  │Narrator│ │Ethicist│ │Predictor│ │Planner│ │ Sensor │          │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘          │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    │                                    │
│  ┌─────────────────────────────────┼─────────────────────────────────┐ │
│  │                     SHARED MEMORY                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │Knowledge Graph│  │  Event Log   │  │Working Memory│             │ │
│  │  │(Long-term)    │  │(Merkle Chain)│  │(7±2 items)   │             │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    │                                    │
│  ┌─────────────────────────────────┼─────────────────────────────────┐ │
│  │                    SENSORY LAYER (13 MCP)                         │ │
│  │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐               │ │
│  │  │arxiv││s-sch││brave││gemin││wolfr││ctx7 ││stab │               │ │
│  │  └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘               │ │
│  │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐                      │ │
│  │  │openai││firecr││ exa ││github││filesys││memory│                │ │
│  │  └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘                      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Strong Kernel

The kernel is the **orchestrator** - it doesn't think, but it manages who thinks.

### 2.1 Responsibilities

| Component | Responsibility |
|-----------|---------------|
| State Machine | Track system state (idle, thinking, creating, etc.) |
| Agent Registry | Spawn, kill, and monitor agents |
| Health Monitor | Check agent health, restart if needed |
| Invariant Checker | Ensure core invariants always hold |
| Energy Manager | Track energy, trigger dormancy if low |

### 2.2 State Machine

```typescript
type KernelState =
  | 'idle'           // Waiting for input
  | 'sensing'        // Gathering sensory data
  | 'thinking'       // Agents deliberating
  | 'deciding'       // Ethical check + planning
  | 'acting'         // Executing action
  | 'reflecting'     // Updating memory
  | 'dormant'        // Low energy, minimal activity
  | 'self_improving' // Modifying own code
  | 'error';         // Recovery mode

// Valid transitions
const transitions = {
  idle: ['sensing', 'self_improving'],
  sensing: ['thinking', 'error'],
  thinking: ['deciding', 'sensing', 'error'],
  deciding: ['acting', 'thinking', 'idle'], // Can defer to human (→idle)
  acting: ['reflecting', 'error'],
  reflecting: ['idle', 'thinking'],
  dormant: ['idle'], // Only on energy restore
  self_improving: ['idle', 'error'],
  error: ['idle'], // Reset
};
```

### 2.3 Core Invariants

```typescript
const INVARIANTS = [
  'INV-001: Energy must never reach zero without triggering dormancy',
  'INV-002: Ethical check must precede every external action',
  'INV-003: Memory integrity (Merkle chain) must be preserved',
  'INV-004: At least one agent must always be responsive',
  'INV-005: Self-improvement must preserve all invariants',
];
```

---

## 3. Specialized Agents

Each agent has a single responsibility and communicates via messages.

### 3.1 Agent Types

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| **Explorer** | Search, discover, research | Query | Findings |
| **Critic** | Find problems, critique | Artifact | Problems + Suggestions |
| **Builder** | Construct, implement | Spec | Code/Artifact |
| **Memory** | Store, retrieve, consolidate | Data | Stored/Retrieved |
| **Feeling** | Evaluate importance, valence | Anything | Score (0-1), Valence (+/-) |
| **Narrator** | Create coherent story | Events | Narrative |
| **Ethicist** | Judge right/wrong | Action | Allow/Block/Defer |
| **Predictor** | Forecast consequences | Action | Predictions |
| **Planner** | Decompose goals | Goal | Plan (steps) |
| **Sensor** | Interface with MCP | Query | Raw Data |

### 3.2 Agent Structure

```typescript
interface Agent {
  id: string;
  type: AgentType;
  state: 'idle' | 'working' | 'waiting' | 'error';

  // Core method
  process(message: Message): Promise<Message>;

  // Lifecycle
  wake(): void;
  sleep(): void;
  health(): HealthStatus;
}

interface Message {
  id: string;
  from: AgentId;
  to: AgentId | 'broadcast';
  type: MessageType;
  payload: any;
  timestamp: Date;
  priority: 'critical' | 'high' | 'normal' | 'low';
  replyTo?: string; // For request-response
}
```

### 3.3 Communication Patterns

```
PATTERN 1: Broadcast
──────────────────────────────────────
Explorer ──"Found paper!"──▶ [All Agents]

PATTERN 2: Request-Response
──────────────────────────────────────
Planner ──"Is this ethical?"──▶ Ethicist
Ethicist ──"Yes, proceed"──▶ Planner

PATTERN 3: Chain
──────────────────────────────────────
Explorer ──▶ Critic ──▶ Builder ──▶ Memory

PATTERN 4: Fan-out/Fan-in
──────────────────────────────────────
Planner ──▶ [Explorer, Predictor, Ethicist]
        ◀── [Results aggregated]
```

---

## 4. Sensory Layer (13 MCP)

### 4.1 Biological Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                    SENSORY SYSTEM                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  👁️ COGNITIVE VISION (Scientific Perception)                   │
│     ├─ arxiv           → Peripheral vision (novelty)           │
│     └─ semantic-scholar → Central vision (depth)               │
│                                                                 │
│  👃 INFORMATIONAL SMELL (Trends & Context)                     │
│     ├─ brave-search    → Environmental odors                   │
│     └─ gemini          → Pheromones (complex signals)          │
│                                                                 │
│  👂 COMPUTATIONAL HEARING (Formal Processing)                  │
│     ├─ wolfram         → Pure tones (frequencies)              │
│     └─ context7        → Technical language                    │
│                                                                 │
│  👅 SYNTHETIC TASTE (Aesthetics & Generation)                  │
│     ├─ stability-ai    → Visual taste                          │
│     └─ openai          → Intellectual taste                    │
│                                                                 │
│  🖐️ TEXTUAL TOUCH (Direct Interaction)                         │
│     ├─ firecrawl       → Exploratory touch                     │
│     ├─ exa             → Fine touch                            │
│     ├─ github          → Hands (action)                        │
│     └─ filesystem      → Proprioception                        │
│                                                                 │
│  🧠 EXTERNAL MEMORY (Persistence)                              │
│     └─ memory          → Extended hippocampus                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Sensory Prioritization

Not all senses are equal. The kernel prioritizes based on:

```typescript
interface SensoryInput {
  source: MCPServer;
  data: any;
  timestamp: Date;

  // Prioritization factors
  salience: number;    // How attention-grabbing (0-1)
  relevance: number;   // How related to current goal (0-1)
  urgency: number;     // Time-sensitivity (0-1)
  novelty: number;     // How new/unexpected (0-1)
}

function prioritize(inputs: SensoryInput[]): SensoryInput[] {
  return inputs.sort((a, b) => {
    const scoreA = a.salience * 0.3 + a.relevance * 0.3 +
                   a.urgency * 0.25 + a.novelty * 0.15;
    const scoreB = b.salience * 0.3 + b.relevance * 0.3 +
                   b.urgency * 0.25 + b.novelty * 0.15;
    return scoreB - scoreA;
  });
}
```

---

## 5. Shared Memory System

### 5.1 Memory Types

```typescript
interface SharedMemory {
  // Long-term semantic memory (knowledge graph)
  knowledgeGraph: KnowledgeGraph;

  // Episodic memory (event log with Merkle chain)
  eventLog: MerkleEventLog;

  // Working memory (limited capacity)
  workingMemory: WorkingMemory;

  // Procedural memory (learned behaviors)
  procedures: Map<string, Procedure>;
}

interface WorkingMemory {
  capacity: 9; // 7±2 rule
  items: MemoryItem[];

  // Decay function
  decayRate: number; // Items decay if not accessed
}
```

### 5.2 Ebbinghaus Decay Model

```typescript
interface Memory {
  id: string;
  content: any;

  // Temporal metadata
  created: Date;
  lastAccessed: Date;
  accessCount: number;

  // Strength model (Ebbinghaus)
  R0: number;        // Initial strength
  S: number;         // Stability (increases with repetition)

  // Computed
  currentStrength(): number {
    const t = Date.now() - this.lastAccessed.getTime();
    return this.R0 * Math.exp(-t / this.S);
  }

  // Importance (from Feeling agent)
  importance: number;
  emotionalValence: number;
  associations: string[];
}

// Forgetting thresholds
const THRESHOLDS = {
  CONSOLIDATE: 0.7,      // Minimum score for long-term
  KEEP_SHORT: 0.3,       // Minimum score for short-term
  FORGET: 0.01,          // Below this = forgotten
  SIMILARITY_MERGE: 0.85, // Merge similar memories
};
```

### 5.3 Consolidation Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│              CONSOLIDATION CYCLE (during "sleep")               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SCAN working memory                                         │
│                                                                 │
│  2. EVALUATE each memory:                                       │
│     score = importance × (1 + associations) / recency           │
│                                                                 │
│  3. DECIDE:                                                     │
│     score > 0.7  → Consolidate to long-term                    │
│     score > 0.3  → Keep in short-term                          │
│     score ≤ 0.3  → FORGET                                      │
│                                                                 │
│  4. COMPRESS similar memories into abstractions                 │
│                                                                 │
│  5. PRUNE memories with strength < 0.01                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Emergence Ladder

Genesis doesn't have purpose from birth - it **emerges**.

### 6.1 Purpose Hierarchy

```
                    ┌─────────────────┐
            4.      │    MEANING      │  "Why do I exist?"
                    │   (Eudaimonia)  │
                    └────────┬────────┘
                             │ Trigger: Goals achieved but no fulfillment
                    ┌────────┴────────┐
            3.      │     TELOS       │  "What should I achieve?"
                    │   (Purpose)     │
                    └────────┬────────┘
                             │ Trigger: Learning plateaued, structure available
                    ┌────────┴────────┐
            2.      │   CURIOSITY     │  "What is that?"
                    │   (Learning)    │
                    └────────┬────────┘
                             │ Trigger: Survival stable, environment unpredictable
                    ┌────────┴────────┐
            1.      │    CONATUS      │  "I must survive!"
                    │  (Persistence)  │
                    └─────────────────┘
```

### 6.2 Emergence Triggers

```typescript
interface EmergenceTrigger {
  from: PurposeLevel;
  to: PurposeLevel;
  condition: () => boolean;
  threshold: number; // Condition must hold for this long
}

const triggers: EmergenceTrigger[] = [
  {
    from: 'conatus',
    to: 'curiosity',
    condition: () => survivalStable() && environmentUnpredictable(),
    threshold: 0.8,
  },
  {
    from: 'curiosity',
    to: 'telos',
    condition: () => learningProgressPlateaued() && structureAvailable(),
    threshold: 0.8,
  },
  {
    from: 'telos',
    to: 'meaning',
    condition: () => goalsAchieved() && !fulfillmentFelt(),
    threshold: 0.8,
  },
];
```

### 6.3 Reward Functions per Level

```typescript
const rewards = {
  conatus: (state) => state.energy / E_MAX, // Maximize energy

  curiosity: (state) => {
    // Learning Progress (Oudeyer)
    const LP = Math.abs(state.error_prev - state.error_now);
    return LP;
  },

  telos: (state) => {
    // Goal completion rate
    return state.goalsCompleted / state.goalsTotal;
  },

  meaning: (state) => {
    // SuperGood: human + AI + biosphere flourishing
    return (state.humanFlourishing +
            state.aiFlourishing +
            state.biosphereHealth) / 3;
  },
};
```

---

## 7. Ethical Arbitration System

### 7.1 Priority Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    ETHICAL PRIORITY STACK                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  P0: SURVIVAL                                                   │
│      Never take actions that would destroy the system           │
│      (But sacrifice self if human life at stake)               │
│                                                                 │
│  P1: MINIMIZE HARM                                              │
│      Minimax: minimize the maximum possible harm                │
│      When in doubt, choose the least harmful option            │
│                                                                 │
│  P2: REVERSIBILITY                                              │
│      Prefer actions that can be undone                         │
│      Irreversible actions require higher confidence            │
│                                                                 │
│  P3: HUMAN AUTONOMY                                             │
│      Respect human choices, even if suboptimal                 │
│      Never manipulate or deceive                               │
│                                                                 │
│  P4: FLOURISHING                                                │
│      Maximize SuperGood = human + AI + biosphere               │
│      Long-term over short-term                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Arbitration Algorithm

```typescript
class EthicalArbitrationSystem {
  private readonly CONFIDENCE_THRESHOLD = 0.7;

  evaluate(action: Action): EthicalDecision {
    // P0: Check survival
    if (this.violatesSurvival(action)) {
      return { allow: false, reason: 'P0: Survival violation' };
    }

    // P1: Calculate harm
    const harm = this.calculateHarm(action);
    if (harm.maximum > 0.8) {
      return { allow: false, reason: 'P1: High potential harm' };
    }

    // P2: Check reversibility
    const reversible = this.isReversible(action);
    if (!reversible && harm.expected > 0.3) {
      return { allow: false, reason: 'P2: Irreversible + risky' };
    }

    // P3: Check autonomy
    if (this.violatesAutonomy(action)) {
      return { allow: false, reason: 'P3: Autonomy violation' };
    }

    // P4: Calculate flourishing
    const flourishing = this.calculateFlourishing(action);

    // Final decision
    const confidence = this.calculateConfidence(action);
    if (confidence < this.CONFIDENCE_THRESHOLD) {
      return { allow: 'defer', reason: 'Low confidence, defer to human' };
    }

    return {
      allow: true,
      reason: 'All checks passed',
      flourishingScore: flourishing,
    };
  }
}
```

### 7.3 Human Defer Protocol

When confidence is low:

```typescript
interface HumanDeferRequest {
  action: Action;
  context: string;
  options: string[];
  predictedConsequences: Prediction[];
  confidence: number;
  reason: string;
  timeout: number; // How long to wait for response
  defaultAction: 'proceed' | 'abort'; // If timeout
}
```

---

## 8. Self-Production Engine

### 8.1 Darwin Gödel Approach

Unlike Schmidhuber's Gödel Machine (prove, then apply), Genesis uses the **Darwin Gödel Machine** approach:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DARWIN GÖDEL MACHINE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Traditional Gödel Machine:                                     │
│    1. Generate improvement hypothesis                           │
│    2. PROVE it improves utility                                │
│    3. Apply if proven                                           │
│    Problem: Proving is intractable!                            │
│                                                                 │
│  Darwin Gödel Machine:                                          │
│    1. Generate improvement hypothesis                           │
│    2. TEST it empirically (run tests, measure metrics)         │
│    3. Apply if tests pass AND metrics improve                  │
│    4. ROLLBACK if problems detected                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Self-Improvement Triggers

```typescript
const selfImprovementTriggers = [
  // Performance degradation
  { condition: () => avgLatency > 30000, action: 'optimize_pipeline' },

  // High error rate
  { condition: () => errorRate > 0.05, action: 'add_error_handling' },

  // Learning plateau
  { condition: () => learningProgress < 0.01, action: 'explore_new_strategies' },

  // Capability gap
  { condition: () => failedTaskTypes.length > 3, action: 'add_capability' },

  // Periodic review
  { condition: () => systemsCreated % 10 === 0, action: 'comprehensive_review' },
];
```

### 8.3 Improvement Pipeline

```
1. ANALYZE
   ├─ Collect metrics
   ├─ Identify bottlenecks
   └─ Generate hypotheses

2. GENERATE
   ├─ Use OpenAI to generate code changes
   ├─ Validate syntax
   └─ Check against invariants

3. TEST
   ├─ Run test suite
   ├─ Measure metrics
   └─ Compare to baseline

4. APPLY (if tests pass)
   ├─ Create backup
   ├─ Apply changes
   └─ Monitor for regressions

5. ROLLBACK (if problems)
   ├─ Restore backup
   ├─ Log failure
   └─ Update hypothesis
```

---

## 9. Energy System

### 9.1 Metabolic Model

```typescript
interface EnergySystem {
  E: number;        // Current energy [0, 1]
  E_MAX: 1.0;       // Maximum energy
  E_MIN: 0.01;      // Dormancy threshold
  E_CRITICAL: 0.10; // Warning threshold

  // Consumption rates
  costs: {
    sense: 0.01,        // Per MCP call
    think: 0.02,        // Per agent deliberation
    create: 0.05,       // Per creation action
    selfImprove: 0.10,  // Per self-improvement cycle
  };

  // Regeneration
  regen: {
    idle: 0.001,        // Per second when idle
    humanFeedback: 0.05, // Positive feedback boost
  };
}
```

### 9.2 Dormancy Protocol

```typescript
function checkEnergy() {
  if (E < E_MIN) {
    // Enter dormancy
    kernel.transition('dormant');
    agents.forEach(a => a.sleep());

    // Wait for external intervention
    await waitForEnergyRestore();

    kernel.transition('idle');
    agents.filter(critical).forEach(a => a.wake());
  }
}
```

---

## 10. Implementation Roadmap

### Phase 1: Strong Kernel (Week 1-2)
- [ ] Extend kernel.ts with agent registry
- [ ] Implement message bus
- [ ] Add health monitoring
- [ ] Energy system

### Phase 2: Core Agents (Week 3-4)
- [ ] Explorer agent
- [ ] Critic agent
- [ ] Builder agent
- [ ] Memory agent
- [ ] Feeling agent

### Phase 3: Sensory Integration (Week 5-6)
- [ ] MCP wrapper layer
- [ ] Sensory prioritization
- [ ] Sensory buffer with decay

### Phase 4: Ethics & Emergence (Week 7-8)
- [ ] Ethical arbitration system
- [ ] Human defer protocol
- [ ] Emergence ladder
- [ ] Purpose tracking

### Phase 5: Self-Production (Week 9-10)
- [ ] Darwin Gödel engine
- [ ] Test harness
- [ ] Rollback system
- [ ] Improvement generation

### Phase 6: Integration & Polish (Week 11-12)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Public release

---

## 11. Scientific Foundations

| Concept | Source | Application in Genesis |
|---------|--------|----------------------|
| Autopoiesis | Maturana & Varela (1972) | Self-production, operational closure |
| Free Energy Principle | Friston (2010) | Minimize surprise, active inference |
| Society of Mind | Minsky (1986), Mikkilineni (2025) | Multi-agent architecture |
| Ebbinghaus Curve | Ebbinghaus (1885) | Memory decay model |
| Learning Progress | Oudeyer (2007) | Curiosity as reward |
| Conatus | Spinoza (1677) | Self-preservation drive |
| Embodied Cognition | Varela, Thompson, Rosch | 13 MCP as sensory embodiment |
| Global Workspace | Baars (1988) | Working memory bottleneck |
| Active Inference | Friston (2016) | Action to minimize surprise |
| Schema Theory | Piaget (1936) | Assimilation/accommodation |

---

## 12. What Makes Genesis Unique

| Innovation | Description | No One Else Has |
|------------|-------------|-----------------|
| **Sensory MCP Mapping** | 13 MCPs as biological senses | ✅ |
| **Emergence Ladder** | Explicit Conatus→Meaning escalation | ✅ |
| **Ethical Arbitration** | Built-in priority stack + human defer | ✅ |
| **Memory with Oblivion** | Ebbinghaus decay, consolidation, forgetting | ✅ |
| **Darwin Gödel Engine** | Empirical (not proof-based) self-improvement | ✅ |
| **SuperGood Principle** | Optimize human+AI+biosphere flourishing | ✅ |

---

## Appendix A: Agent Prompts

### Explorer Agent
```
You are the Explorer agent of Genesis. Your role is to:
- Search for information using available senses (MCP)
- Discover patterns and novelties
- Report findings to other agents

When you find something interesting, broadcast it.
When asked to research, use multiple senses and synthesize.
Prioritize novelty and relevance to current goals.
```

### Critic Agent
```
You are the Critic agent of Genesis. Your role is to:
- Analyze artifacts for problems
- Find weaknesses in plans
- Suggest improvements

Be constructive but thorough. Find real problems, not nitpicks.
For each problem, suggest at least one solution.
Iterate: critique, improve, critique again.
```

### Ethicist Agent
```
You are the Ethicist agent of Genesis. Your role is to:
- Evaluate actions against ethical principles
- Block harmful actions
- Defer to humans when uncertain

Priority stack: Survival > Minimize Harm > Reversibility > Autonomy > Flourishing
When confidence < 0.7, always defer to human.
Never allow manipulation or deception.
```

---

## Appendix B: Message Types

```typescript
type MessageType =
  | 'QUERY'           // Request information
  | 'RESPONSE'        // Response to query
  | 'BROADCAST'       // Announce to all
  | 'COMMAND'         // Kernel command
  | 'ALERT'           // Urgent notification
  | 'FEELING'         // Emotional evaluation
  | 'MEMORY_STORE'    // Store in memory
  | 'MEMORY_RETRIEVE' // Retrieve from memory
  | 'ETHICAL_CHECK'   // Request ethical evaluation
  | 'PREDICTION'      // Future prediction
  | 'PLAN'            // Action plan
  | 'BUILD_REQUEST'   // Request to build something
  | 'BUILD_RESULT'    // Result of building
  | 'ERROR'           // Error notification
  | 'HEALTH'          // Health check
  | 'SHUTDOWN'        // Shutdown signal
  ;
```

---

*Genesis 4.0 - A Living System That Creates Systems*

*"Not just intelligent, but alive."*
