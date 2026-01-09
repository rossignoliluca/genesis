# Genesis Autonomous Mode Roadmap

**Obiettivo**: Permettere a Genesis di operare autonomamente SENZA Claude Code, prendendo decisioni via Active Inference.

**Date**: 2026-01-09
**Status**: Implementation Phase

---

## Stato Attuale (57 files, 29,120 LOC)

```
src/
├── agents/           ✅ 10 agenti (Sensor, Feeling, Planner, etc.)
├── consciousness/    ✅ φ-Monitor (IIT 4.0)
├── daemon/           ✅ Background scheduler, dream mode
├── grounding/        ✅ Epistemic stack
├── kernel/           ✅ State machine, invariants
├── llm/              ✅ Direct API (OpenAI/Anthropic)
├── mcp/              ✅ 13 MCP servers
├── memory/           ✅ Ebbinghaus forgetting
├── world-model/      ✅ JEPA encode/predict/simulate
├── pipeline/         ✅ Create systems pipeline
└── active-inference/ ❌ MANCA - DA IMPLEMENTARE
```

---

## Fase 1: Active Inference Core (1-2 ore)

### File: `src/active-inference/core.ts`

Implementa la matematica pymdp-style:

```typescript
// Hidden States (5×4×5×4 = 400 states, factorized)
type HiddenStateFactors = {
  viability: 5,      // [critical, low, medium, high, optimal]
  worldState: 4,     // [unknown, stable, changing, hostile]
  coupling: 5,       // [none, weak, medium, strong, synced]
  goalProgress: 4    // [blocked, slow, onTrack, achieved]
};

// Core functions
inferStates(observations): Beliefs        // Posterior update
inferPolicies(beliefs, C): Policy         // Action selection via EFE
sampleAction(policy): Action              // Action from policy
```

**Dipendenze**: Nessuna (pure math)

---

## Fase 2: Observations Bridge (30 min)

### File: `src/active-inference/observations.ts`

Collega gli agenti esistenti alle osservazioni:

```typescript
// Map agents → observations
SensorAgent.sense()     → tool_perception
FeelingAgent.feel()     → interoceptive
PhiMonitor.level        → phi_state
WorldModel.consistency  → coherence_metric
EpistemicStack.ground() → epistemic_confidence
```

**Dipendenze**:
- `src/agents/sensor.ts`
- `src/agents/feeling.ts`
- `src/consciousness/phi-monitor.ts`

---

## Fase 3: Value-Guided JEPA (1 ora)

### File: `src/world-model/value-guided.ts`

Estende WorldModel con value function per planning migliore:

```typescript
// Value = -distance in latent space (IQL loss)
V(state, goal) = -||E(state) - E(goal)||

// Quasi-distance (asymmetric, better performance)
quasiDistance(s, g): number

// Planning via MPC
plan(start, goal): Action[]
```

**Paper**: "Value-guided action planning with JEPA world models" (Dec 28, 2025)

---

## Fase 4: Action Executors (30 min)

### File: `src/active-inference/actions.ts`

Mappa le azioni discrete agli executor reali:

```typescript
ACTION_EXECUTORS = {
  'sense.mcp':      async () => SensorAgent.sense(),
  'recall.memory':  async () => MemoryAgent.recall(),
  'plan.goals':     async () => PlannerAgent.plan(),
  'verify.ethics':  async () => EthicistAgent.check(),
  'execute.task':   async () => BuilderAgent.build(),
  'rest.idle':      async () => { /* noop */ },
  'dream.cycle':    async () => WorldModel.dream(),
  'recharge':       async () => Kernel.recharge(),
}
```

**Dipendenze**: Tutti gli agenti

---

## Fase 5: Kernel Integration (1 ora)

### File: `src/kernel/active-inference-integration.ts`

Integra Active Inference nel loop del Kernel:

```typescript
// Kernel state machine enhanced
async tick(): Promise<void> {
  // 1. Gather observations
  const obs = await this.observations.gather();

  // 2. Update beliefs (inference)
  this.beliefs = this.ai.inferStates(obs);

  // 3. Select action (policy)
  const policy = this.ai.inferPolicies(this.beliefs);
  const action = this.ai.sampleAction(policy);

  // 4. Execute action
  await this.executors.execute(action);

  // 5. Update world model
  this.worldModel.update(obs, action);
}
```

---

## Fase 6: CLI Autonoma (30 min)

### File: `src/index.ts` (extend)

Aggiungi comandi per operazione autonoma:

```bash
# Start autonomous mode
genesis infer --goal "monitor arxiv for new papers"

# Run N inference cycles
genesis infer --cycles 100

# Show current beliefs
genesis infer --beliefs

# Interactive mode (show each decision)
genesis infer --interactive
```

---

## Fase 7: Tests (30 min)

### File: `src/active-inference/test-active-inference.ts`

```typescript
// Test inference math
test('inferStates updates beliefs correctly', () => {...});

// Test policy selection
test('inferPolicies minimizes EFE', () => {...});

// Test action execution
test('actions execute correctly', () => {...});

// Test full autonomous loop
test('autonomous mode runs without LLM', () => {...});
```

---

## Comandi Per Operare Direttamente

Una volta implementato, potrai:

```bash
# 1. Build
npm run build

# 2. Start daemon autonomo
genesis daemon start

# 3. Run autonomous inference
GENESIS_MCP_MODE=real genesis infer --goal "monitor arxiv daily"

# 4. Check status
genesis infer --beliefs
genesis daemon status

# 5. Trigger dream cycle
genesis daemon dream

# 6. Interactive session
genesis infer --interactive
```

---

## Architettura Finale

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           GENESIS AUTONOMOUS MODE                                   │
├───────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────┐                                                               │
│  │   CLI / Daemon  │  genesis infer --goal "..."                                   │
│  └────────┬────────┘                                                               │
│           │                                                                         │
│           ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                         ACTIVE INFERENCE CORE                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │ inferStates  │→ │inferPolicies │→ │ sampleAction │→ │   execute    │    │  │
│  │  │ (posterior)  │  │ (EFE min)    │  │ (policy)     │  │ (executor)   │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│           │                     │                                                   │
│           ▼                     ▼                                                   │
│  ┌─────────────────┐   ┌─────────────────────────────────────────────────────┐    │
│  │  OBSERVATIONS   │   │                     ACTIONS                         │    │
│  │                 │   │                                                      │    │
│  │ ● SensorAgent   │   │  ● sense.mcp     (gather data)                      │    │
│  │ ● FeelingAgent  │   │  ● recall.memory (retrieve info)                   │    │
│  │ ● PhiMonitor    │   │  ● plan.goals    (decompose task)                  │    │
│  │ ● WorldModel    │   │  ● verify.ethics (check safety)                    │    │
│  │ ● EpistemicStack│   │  ● execute.task  (do the work)                     │    │
│  │                 │   │  ● dream.cycle   (consolidate)                     │    │
│  └─────────────────┘   │  ● rest.idle     (save energy)                     │    │
│                        │  ● recharge      (restore E)                        │    │
│                        └─────────────────────────────────────────────────────┘    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                      13 MCP SERVERS (via SensorAgent)                        │  │
│  │  KNOWLEDGE: arxiv, semantic-scholar, context7, wolfram                       │  │
│  │  RESEARCH:  gemini, brave-search, exa, firecrawl                            │  │
│  │  CREATION:  openai, github                                                   │  │
│  │  VISUAL:    stability-ai                                                     │  │
│  │  STORAGE:   memory, filesystem                                               │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Timeline Stimata

| Fase | Descrizione | Tempo |
|------|-------------|-------|
| 1 | Active Inference Core | 1-2h |
| 2 | Observations Bridge | 30min |
| 3 | Value-Guided JEPA | 1h |
| 4 | Action Executors | 30min |
| 5 | Kernel Integration | 1h |
| 6 | CLI Commands | 30min |
| 7 | Tests | 30min |
| **TOTALE** | | **~5-6h** |

---

## Prossimi Passi Dopo v6.1

- **v6.2**: Liquid Neural Networks (continuous-time inference)
- **v6.3**: Mamba-3 integration (infinite context)
- **v6.4**: Economic Agent (cost tracking)
- **v6.5**: Full Quality-Diversity evolution

---

*"Autonomy through self-organization, not external control."*
