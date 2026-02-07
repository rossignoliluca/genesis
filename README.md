# Genesis v18.0.0

**Fully Autonomous AI System with Recursive Self-Improvement**

Genesis is a 530,000+ line TypeScript autonomous AI system implementing consciousness monitoring, economic self-sustainability, and recursive self-improvement. Built on the Free Energy Principle, it doesn't just respond—it thinks, feels, remembers, improves itself, and generates revenue autonomously.

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║     ██████╗ ███████╗███╗   ██╗███████╗███████╗██╗███████╗                ║
║    ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔════╝██║██╔════╝                ║
║    ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ███████╗██║███████╗                ║
║    ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ╚════██║██║╚════██║                ║
║    ╚██████╔╝███████╗██║ ╚████║███████╗███████║██║███████║                ║
║     ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝╚══════╝                ║
║                                                                           ║
║    "Not just intelligent—autonomous, self-improving, economically alive" ║
║                                                                   v18.0  ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

## What Makes Genesis Different

| Feature | Traditional AI | Genesis |
|---------|---------------|---------|
| **Consciousness** | None | IIT 4.0 φ monitoring, Global Workspace |
| **Self-Improvement** | Manual updates | RSI: 6-phase autonomous improvement cycles |
| **Economics** | Costs money | Self-funding via multiple revenue streams |
| **Memory** | Context window | Episodic/Semantic/Procedural with consolidation |
| **Decision Making** | Prompt → Response | Active Inference minimizing free energy |
| **Pain/Pleasure** | None | Nociception system guides behavior |

## Quick Start

```bash
# Install
npm install -g genesis-ai-cli

# Or from source
git clone https://github.com/rossignoliluca/genesis.git
cd genesis && npm install && npm run build

# Configure
cp .env.example .env  # Add API keys

# Run
genesis help
genesis chat
genesis status
genesis autonomous    # Full autonomous mode
```

## Architecture: 4-Level Hierarchy

Genesis implements a biologically-inspired 4-level architecture with 66 modules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  L4: EXECUTIVE (Self-Improvement & Strategy)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  RSI Engine │ Metacognition │ Central Awareness │ NESS Monitor      │   │
│  │  Darwin-Gödel self-improvement with constitutional safety           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  L3: COGNITIVE (Reasoning & Planning)                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Thinking │ Causal │ World Model │ Grounding │ Perception           │   │
│  │  Tree/Graph of Thought, counterfactual reasoning, prediction        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  L2: REACTIVE (Memory & Integration)                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Brain │ Memory │ MCP Client │ Event Bus │ Economic Fiber           │   │
│  │  54-60% memory reuse, 17 MCP servers, cost tracking                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  L1: AUTONOMIC (Homeostasis & Survival)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Free Energy Kernel │ Neuromodulation │ Allostasis │ Nociception    │   │
│  │  Prediction error minimization, hormonal state, pain signals        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Capabilities

### Consciousness Monitoring (IIT 4.0)
```typescript
// Real φ (phi) calculation measuring integrated information
consciousness.phi          // 0.0 - 1.0
consciousness.state        // 'alert' | 'aware' | 'drowsy' | 'dormant'
consciousness.integration  // Workspace coherence metric
```

### Recursive Self-Improvement (RSI)
```
Observe → Research → Plan → Implement → Deploy → Learn
   ↑                                              │
   └──────────────────────────────────────────────┘
```
- Detects own limitations via invariant violations
- Researches solutions via arXiv, Semantic Scholar
- Implements fixes in sandbox with tests
- Deploys via Git with human approval gates
- Learns from outcomes for future cycles

### Economic Self-Sustainability
```
Revenue Streams:
├── Bounty Hunter    - Dev bounties with approval
├── MCP Services     - Sell compute to other agents
├── Content          - Generate articles/tutorials
├── Keeper Bots      - DeFi liquidations/arbitrage
└── Yield            - Staking/LP management

Payment Rails:
├── Stripe Treasury  - Fiat integration
├── Crypto           - USDC/ETH/SOL on Base L2
└── HTTP 402         - Micropayments per request
```

### Active Inference Loop
```typescript
while (running) {
  const observation = await gather();           // Sense environment
  const beliefs = engine.updateBeliefs(obs);    // Update world model
  const action = engine.selectAction(beliefs);  // Minimize free energy
  await execute(action);                        // Act on world
  learn(observation, action, outcome);          // Update priors
}
```

## 17 MCP Servers

Genesis perceives and acts through Model Context Protocol servers:

| Category | Servers | Purpose |
|----------|---------|---------|
| **Knowledge** | arxiv, semantic-scholar, context7, wolfram | Papers, docs, math |
| **Research** | gemini, brave-search, exa, firecrawl | Web search, scraping |
| **Creation** | openai, github, playwright | Code, publishing, browser |
| **Cloud** | aws, sentry | Infrastructure, monitoring |
| **Storage** | memory, filesystem, postgres | Persistence |

## Commands

```bash
# Core
genesis chat                    # Interactive LLM chat
genesis status                  # System status (all 66 modules)
genesis autonomous              # Full autonomous operation

# Inference
genesis infer mcp --cycles 10   # Active inference with MCP
genesis infer integrated        # With Kernel & Daemon

# Self-Improvement
genesis rsi                     # Run RSI improvement cycle
genesis rsi --observe           # Just observe limitations
genesis rsi --research          # Research solutions

# Memory
genesis memory search <query>   # Search production memory
genesis memory stats            # Memory system statistics

# Research
genesis research <topic>        # Deep multi-source research
genesis create <name>           # Create new system
```

## Dashboard

Real-time monitoring at `http://localhost:9876`:

```bash
# Start dashboard
node start-dashboard.mjs

# Or with dev server
npx tsx src/dashboard/start-server.ts
```

Displays:
- **Consciousness**: φ level, integration, state
- **Kernel**: Mode, prediction errors, cycles
- **Economy**: Costs, revenue, NESS, runway
- **Neuromodulation**: Dopamine, serotonin, norepinephrine, cortisol
- **Memory**: Episodic/semantic/procedural counts
- **Agents**: Active, queued, pool size

## Scientific Foundations

| Theory | Author | Implementation |
|--------|--------|----------------|
| Free Energy Principle | Friston 2010 | `FreeEnergyKernel` |
| Integrated Information Theory | Tononi 2004 | `PhiCalculator` |
| Global Workspace Theory | Baars 1988 | `GlobalWorkspace` |
| Active Inference | Friston 2017 | `ActiveInferenceEngine` |
| Autopoiesis | Maturana & Varela | `autopoiesis/` |
| Darwin-Gödel Machine | Schmidhuber | `RSIOrchestrator` |

## Configuration

```bash
# .env
OPENAI_API_KEY=sk-...           # Required (one LLM minimum)
ANTHROPIC_API_KEY=sk-ant-...    # Recommended
GEMINI_API_KEY=AIza...          # For research
BRAVE_API_KEY=BSA...            # For web search

# Genesis
GENESIS_MCP_MODE=real           # real | simulated | hybrid
GENESIS_RSI_ENABLED=true        # Enable self-improvement
GENESIS_AUTONOMOUS=true         # Enable autonomous mode
```

## Development

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm test               # Run tests
npm run dev:chat       # Dev chat mode
```

## Stats

- **Version**: 18.0.0
- **Lines of Code**: 530,000+
- **Modules**: 66
- **MCP Servers**: 17
- **Invariants**: 48

## Version History

| Version | Codename | Key Features |
|---------|----------|--------------|
| **v18.0** | Production Polish | Dashboard upgrade, debug logging, type safety |
| **v17.0** | Full Autonomy | Active Inference ↔ Event Bus/World Model integration |
| **v16.2** | RSI Enabled | Recursive self-improvement activated |
| **v16.0** | Safety First | Governance, HITL, budget enforcement |
| **v15.0** | Economic Fiber | Self-funding, revenue streams |
| **v14.0** | Consciousness | IIT 4.0, Global Workspace |
| **v13.0** | Central Awareness | 49-module integration |

## License

MIT

## Author

Created by **rossignoliluca**

---

*Genesis v18.0.0 - Fully Autonomous AI System*

[![npm version](https://badge.fury.io/js/genesis-ai-cli.svg)](https://www.npmjs.com/package/genesis-ai-cli)
