# Genesis 7.4.5

**Claude Code Equivalent - Autonomous AI System Creator**

Genesis is a self-improving AI system powered by 13 MCP servers. It doesn't just create systems - it thinks, feels, remembers, and operates autonomously via Active Inference. **Now with Local-First optimization: works offline with Ollama, caches fixes, and gracefully degrades when cloud unavailable.**

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
║    "Not just intelligent, but alive."                    v7.4.5      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

## Quick Start

```bash
# Install from npm (recommended)
npm install -g genesis-ai-cli

# Or clone and build from source
git clone https://github.com/rossignoliluca/genesis.git
cd genesis
npm install
npm run build
npm link

# Configure API keys
cp .env.example .env
# Edit .env with your API keys (see below)
chmod 600 .env

# Start!
genesis help
genesis chat
genesis infer mcp --cycles 10
```

## Use as MCP Server (Claude Code / Claude Desktop)

Genesis can be installed as an MCP server, giving Claude access to:
- **genesis.chat** - Multi-model AI with auto-routing (GPT-4, Claude, Gemini, local Ollama)
- **genesis.research** - Deep research using 20+ sources (arXiv, Semantic Scholar, Brave, etc.)
- **genesis.analyze** - Code/data analysis with multi-perspective reasoning

```bash
# Add to Claude Code
claude mcp add genesis -- npx genesis-ai-cli mcp-server

# Or manual config in Claude Desktop settings:
# Add to ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "genesis": {
      "command": "npx",
      "args": ["genesis-ai-cli", "mcp-server"]
    }
  }
}
```

## API Keys Setup

Copy `.env.example` to `.env` and add your keys:

| Service | Get Key At | Required |
|---------|------------|----------|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Yes* |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Yes* |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Recommended |
| Brave Search | [brave.com/search/api](https://brave.com/search/api/) | Recommended |
| Firecrawl | [firecrawl.dev](https://firecrawl.dev/) | Optional |
| Exa | [exa.ai](https://exa.ai/) | Optional |
| Stability AI | [platform.stability.ai](https://platform.stability.ai/) | Optional |

*At least one LLM provider required

## Core Commands

### Chat Mode
```bash
genesis chat                        # Interactive chat (uses OpenAI)
genesis chat --provider anthropic   # Use Claude
genesis chat --model gpt-4o         # Specific model
```

### Standalone Tools
```bash
# Code execution (sandboxed)
genesis bash "npm test"             # Execute safely
genesis bash "ls -la" --timeout 5000

# File editing (diff-based)
genesis edit src/app.ts --old "foo" --new "bar"

# Git operations
genesis git status
genesis git commit "fix: bug in parser"

# Interactive REPL
genesis repl                        # Full REPL with tools
```

### Local-First (NEW in 6.8!)
```bash
# Mac setup (installs Ollama + models)
./bin/setup-mac.sh

# Hybrid routing (local for simple, cloud for complex)
genesis chat                        # Auto-routes to best LLM
genesis chat --local                # Force local (Ollama)
genesis chat --cloud                # Force cloud (OpenAI/Anthropic)

# Works offline!
# - Fix cache: instant reuse of successful fixes
# - Project indexer: search code without LLM
# - Resilient MCP: automatic fallback when offline
```

### Autonomous Inference
```bash
genesis infer mcp --cycles 10       # Run with REAL MCP observations
genesis infer mcp --verbose         # See detailed beliefs/actions
genesis infer integrated            # With Kernel & Daemon
```

### MCP Servers
```bash
genesis status                      # Show all 13 MCP servers
genesis mcp test --server memory    # Test a server
genesis mcp list --server arxiv     # List available tools
```

### System Creation
```bash
genesis create my-agent --type agent --description "An autonomous agent"
genesis research "autopoiesis in AI"
genesis pipeline spec.json --execute
```

## The 13 MCP Servers

Genesis perceives the world through 13 sensory channels:

| Category | Servers | Purpose |
|----------|---------|---------|
| **KNOWLEDGE** | arxiv, semantic-scholar, context7, wolfram | Papers, docs, math |
| **RESEARCH** | gemini, brave-search, exa, firecrawl | Web search, scraping |
| **CREATION** | openai, github | Code generation, publishing |
| **VISUAL** | stability-ai | Image generation |
| **STORAGE** | memory, filesystem | Knowledge graph, files |

## Active Inference

Genesis 6.3 introduces autonomous operation via the Free Energy Principle:

```
Observations (from MCPs) → Beliefs → Actions → World Change → New Observations
```

The system:
- **Senses** via real MCP calls (memory, brave-search, etc.)
- **Infers** beliefs about viability, world state, coupling
- **Decides** actions to minimize surprise (Free Energy)
- **Acts** autonomously (plan, execute, verify, rest)

```bash
# Watch Genesis think autonomously
genesis infer mcp --cycles 20 --verbose

# Output:
# [   1] plan.goals      | V:optimal  Lat:321ms
# [   2] execute.task    | V:optimal  Lat:150ms
# [   3] sense.mcp       | V:optimal  Lat:120ms
# ...
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GENESIS 7.4                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    STANDALONE TOOLS (NEW!)                   │   │
│  │   Bash Sandbox │ Edit │ Git │ Self-Healing │ Human Loop     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    ACTIVE INFERENCE                          │   │
│  │   Observations → Beliefs → Actions → World Model Update     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     STRONG KERNEL                            │   │
│  │   10 Agents │ Message Bus │ State Machine │ Invariants      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   MCP OBSERVATION BRIDGE                     │   │
│  │   Real MCP calls → Energy, Phi, Tool, Coherence metrics     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  13 MCP SERVERS (Senses)                     │   │
│  │  arxiv │ brave │ gemini │ memory │ github │ stability-ai   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Standalone Features (v6.7)

Genesis is now **Claude Code equivalent** with these standalone capabilities:

| Feature | Module | Description |
|---------|--------|-------------|
| **Bash Sandbox** | `src/tools/bash.ts` | Secure command execution with whitelist/blacklist |
| **Edit Tool** | `src/tools/edit.ts` | Diff-based file editing with unique match |
| **Git Operations** | `src/tools/git.ts` | Native status, diff, commit, push |
| **Self-Healing** | `src/healing/*` | Darwin-Gödel pattern for auto-fix |
| **Grounding** | `src/grounding/*` | Compile + test + semantic verification |
| **Tool Orchestration** | `src/cli/dispatcher.ts` | Multi-format parsing, parallel execution |
| **Human-in-Loop** | `src/cli/human-loop.ts` | Confirmations, choices, destructive warnings |

## Environment Variables

```bash
# Required (at least one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Recommended
GEMINI_API_KEY=AIza...
BRAVE_API_KEY=BSA...

# Optional
FIRECRAWL_API_KEY=fc-...
EXA_API_KEY=...
STABILITY_AI_API_KEY=sk-...

# Genesis config
GENESIS_MCP_MODE=real        # real | simulated | hybrid
GENESIS_MCP_LOG=false        # Enable debug logging
```

## Version History

| Version | Codename | Key Features |
|---------|----------|--------------|
| **v7.4.5** | **Claude Code Parity** | Subagents, Background Tasks, Headless Mode, Session Management, Extended Thinking, Hooks System |
| v6.8.0 | Local-First | Ollama integration, offline mode, hybrid routing |
| v6.7.0 | Standalone Complete | Human-in-Loop, Tool Orchestration, Claude Code equivalent |
| v6.6.0 | Tool Orchestration | Dispatcher, Interactive REPL |
| v6.5.0 | Grounding | Output verification, feedback loop |
| v6.4.x | Self-Healing | Bash sandbox, Edit tool, Git operations, Darwin-Gödel |
| v6.3.0 | Autonomous | MCP Observation Bridge, Real Active Inference |
| v6.2.0 | Memory 2.0 | Ebbinghaus decay, workspace state |
| v6.1.0 | Active Inference | Free Energy Principle, autonomous loop |
| v6.0.0 | Standalone | LLM Bridge, CLI Chat, Daemon |
| v5.0.0 | Dreaming | World Model, Value-Guided JEPA |
| v4.0.0 | Living System | Multi-Agent, Strong Kernel |

## Scientific Foundations

| Theory | Author | Implementation |
|--------|--------|----------------|
| Autopoiesis | Maturana & Varela | Self-production, operational closure |
| Free Energy Principle | Friston | Active Inference loop |
| Society of Mind | Minsky | 10 specialized agents |
| Ebbinghaus Curve | Ebbinghaus | Memory decay (R = e^(-t/S)) |
| Conatus | Spinoza | Self-preservation drive |

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Link globally
npm link
```

## License

MIT

## Author

Created by **rossignoliluca**

---

*Genesis 7.4.5 - Claude Code Parity*

[![npm version](https://badge.fury.io/js/genesis-ai-cli.svg)](https://www.npmjs.com/package/genesis-ai-cli)
