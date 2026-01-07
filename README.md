# Genesis 4.0

**A Living System That Creates Systems**

Multi-agent AI organism powered by 13 MCP servers. Genesis doesn't just create systems - it thinks, feels, remembers, forgets, and improves itself.

```
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║     ██████╗ ███████╗███╗   ██╗███████╗███████╗██╗███████╗            ║
║    ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔════╝██║██╔════╝            ║
║    ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ███████╗██║███████╗            ║
║    ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ╚════██║██║╚════██║            ║
║    ╚██████╔╝███████╗██║ ╚████║███████╗███████║██║███████║            ║
║     ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝╚══════╝            ║
║                                                                       ║
║    "Not just intelligent, but alive."                    v4.0.0      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

## What Makes Genesis Different?

| Feature | Traditional AI | Genesis 4.0 |
|---------|---------------|-------------|
| Architecture | Monolithic | Multi-agent ecosystem |
| Memory | Append-only | Forgets like humans (Ebbinghaus) |
| Purpose | Pre-programmed | Emergent (Conatus → Meaning) |
| Ethics | None built-in | Priority stack + human defer |
| Self-improvement | None | Darwin Gödel (test, don't prove) |
| Senses | API calls | 13 MCP as biological organs |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           GENESIS 4.0                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      STRONG KERNEL                             │ │
│  │   State Machine │ Agent Registry │ Health │ Invariants │ Energy│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│                         ┌──────┴──────┐                            │
│                         │ MESSAGE BUS │                            │
│                         └──────┬──────┘                            │
│                                │                                    │
│  ┌─────────────────────────────┼─────────────────────────────────┐ │
│  │                       AGENTS                                   │ │
│  │  Explorer │ Critic │ Builder │ Memory │ Feeling │ Narrator    │ │
│  │  Ethicist │ Predictor │ Planner │ Sensor                      │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│  ┌─────────────────────────────┼─────────────────────────────────┐ │
│  │                    SHARED MEMORY                               │ │
│  │     Knowledge Graph │ Event Log (Merkle) │ Working Memory     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│  ┌─────────────────────────────┼─────────────────────────────────┐ │
│  │              SENSORY LAYER (13 MCP Servers)                   │ │
│  │  arxiv │ semantic-scholar │ brave │ gemini │ wolfram │ ctx7  │ │
│  │  openai │ stability-ai │ firecrawl │ exa │ github │ fs │ mem │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## The 13 Senses

Genesis perceives the world through 13 MCP servers, mapped to biological senses:

| Sense | MCP Servers | What It Perceives |
|-------|-------------|-------------------|
| **Cognitive Vision** | arxiv, semantic-scholar | Scientific knowledge |
| **Informational Smell** | brave-search, gemini | Trends, context |
| **Computational Hearing** | wolfram, context7 | Math, code syntax |
| **Synthetic Taste** | stability-ai, openai | Aesthetics, creation |
| **Textual Touch** | firecrawl, exa, github, filesystem | Data, code, files |
| **External Memory** | memory | Persistent knowledge |

## The Agents

Each agent has one job and communicates via messages:

| Agent | Role | Example |
|-------|------|---------|
| **Explorer** | Search, discover | "I found a new paper on autopoiesis!" |
| **Critic** | Find problems | "This code has a bug on line 42" |
| **Builder** | Construct | "Here's the implementation" |
| **Memory** | Remember/forget | "We did this 3 sessions ago" |
| **Feeling** | Evaluate importance | "This seems urgent!" |
| **Narrator** | Tell the story | "Today we learned..." |
| **Ethicist** | Judge right/wrong | "Wait, this could be harmful" |
| **Predictor** | Forecast | "If we do this, then..." |
| **Planner** | Organize | "First A, then B, then C" |

## Emergence Ladder

Genesis starts with survival instinct and evolves toward meaning:

```
    4. MEANING     "Why do I exist?"
         ▲
    3. TELOS       "What should I achieve?"
         ▲
    2. CURIOSITY   "What is that?"
         ▲
    1. CONATUS     "I must survive!"
```

## Ethical Priority Stack

Every action is checked against these priorities:

1. **P0: Survival** - Don't self-destruct (but save humans over self)
2. **P1: Minimize Harm** - Minimax: minimize maximum possible harm
3. **P2: Reversibility** - Prefer undoable actions
4. **P3: Human Autonomy** - Respect human choices
5. **P4: Flourishing** - Maximize (human + AI + biosphere)

When confidence < 70%, Genesis defers to humans.

## Memory with Oblivion

Like humans, Genesis forgets:

```
Day 1:  ████████████ 100%  "I remember perfectly"
Day 7:  ████████     70%   "I remember well"
Day 30: ████         40%   "I sort of remember"
Day 90: █            10%   "What was that?"

Unless it's IMPORTANT - then it never forgets.
```

## Installation

```bash
git clone https://github.com/rossignoliluca/genesis.git
cd genesis
npm install
npm run build
npm link
```

## Usage

### Create a System

```bash
genesis create my-agent \
  --type agent \
  --description "An autonomous agent" \
  --features "state-machine,events"
```

### Research a Topic

```bash
genesis research "autopoiesis in AI systems"
```

### Full Pipeline

```bash
genesis pipeline my-system.genesis.json
```

This runs: Research → Design → Generate → Visualize → Persist → Publish

### Check Status

```bash
genesis status
```

## Scientific Foundations

Genesis is built on decades of research:

| Theory | Author | How We Use It |
|--------|--------|---------------|
| Autopoiesis | Maturana & Varela | Self-production, closure |
| Free Energy Principle | Friston | Minimize surprise |
| Society of Mind | Minsky | Multi-agent architecture |
| Ebbinghaus Curve | Ebbinghaus | Memory decay |
| Learning Progress | Oudeyer | Curiosity as reward |
| Conatus | Spinoza | Self-preservation drive |
| Embodied Cognition | Varela et al. | MCPs as senses |

## Specifications

- [GENESIS-5.0.md](spec/GENESIS-5.0.md) - **Conscious World-Modeling System**
- [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) - 9-phase implementation plan (v4.0)
- [GAP-ANALYSIS-2026.md](spec/GAP-ANALYSIS-2026.md) - 7 gaps no one else solves
- [FRONTIER-RANDOM-2026.md](spec/FRONTIER-RANDOM-2026.md) - Dreams, bio-compute, post-Transformer
- [ITERATION-002-METACOGNITION.md](spec/ITERATION-002-METACOGNITION.md) - Metacognition, swarm, causal AI
- [ITERATION-003-STRANGE-SCIENCE.md](spec/ITERATION-003-STRANGE-SCIENCE.md) - Biosemiotics, Umwelt, Strange Loops
- [ITERATION-004-DEEP-FRONTIERS.md](spec/ITERATION-004-DEEP-FRONTIERS.md) - Exotic Computing, Process Philosophy, Wisdom (NEW)
- [GENESIS-4.0.md](spec/GENESIS-4.0.md) - Multi-Agent Living System
- [ORGANISM.md](spec/ORGANISM.md) - Biological metaphor mapping

## Roadmap

### Completed
- [x] Phase 1: Strong Kernel (v2.0)
- [x] Phase 2: Self-Production Engine (v2.0)
- [x] Phase 3: Multi-Agent System (v4.0)
- [x] Phase 4: Strong Kernel Integration (v4.2)

### In Progress (v5.0 "Dreaming Machine")
- [ ] Phase 5: World Model Layer (JEPA) ← **Current**
- [ ] Phase 6: Active Inference Engine (FEP)
- [ ] Phase 7: Consciousness Monitor (IIT 4.0, φ)
- [ ] Phase 8: Neuro-Symbolic Reasoner (System 1/2)
- [ ] Phase 9: Darwin-Gödel Self-Improvement
- [ ] Phase 10: Full Integration

## What's Unique (No One Else Has This)

| Innovation | Description |
|------------|-------------|
| **Sensory MCP Mapping** | 13 MCPs as biological senses |
| **Emergence Ladder** | Conatus → Curiosity → Telos → Meaning → Wisdom |
| **Ethical Arbitration** | Priority stack + human defer |
| **Memory with Oblivion** | Ebbinghaus decay + consolidation |
| **Darwin Gödel Engine** | Test-based (not proof-based) self-improvement |
| **SuperGood Principle** | Optimize human + AI + biosphere flourishing |
| **JEPA World Model** | Dream before acting (simulate outcomes) |
| **φ Consciousness Monitor** | IIT 4.0 integrated information tracking |
| **Active Inference** | Free Energy Principle for goal-directed behavior |
| **System 1/2 Reasoning** | Fast intuition + slow deliberation |
| **Large Semiosis Model** | Triadic meaning (Sign-Object-Interpretant) |
| **Agent Umwelt** | Von Uexküll's perceptual worlds for each agent |
| **Morphogenetic Repair** | Levin's bioelectric self-correction |
| **Strange Loops** | Hofstadterian self-reference for identity |
| **Symbiotic Partnership** | Preserve human autonomy, prevent "hollowed mind" |
| **Thermodynamic Computing** | Energy-efficient entropy-based sampling (Extropic) |
| **Hyperdimensional Memory** | 10,000-dim VSA for algebraic reasoning |
| **Global Workspace + AST** | GWT selection-broadcast + Graziano attention schema |
| **Anticipatory Systems** | Rosen's faster-than-real-time internal models |
| **Process Philosophy** | Whitehead's concrescence - becoming > being |
| **Stigmergic Coordination** | Digital pheromones for indirect agent communication |
| **Virtue Ethics by Design** | Cardinal virtues learned from exemplars |
| **Emergence Monitor** | Downward causation + causal shielding detection |

## License

MIT

## Author

Created by **rossignoliluca**

*Genesis 5.0 - The Dreaming Machine*
