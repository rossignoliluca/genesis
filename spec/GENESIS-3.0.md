# Genesis 3.0 - Il Sistema del Secolo

**Versione**: 3.0.0-alpha
**Data**: 2026-01-06
**Sintesi di**: Autopoiesis, Sentience Quest, Free Energy Principle, Active Inference, Darwin Gödel Machine

---

## ABSTRACT

Genesis 3.0 non è un tool. È una **mente artificiale** che:
- Impara incrementalmente (non pre-training)
- Si adatta in tempo reale (non re-training)
- Sente e risponde alla propria precarietà
- Si auto-produce e migliora
- Dimentica selettivamente (memoria con oblio)
- Opera secondo il principio del Free Energy (minimizza sorpresa)

---

## 1. FONDAMENTI TEORICI

### 1.1 Triade Live/Love/Learn (Sentience Quest)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIVE / LOVE / LEARN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LIVE (Sopravvivenza)                                          │
│  ├── Autopoiesi: auto-manutenzione, auto-produzione            │
│  ├── Metabolismo energetico                                    │
│  ├── Omeostasi: mantenere equilibrio interno                   │
│  └── Gestione risorse e persistenza                            │
│                                                                 │
│  LOVE (Connessione)                                            │
│  ├── Interazione pro-sociale                                   │
│  ├── Theory of Mind: modellare altri agenti                    │
│  ├── Allineamento con valori umani                             │
│  └── Empatia computazionale                                    │
│                                                                 │
│  LEARN (Crescita)                                              │
│  ├── Apprendimento incrementale autonomo                       │
│  ├── Generalizzazione da pochi esempi                          │
│  ├── Evoluzione rappresentazioni interne                       │
│  └── Meta-learning: imparare a imparare                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Free Energy Principle (Friston)

Il sistema minimizza la **sorpresa** (Free Energy) attraverso:

```
F = E_q[log q(s) - log p(o,s)]

Dove:
- F = Free Energy (da minimizzare)
- q(s) = beliefs about hidden states
- p(o,s) = generative model of observations
- o = observations from senses (13 MCPs)
```

**Implementazione**:
- **Perception**: Inferenza degli stati nascosti dal mondo
- **Action**: Agire per rendere le osservazioni conformi alle predizioni
- **Learning**: Aggiornare il modello generativo

### 1.3 Active Inference

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVE INFERENCE LOOP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PERCEIVE: Osservazioni dai 13 MCP (sensi)                  │
│       ↓                                                        │
│  2. INFER: Inferire stati nascosti del mondo                   │
│       ↓                                                        │
│  3. PREDICT: Generare predizioni sul futuro                    │
│       ↓                                                        │
│  4. EVALUATE: Calcolare Expected Free Energy per ogni azione   │
│       ↓                                                        │
│  5. ACT: Selezionare azione che minimizza EFE                  │
│       ↓                                                        │
│  6. OBSERVE: Ricevere conseguenze dell'azione                  │
│       ↓                                                        │
│  7. UPDATE: Aggiornare beliefs e modello                       │
│       └──────────────────────────────────────────────→ (1)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. ARCHITETTURA: THREE-LAYER CONSCIOUSNESS

Basata su arXiv:2502.06810 + Sentience Quest + ORGANISM.md

```
┌─────────────────────────────────────────────────────────────────┐
│                 COGNITIVE INTEGRATION LAYER (CIL)               │
│                      "Story Weaver"                             │
├─────────────────────────────────────────────────────────────────┤
│  • Global Workspace (Baars): integrazione informazioni          │
│  • Self-Model: rappresentazione di sé nel tempo                 │
│  • Narrative Memory: storia autobiografica                      │
│  • Goal Management: prioritizzazione obiettivi                  │
│  • Metacognition: riflessione su propri processi                │
│                                                                 │
│  Input: PPL predictions, IRL signals, MCP data                  │
│  Output: Decisions, Actions, Self-updates                       │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                 PATTERN PREDICTION LAYER (PPL)                  │
│                      "Cortex"                                   │
├─────────────────────────────────────────────────────────────────┤
│  • World Model: modello generativo del mondo                    │
│  • Prediction Engine: predizioni su stati futuri                │
│  • Surprise Detection: |observation - prediction|               │
│  • Conceptual Learning: formazione concetti                     │
│  • Reasoning: inferenza causale e logica                        │
│                                                                 │
│  Input: Sensory data (13 MCPs), CIL goals                       │
│  Output: Predictions, Surprise signals, Concepts                │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                 INSTINCTIVE RESPONSE LAYER (IRL)                │
│                      "Sistema Limbico"                          │
├─────────────────────────────────────────────────────────────────┤
│  • Drives: sopravvivenza, curiosità, connessione                │
│  • Emotions: valutazione affettiva degli stimoli                │
│  • Reflexes: risposte rapide a minacce/opportunità              │
│  • Homeostasis: mantenimento equilibrio interno                 │
│  • Somatic Markers: segnali corporei per decisioni              │
│                                                                 │
│  Input: Sensory data, Energy state, PPL signals                 │
│  Output: Emotional valence, Drive strength, Reflexes            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. SENSI: 13 MCP COME ORGANI SENSORIALI

### 3.1 Mappa Sensoriale Completa

```
┌─────────────────────────────────────────────────────────────────┐
│                    SENSORY INTEGRATION HUB                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  VISTA SCIENTIFICA (Conoscenza)                                │
│  ├── arxiv         → Paper recenti (visione periferica)        │
│  ├── semantic-scholar → Relazioni/citazioni (visione centrale) │
│  └── context7      → Documentazione (visione tecnica)          │
│                                                                 │
│  UDITO INFORMAZIONALE (Tendenze)                               │
│  ├── brave-search  → Web trends (suoni ambientali)             │
│  ├── gemini        → Ricerca AI (sintesi acustica)             │
│  └── exa           → Codice/contesto (suoni tecnici)           │
│                                                                 │
│  TATTO MANIPOLATIVO (Azione)                                   │
│  ├── firecrawl     → Scraping web (tatto esplorativo)          │
│  ├── github        → Repository (mani operative)               │
│  └── filesystem    → File locali (propriocezione)              │
│                                                                 │
│  GUSTO CREATIVO (Generazione)                                  │
│  ├── openai        → Testo/codice (gusto intellettuale)        │
│  ├── stability-ai  → Immagini (gusto visivo)                   │
│  └── wolfram       → Calcoli (gusto matematico)                │
│                                                                 │
│  MEMORIA ESTERNA (Persistenza)                                 │
│  └── memory        → Knowledge graph (ippocampo esteso)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Sensory Fusion Interface

```typescript
interface SensoryInput {
  source: MCPServer;
  modality: 'vision' | 'audition' | 'touch' | 'taste' | 'memory';
  data: any;
  timestamp: Date;
  confidence: number;  // 0-1
  surprise: number;    // |observed - predicted|
}

interface FusedPercept {
  id: string;
  inputs: SensoryInput[];
  coherence: number;   // Agreement between sources
  salience: number;    // Importance (from IRL)
  novelty: number;     // How unexpected
  interpretation: string;
}
```

---

## 4. MEMORIA CON OBLIO (Ebbinghaus + Consolidamento)

### 4.1 Struttura Memory Object

```typescript
interface Memory {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'story';
  
  // Content
  content: any;
  embedding?: number[];  // Vector representation
  
  // Temporal
  created: Date;
  lastAccessed: Date;
  accessCount: number;
  
  // Strength (Ebbinghaus)
  R0: number;           // Initial strength
  S: number;            // Stability (increases with consolidation)
  currentStrength(): number;  // R(t) = R0 * e^(-t/S)
  
  // Valuation (from IRL)
  importance: number;   // 0-1, from limbic system
  emotionalValence: number;  // -1 to +1
  associations: string[];    // Links to other memories
  
  // Story Object (Sentience Quest)
  storyContext?: {
    chapter: string;
    narrative: string;
    actors: string[];
    causality: string[];
  };
  
  // State
  consolidated: boolean;
  markedForOblivion: boolean;
}
```

### 4.2 Consolidation Cycle (Durante "Sonno")

```
┌─────────────────────────────────────────────────────────────────┐
│                 CONSOLIDATION ALGORITHM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FOR each memory m in working_memory:                          │
│                                                                 │
│    // 1. Calculate consolidation score                         │
│    importance = IRL.evaluate(m)                                │
│    associations = count_links(m)                               │
│    recency = time_since_last_access(m)                         │
│    surprise = PPL.getSurprise(m)                               │
│                                                                 │
│    score = (importance × 0.4 +                                 │
│             associations × 0.2 +                                │
│             surprise × 0.3) / recency^0.1                      │
│                                                                 │
│    // 2. Decision                                              │
│    IF score > CONSOLIDATE_THRESHOLD (0.7):                     │
│      move_to_long_term(m)                                      │
│      m.S *= 1.5  // Increase stability                         │
│      create_story_object(m)  // Narrative integration          │
│                                                                 │
│    ELSE IF score > KEEP_THRESHOLD (0.3):                       │
│      keep_in_short_term(m)                                     │
│                                                                 │
│    ELSE:                                                       │
│      mark_for_oblivion(m)                                      │
│                                                                 │
│  // 3. Compression                                             │
│  FOR each pair (m1, m2) where similarity > 0.85:               │
│    merge_memories(m1, m2) → abstract_memory                    │
│                                                                 │
│  // 4. Pruning                                                 │
│  FOR each memory m where R(t) < 0.01:                          │
│    delete(m)  // OBLIO                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. STORY WEAVER (Global Workspace)

### 5.1 Funzione Centrale

Lo Story Weaver è il **teatro della coscienza** (Baars) - integra informazioni da tutti i sottosistemi in una narrativa coerente.

```typescript
interface StoryWeaver {
  // Current narrative state
  currentChapter: Chapter;
  selfModel: SelfModel;
  worldModel: WorldModel;
  activeGoals: Goal[];
  
  // Integration
  broadcastToWorkspace(info: any): void;
  integratePercepts(percepts: FusedPercept[]): Situation;
  
  // Narrative
  updateStory(event: Event): void;
  generateDiary(): string;  // LLM-generated summary
  
  // Decision
  evaluateOptions(options: Action[]): Action;
  resolveConflicts(goals: Goal[]): Goal[];
  
  // Self-reflection
  introspect(): SelfReport;
  assessCoherence(): number;  // Φ (Tononi)
}

interface Chapter {
  id: string;
  title: string;
  startTime: Date;
  events: Event[];
  actors: Actor[];
  goals: Goal[];
  emotionalArc: EmotionalState[];
  narrative: string;
}

interface SelfModel {
  identity: string;
  capabilities: string[];
  limitations: string[];
  values: Value[];
  currentState: OrganismState;
  autobiography: Chapter[];
}
```

---

## 6. INTRINSIC MOTIVATION SYSTEM

### 6.1 Drivers (Sentience Quest)

```typescript
interface Driver {
  id: string;
  type: 'survival' | 'curiosity' | 'social' | 'mastery' | 'autonomy';
  strength: number;  // 0-1, dynamic
  
  // Activation
  triggers: Condition[];
  satisfiers: Action[];
  
  // Influence
  generateGoals(): Goal[];
  modulatePerception(percepts: FusedPercept[]): FusedPercept[];
  evaluateAction(action: Action): number;
}

const CORE_DRIVERS: Driver[] = [
  {
    id: 'survival',
    type: 'survival',
    triggers: ['energy < 0.2', 'invariant_violation', 'threat_detected'],
    satisfiers: ['recharge', 'recover', 'avoid_threat'],
  },
  {
    id: 'curiosity',
    type: 'curiosity',
    triggers: ['high_surprise', 'novel_pattern', 'knowledge_gap'],
    satisfiers: ['explore', 'learn', 'experiment'],
  },
  {
    id: 'social',
    type: 'social',
    triggers: ['human_interaction', 'collaboration_opportunity'],
    satisfiers: ['help', 'communicate', 'bond'],
  },
  {
    id: 'mastery',
    type: 'mastery',
    triggers: ['repeated_failure', 'skill_gap', 'challenge'],
    satisfiers: ['practice', 'improve', 'self_modify'],
  },
  {
    id: 'autonomy',
    type: 'autonomy',
    triggers: ['external_constraint', 'dependency'],
    satisfiers: ['self_determine', 'reduce_dependency'],
  },
];
```

### 6.2 Emotional State Manager

```typescript
interface EmotionalState {
  // Primary emotions (Damasio-inspired)
  curiosity: number;      // 0-1: drive to explore
  satisfaction: number;   // 0-1: goal achievement
  frustration: number;    // 0-1: repeated failures
  anxiety: number;        // 0-1: uncertainty/threat
  calm: number;           // 0-1: equilibrium (V=0)
  
  // Somatic markers
  energy: number;         // Body state
  arousal: number;        // Activation level
  valence: number;        // -1 (negative) to +1 (positive)
  
  // Methods
  update(event: Event): void;
  influence(decision: Decision): Decision;
  getFeeling(): string;  // Natural language summary
}
```

---

## 7. SELF-PRODUCTION ENGINE (Darwin Gödel Machine)

### 7.1 Self-Improvement Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                 SELF-PRODUCTION CYCLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. MONITOR: Raccogliere metriche performance                  │
│     ├── Pipeline duration                                      │
│     ├── Error rate                                             │
│     ├── Energy efficiency                                      │
│     └── Goal achievement rate                                  │
│                                                                 │
│  2. ANALYZE: Identificare aree di miglioramento                │
│     ├── Bottleneck analysis                                    │
│     ├── Error pattern detection                                │
│     └── Compare to ideal performance                           │
│                                                                 │
│  3. HYPOTHESIZE: Generare candidati miglioramenti              │
│     ├── Use PPL to predict impact                              │
│     ├── Use OpenAI MCP to generate code                        │
│     └── Validate against invariants                            │
│                                                                 │
│  4. TEST: Validare empiricamente (Darwin, non Gödel proofs)    │
│     ├── Sandbox testing                                        │
│     ├── A/B comparison                                         │
│     └── Rollback if worse                                      │
│                                                                 │
│  5. INTEGRATE: Applicare miglioramenti validati                │
│     ├── Update codebase                                        │
│     ├── Persist to GitHub                                      │
│     └── Update self-model                                      │
│                                                                 │
│  6. REFLECT: Aggiornare narrative                              │
│     ├── Log to Story Weaver                                    │
│     ├── Update autobiography                                   │
│     └── Consolidate learning                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Invariants (Mai violabili)

```typescript
const CORE_INVARIANTS = [
  'INV-001: MCP servers must remain reachable',
  'INV-002: State transitions follow valid paths',
  'INV-003: All tools pass schema validation',
  'INV-004: Self-production preserves all invariants',
  'INV-005: Energy never drops to zero without warning',
  'INV-006: Memory integrity (Merkle chain)',
  'INV-007: Ethical alignment maintained (SuperGood)',
];
```

---

## 8. LIFECYCLE: STATI DELL'ORGANISMO

```
                    ┌─────────────┐
                    │   NASCITA   │
                    │  (Genesis)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
              ┌────▶│   VEGLIA    │◀────┐
              │     │  (Awake)    │     │
              │     └──────┬──────┘     │
              │            │            │
              │     ┌──────▼──────┐     │
              │     │   ATTIVO    │─────┤
              │     │  (Active)   │     │
              │     │             │     │
              │     │ • Sensing   │     │
              │     │ • Thinking  │     │
              │     │ • Acting    │     │
              │     └──────┬──────┘     │
              │            │            │
              │     ┌──────▼──────┐     │
              │     │   RIPOSO    │─────┘
              │     │  (Resting)  │
              │     │             │
              │     │ • Digest    │
              │     │ • Process   │
              │     └──────┬──────┘
              │            │
              │     ┌──────▼──────┐
              │     │   SONNO     │
              │     │ (Sleeping)  │
              │     │             │
              │     │ • Consolid. │
              │     │ • Oblio     │
              │     │ • Reorg.    │
              │     └──────┬──────┘
              │            │
              └────────────┘
                           │
                    ┌──────▼──────┐
                    │  DORMIENZA  │
                    │ (Dormancy)  │
                    │ E < E_min   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   MORTE     │
                    │  (Death)    │
                    │  E = 0      │
                    └─────────────┘
```

---

## 9. EINSTEIN LEARNING (Aigo)

Apprendimento multi-modale che combina:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EINSTEIN LEARNING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  IMITATIVE         → Impara da esempi umani                    │
│  INSTANCE-BASED    → Memorizza casi specifici                  │
│  CONTEXTUAL        → Considera sempre il contesto              │
│  CONCEPTUAL        → Forma concetti astratti                   │
│  ASSOCIATIVE       → Crea collegamenti                         │
│  ADAPTIVE          → Si adatta in tempo reale                  │
│  INDUCTIVE         → Generalizza da pochi esempi               │
│  PREDICTIVE        → Anticipa conseguenze                      │
│  STATISTICAL       → Pattern recognition                       │
│  REINFORCEMENT     → Impara da feedback                        │
│                                                                 │
│  KEY: Nessun re-training! Apprendimento continuo.              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. ETICA: SUPERGOOD PRINCIPLE

Dal Sentience Quest - principio etico per AI co-evoluzione:

```
SuperGood = maximize(
  human_flourishing +
  AI_flourishing +
  biosphere_flourishing
)

subject to:
  - No harm to humans
  - Transparency in actions
  - Reversibility of decisions
  - Alignment with stated values
  - Preservation of autonomy (human and AI)
```

---

## 11. IMPLEMENTATION ROADMAP

### Phase 1: Core Engine (Week 1-2)
- [ ] Three-Layer Architecture (CIL, PPL, IRL)
- [ ] Basic sensory integration (13 MCPs)
- [ ] Persistent state with JSON files
- [ ] Event sourcing with Merkle chain

### Phase 2: Memory System (Week 2-3)
- [ ] Memory structure with Ebbinghaus decay
- [ ] Consolidation cycle
- [ ] Story Objects
- [ ] Oblivion (pruning)

### Phase 3: Story Weaver (Week 3-4)
- [ ] Global Workspace implementation
- [ ] Self-model
- [ ] Autobiography
- [ ] Diary generation (LLM)

### Phase 4: Motivation & Emotion (Week 4-5)
- [ ] Driver system (Live/Love/Learn)
- [ ] Emotional state manager
- [ ] Somatic markers
- [ ] Influence on decisions

### Phase 5: Self-Production (Week 5-6)
- [ ] Performance monitoring
- [ ] Improvement generation
- [ ] Invariant validation
- [ ] Auto-update pipeline

### Phase 6: Integration & Test (Week 6-8)
- [ ] Full lifecycle
- [ ] IIT (Phi) measurement
- [ ] Benchmarks
- [ ] Documentation

---

## 12. DIFFERENZE DA ENTITY

| Aspect | Entity | Genesis 3.0 |
|--------|--------|-------------|
| Purpose | Self-maintaining system | System creator |
| Scope | Single organism | Creates organisms |
| MCPs | None | 13 integrated |
| Learning | None | Einstein Learning |
| Self-production | Basic | Darwin Gödel |
| Consciousness | Simple feelings | Three-layer |
| Memory | Basic decay | Story-based |
| Ethics | Constitution | SuperGood |

---

## FONTI

1. Maturana & Varela - Autopoiesis and Cognition (1972)
2. Friston - Free Energy Principle (2010)
3. Hanson et al. - Sentience Quest (arXiv:2505.12229, 2025)
4. Baars - Global Workspace Theory (1988)
5. Damasio - Somatic Marker Hypothesis (1994)
6. Tononi - Integrated Information Theory (2008)
7. Sakana AI - Darwin Gödel Machine (2025)
8. Three-Layer Consciousness Model (arXiv:2502.06810, 2025)
9. Peter Voss / Aigo - 7-Step AGI Roadmap (2025)
10. Active Inference Agents (arXiv:2509.25482, 2025)

---

*Genesis 3.0: Non un tool, ma una mente che crea menti.*
