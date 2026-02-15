# Genesis — Autonomous AI System

## Project Overview
Genesis is a bio-inspired autonomous AI system with recursive self-improvement (RSI), market intelligence, and multi-agent orchestration. Built in TypeScript, it runs as a CLI (`genesis`) and uses 30+ MCP servers for external capabilities.

## Build & Run
```bash
npm run build          # TypeScript → dist/
npm run start          # node dist/src/index.js
npm run dev            # tsc --watch
npm run dev:chat       # npx tsx watch src/index.ts chat
npm test               # node --test dist/**/*.test.js
```

## Architecture

### Core Modules (src/)
- **genesis.ts** — Main entry, bus wiring, MCP lifecycle
- **types.ts** — All type definitions (MCPServerName, ActionType, SubagentType, SystemSpec)
- **index.ts** — CLI entry point
- **SYSTEM_MANIFEST.ts** — System-wide constants

### Key Subsystems
| Directory | Purpose |
|-----------|---------|
| `bus/` | Event bus (pub/sub) — all inter-module communication |
| `llm/` | LLM provider abstraction, model racing, streaming |
| `mcp/`, `mcp-server/`, `mcp-servers/` | MCP client/server management |
| `tools/` | Tool registry (bash, edit, git) + `toolRegistry.set()` pattern |
| `subagents/` | Subagent registry, custom subagents via `customSubagents` Map |
| `agents/` | Agent pool, orchestration |
| `memory/` | Memory system singleton: `getMemorySystem()` → `remember()`, `recall()`, `learn()` |
| `market-strategist/` | Weekly report pipeline, data verification, feedback engine |
| `presentation/` | Python PPTX engine (design.py, charts.py, templates.py, engine.py) |
| `content/` | Social media orchestrator, scheduling, connectors |
| `autonomous/` | Self-reflection, goal system, attention, skill acquisition |
| `reasoning/` | Strategy composition (ToT, GoT, PRM), metacognitive control |
| `observability/` | SSE dashboard (port 9876), metrics |
| `dashboard/` | React dashboard (chat hub, phi indicator, tool DAG) |

### Bio-Inspired Modules
`neuromodulation/`, `nociception/`, `allostasis/`, `consciousness/`, `embodiment/`, `autopoiesis/`, `morphogenetic/`, `semiotics/`, `strange-loop/`, `swarm/`, `symbiotic/`, `umwelt/`

## Conventions

### TypeScript
- **Target**: ES2022, NodeNext modules
- **Path resolution**: Use `__dirname`, NOT `import.meta.url`
- **Imports**: Always use `.js` extension in imports (NodeNext resolution)
- **Tests**: `node:test` module + `node:assert`
- **No default exports** — use named exports

### Adding New Components
- **Tool**: Register in `src/tools/index.ts` via `toolRegistry.set('name', { name, description, execute, validate? })`
- **Action**: Add to `ActionType` union + `ACTIONS` array in `types.ts`, register in `actions.ts`, update `value-integration.ts`
- **Subagent**: Custom subagents via `customSubagents` Map in `src/subagents/registry.ts`. Do NOT add to `SubagentType` union unless also adding to `BUILTIN_SUBAGENTS`
- **Bus event**: Declare topic in `src/bus/events.ts` GenesisEventMap before using `.on()`
- **MCP server**: Add to `.mcp.json`. Use `as any` for MCPServerName if not in union — don't add to union lightly

### Memory System
```typescript
const mem = getMemorySystem();
await mem.remember({ what: 'string content' });  // NOT { content: { what } }
await mem.recall('query');
await mem.learn('topic', 'content');
```

### Presentation Engine
- Python engine called via `child_process.spawn('python3', ['script.py'])` with stdin pipe
- Chart types: line, bar, hbar, stacked_bar, table_heatmap, gauge, donut_matrix, waterfall, return_quilt, scatter, sparkline_table, lollipop, dumbbell, area, bump, small_multiples
- Bar data: `data.values` (flat) or `data.groups` (multi), NOT `data.series`
- Line data: `data.series[].name` (not `label`)
- Hbar data: `data.labels` (not `categories`)
- Palette: `rossignoli_editorial` for all reports

### Weekly Report (Market Strategist)
- Pipeline: collect → verify → analyze → store → feedback → build spec → render PPTX → publish
- Branding: **Rossignoli & Partners**
- Style: Editorial narrative, NOT generic commentary. Every sentence must pass: "Would Hartnett write this?"
- Track record slide when >= 3 scored predictions
- `enforceCalibrationCaps()` runs post-LLM

## Common Pitfalls
- `RGBColor` from python-pptx has no `.red`/`.green`/`.blue` attrs — use `str(color)`
- `remember()` expects `{ what: string }`, nothing else
- `bounty-orchestrator.ts` has pre-existing TS errors — ignore them
- `createSubscriber` must be imported from `./bus/index.js`
- Sync→async boundary: use `await import()` not `require()` in async contexts
- `cognitive-workspace.ts` `pruneCoactivation()` caps matrix at 500

## MCP Servers
30+ servers configured in `.mcp.json` across categories: research (brave-search, exa, firecrawl, arxiv, semantic-scholar), AI (openai, gemini, deepseek), finance (alphavantage, stripe, coinbase), infrastructure (supabase, vercel, cloudflare, postgres, pinecone, neo4j), communication (gmail, slack), social (twitter, reddit, youtube), automation (playwright, puppeteer), visual (stability-ai, huggingface).

## Security
- Never commit `.env`, API keys, or wallet seeds
- Solana wallet seed is in `~/Documents/` — never expose
- Hooks block writes to `.env`, `.pem`, `.key` files
- Hooks block `rm -rf /`, force push to main, `git reset --hard`
