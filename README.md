# Genesis 6.0

**A Living System That Creates Systems**

Fully autonomous AI system powered by 13 MCP servers. Genesis doesn't just create systems - it thinks, feels, remembers, forgets, runs as a daemon, and improves itself.

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
║    "Not just intelligent, but alive."                    v6.0.0      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

## What's New in v6.0.0

| Milestone | Feature | Description |
|-----------|---------|-------------|
| **M1** | LLM Bridge | OpenAI/Anthropic API with conversation history |
| **M2** | CLI Chat | Interactive REPL with `/commands` |
| **M3** | State Persistence | Auto-save to `~/.genesis/` |
| **M4** | Real MCP | Connect to actual MCP servers via SDK |
| **M5** | Daemon Process | Background service with Unix socket IPC |

## Quick Start

```bash
# Install
git clone https://github.com/rossignoliluca/genesis.git
cd genesis
npm install
npm run build

# Set API key
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...

# Start chatting
node dist/src/index.js chat

# Start background daemon
node dist/src/index.js daemon start

# Check daemon status
node dist/src/index.js daemon status
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           GENESIS 6.0                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                         CLI LAYER                              │ │
│  │   Chat │ Daemon │ MCP │ Create │ Research │ Design │ Publish  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      DAEMON PROCESS                            │ │
│  │   Scheduler │ Maintenance │ Dream Mode │ IPC (Unix Socket)    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                       LLM BRIDGE                               │ │
│  │   OpenAI (GPT-4o) │ Anthropic (Claude) │ Conversation History │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    STATE PERSISTENCE                           │ │
│  │     ~/.genesis/state.json │ Memory │ Sessions │ Backups       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              SENSORY LAYER (13 MCP Servers)                   │ │
│  │  arxiv │ semantic-scholar │ brave │ gemini │ wolfram │ ctx7  │ │
│  │  openai │ stability-ai │ firecrawl │ exa │ github │ fs │ mem │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## The 13 MCP Servers

Genesis perceives the world through 13 MCP servers:

| Category | Servers | Purpose |
|----------|---------|---------|
| **KNOWLEDGE** | arxiv, semantic-scholar, context7, wolfram | Scientific papers, docs, math |
| **RESEARCH** | gemini, brave-search, exa, firecrawl | Web search, scraping |
| **CREATION** | openai, github | Code generation, publishing |
| **VISUAL** | stability-ai | Image generation |
| **STORAGE** | memory, filesystem | Knowledge graph, files |

## CLI Commands

### Chat Mode

```bash
# Start interactive chat
genesis chat

# Chat commands
/help          Show help
/clear         Clear conversation
/history       Show history
/status        Show LLM status
/save          Save state
/load          Load state
/quit          Exit (auto-saves)
```

### Daemon Mode

```bash
# Start background daemon
genesis daemon start
# Daemon started (PID: 12345)

# Check status (via IPC)
genesis daemon status
# Status: Running
# PID: 12345
# Uptime: 3600s
# Tasks: 10 completed

# View scheduled tasks
genesis daemon tasks

# View logs
genesis daemon logs --lines 100

# Trigger dream cycle
genesis daemon dream

# Stop daemon
genesis daemon stop
```

### MCP Commands

```bash
# Show MCP status
genesis mcp status

# Test a server (real mode)
GENESIS_MCP_MODE=real genesis mcp test --server memory --tool read_graph

# List available tools
GENESIS_MCP_MODE=real genesis mcp list --server filesystem
```

### System Creation

```bash
# Create a new system
genesis create my-agent --type agent --description "An autonomous agent"

# Research a topic
genesis research "autopoiesis in AI systems"

# Run full pipeline
genesis pipeline my-system.genesis.json
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `GENESIS_MCP_MODE` | `real`, `simulated`, `hybrid` | `simulated` |
| `GENESIS_MCP_LOG` | Enable MCP debug logging | `false` |
| `BRAVE_API_KEY` | Brave Search API key | - |
| `EXA_API_KEY` | Exa Search API key | - |
| `FIRECRAWL_API_KEY` | Firecrawl API key | - |

## File Locations

| File | Purpose |
|------|---------|
| `~/.genesis/state.json` | Persisted state |
| `~/.genesis/daemon.pid` | Daemon process ID |
| `~/.genesis/daemon.sock` | Unix socket for IPC |
| `~/.genesis/daemon.log` | Daemon log file |
| `~/.genesis/backups/` | State backups |

## What Makes Genesis Different?

| Feature | Traditional AI | Genesis 6.0 |
|---------|---------------|-------------|
| Architecture | Monolithic | Multi-agent with daemon |
| Memory | Append-only | Forgets like humans (Ebbinghaus) |
| Persistence | None | Auto-save to disk |
| Background | None | Daemon with IPC |
| MCP | Simulated | Real server connections |
| Self-improvement | None | Darwin Gödel (test, don't prove) |
| Senses | API calls | 13 MCP as biological organs |

## Daemon Features

The background daemon provides:

- **Scheduler**: Run tasks at intervals
- **Health Checks**: Monitor system health every 60s
- **Dream Mode**: Memory consolidation during idle
- **Maintenance**: Self-repair and cleanup
- **IPC**: Unix socket for CLI communication

## Scientific Foundations

| Theory | Author | How We Use It |
|--------|--------|---------------|
| Autopoiesis | Maturana & Varela | Self-production, closure |
| Free Energy Principle | Friston | Minimize surprise |
| Society of Mind | Minsky | Multi-agent architecture |
| Ebbinghaus Curve | Ebbinghaus | Memory decay |
| Learning Progress | Oudeyer | Curiosity as reward |
| Conatus | Spinoza | Self-preservation drive |

## Specifications

- [GENESIS-5.0.md](spec/GENESIS-5.0.md) - Conscious World-Modeling System
- [GENESIS-4.0.md](spec/GENESIS-4.0.md) - Multi-Agent Living System
- [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) - Implementation plan

## Version History

| Version | Codename | Key Features |
|---------|----------|--------------|
| v6.0.0 | **Standalone** | LLM Bridge, CLI Chat, State, Real MCP, Daemon |
| v5.0.0 | Dreaming Machine | World Model, Active Inference |
| v4.0.0 | Living System | Multi-Agent, Strong Kernel |
| v2.0.0 | Self-Producer | Autopoiesis, Self-Production |
| v1.0.0 | Genesis | Initial release |

## License

MIT

## Author

Created by **rossignoliluca**

*Genesis 6.0 - The Standalone System*
