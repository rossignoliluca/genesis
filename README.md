# Genesis

**System Creator powered by 13 MCP Servers**

Create autopoietic systems, AI agents, and complex architectures through natural language orchestration.

```
╔═══════════════════════════════════════════════════════════════╗
║  GENESIS - System Creator                                      ║
║  Powered by 13 MCP Servers                                     ║
╚═══════════════════════════════════════════════════════════════╝
```

## MCP Servers

Genesis orchestrates 13 MCP (Model Context Protocol) servers across 5 categories:

| Category | Servers | Purpose |
|----------|---------|---------|
| **KNOWLEDGE** | arxiv, semantic-scholar, context7, wolfram | Academic papers, library docs, computations |
| **RESEARCH** | gemini, brave-search, exa, firecrawl | Web search, code search, scraping |
| **CREATION** | openai, github | Code generation, repository management |
| **VISUAL** | stability-ai | Image generation |
| **STORAGE** | memory, filesystem | Knowledge graph, file operations |

## Installation

```bash
npm install -g genesis-mcp
```

Or clone and build:

```bash
git clone https://github.com/rossignoliluca/genesis.git
cd genesis
npm install
npm run build
npm link
```

## Usage

### Create a New System

```bash
genesis create my-agent \
  --type agent \
  --description "An autonomous agent with state machine" \
  --features "state-machine,events,persistence"
```

This generates a `.genesis.json` spec file that can be processed through the pipeline.

### Research a Topic

```bash
genesis research "autopoiesis in AI systems"
```

Uses all knowledge MCPs in parallel:
- **arxiv**: Academic papers
- **semantic-scholar**: Citations and references
- **context7**: Library documentation
- **gemini**: Web search with AI synthesis
- **brave-search**: News and web results
- **exa**: Code examples
- **firecrawl**: Deep web extraction

### Design Architecture

```bash
genesis design my-agent.genesis.json
```

Uses:
- **openai**: GPT-4o/o1 for architecture design
- **wolfram**: Mathematical computations

### Generate Code

```bash
genesis generate my-agent.genesis.json
```

Uses:
- **openai**: Code generation
- **context7**: Library documentation
- **filesystem**: Write generated files

### Create Visuals

```bash
genesis visualize my-agent.genesis.json
```

Uses:
- **stability-ai**: Generate architecture diagrams, concept art, logos

### Publish to GitHub

```bash
genesis publish my-agent.genesis.json
```

Uses:
- **github**: Create repo, push code
- **memory**: Persist to knowledge graph

### Check Status

```bash
genesis status
```

Shows all 13 MCP servers and their capabilities.

## Pipeline

The full system creation pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                      GENESIS PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. RESEARCH ──────────────────────────────────────────────────▶│
│     arxiv, semantic-scholar, context7, gemini, brave, exa       │
│                                                                  │
│  2. DESIGN ────────────────────────────────────────────────────▶│
│     openai (GPT-4o/o1), wolfram                                 │
│                                                                  │
│  3. GENERATE ──────────────────────────────────────────────────▶│
│     openai, context7, filesystem                                │
│                                                                  │
│  4. VISUALIZE ─────────────────────────────────────────────────▶│
│     stability-ai                                                │
│                                                                  │
│  5. PERSIST ───────────────────────────────────────────────────▶│
│     memory (knowledge graph), filesystem                        │
│                                                                  │
│  6. PUBLISH ───────────────────────────────────────────────────▶│
│     github                                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## System Types

Genesis can create different types of systems:

| Type | Description |
|------|-------------|
| `autopoietic` | Self-maintaining systems with operational closure (like Entity) |
| `agent` | AI agents with state machine and operations |
| `multi-agent` | Multiple communicating agents |
| `service` | Backend services with API |
| `custom` | Fully custom architecture |

## Spec File Format

```json
{
  "name": "my-agent",
  "description": "An autonomous agent with state machine",
  "type": "agent",
  "features": ["state-machine", "events", "persistence"],
  "constraints": ["must be deterministic", "energy-bounded"],
  "inspirations": ["entity project", "autopoiesis theory"]
}
```

## Integration with Claude Code

Genesis is designed to work with Claude Code and its MCP integrations. The CLI generates prompts and specs that Claude Code can execute using the full MCP toolkit.

Example workflow:

1. Run `genesis create my-system --type autopoietic`
2. Open the generated spec in Claude Code
3. Ask Claude to execute the pipeline: "Execute genesis pipeline for my-system.genesis.json"
4. Claude orchestrates all 13 MCPs to create the system

## Architecture

```
src/
├── index.ts        # CLI entry point
├── types.ts        # TypeScript type definitions
└── orchestrator.ts # MCP orchestration logic
```

## License

MIT

## Author

Created by rossignoliluca with Claude Code and 13 MCP servers.
