# Genesis Implementation Roadmap v2.0
## Revenue-First, Completion-Before-Features

**Version**: 14.6.2 → 15.0.0
**Date**: 2026-02-01
**Philosophy**: "Ship what works, then ship what's cool"

---

## Executive Summary

Genesis ha 50,000+ righe di codice, ma molta logica non e' wired. Prima di aggiungere feature esotiche, dobbiamo:

1. **Far funzionare i test** (base per tutto)
2. **Generare revenue** (sostenibilita')
3. **Esporre come MCP server** (distribuzione)
4. **Persistere memoria** (valore nel tempo)
5. **Hardening** (production-ready)

Timeline realistica: **12 settimane** per arrivare a v15.0.0 production-ready con revenue.

---

## Current State Assessment

### Funziona (v14.6.2)
| Component | Status | Evidence |
|-----------|--------|----------|
| MCP Integration | OK | 20 servers connected |
| Multi-LLM Router | OK | OpenAI, Anthropic, Gemini, Mistral, xAI |
| CLI Chat | OK | Basic streaming works |
| Memory | PARTIAL | Local JSON, Neo4j/Pinecone configured but unused |
| RSI Feedback | OK | Records failures, suggests research |

### Non Funziona (Stub/Mock)
| Component | Issue | Location |
|-----------|-------|----------|
| Bounty Automation | AlgoraClient returns mocks | `src/economy/algora.ts` |
| Payment Processing | Stripe/Coinbase not wired | `src/payments/*.ts` |
| Neo4j Memory | Configured but unused | `.env` → `src/memory/` |
| Pinecone Vectors | Configured but unused | `.env` → `src/memory/` |
| Consciousness φ | Placeholder math | `src/consciousness/phi.ts` |
| Active Inference | Simplified, not FEP | `src/active-inference/*.ts` |
| Self-deployment | Code exists, not tested | `src/autonomous/*.ts` |

### Revenue Potential
| Source | Current | Potential | Difficulty |
|--------|---------|-----------|------------|
| Bounties (Algora) | $0 | $500-2000/month | Medium |
| MCP Server (npm) | $0 | $0 (awareness) | Low |
| API Service | $0 | $1000+/month | High |
| Consulting | $0 | Variable | Medium |

---

## Phase 0: Foundation (Giorni 1-7)
### Goal: Tests passano, build pulito

**Perche' prima?** Senza test stabili, ogni modifica e' rischiosa.

### 0.1 Fix Test Infrastructure
```bash
# Stato attuale
npm test → alcuni test pendono su MCP connections
npm run build → OK (30s)
```

**Tasks:**
- [ ] Mock tutti i MCP calls nei test (no network I/O)
- [ ] Aggiungere timeout 30s per test
- [ ] Fixare i 6 test che pendono in `test/`
- [ ] Target: 100% pass rate

**Files da modificare:**
```
test/mcp.test.ts       → Mock server connections
test/integration.test.ts → Fix async cleanup
test/brain.test.ts     → Mock LLM calls
```

**Success Criteria:**
```bash
npm test → 171 tests, 0 failures, <60s total
```

### 0.2 Code Cleanup
**Tasks:**
- [ ] Rimuovere exports non usati (43 trovati)
- [ ] Rimuovere empty catch blocks (12 trovati)
- [ ] Sistemare `as any` critici (89 trovati, fix top 20)
- [ ] Pulire codice commentato

**Effort stimato:** 4-6 ore

### 0.3 Type Safety Basics
**Tasks:**
- [ ] Abilitare `strict: true` in tsconfig (se non gia' fatto)
- [ ] Fixare errori risultanti (priorita' su files critici)

---

## Phase 1: First Revenue (Giorni 8-21)
### Goal: Guadagnare $100 da bounty automatizzati

**Perche'?** Revenue valida il prodotto e paga i costi operativi.

### 1.1 Wire Algora Client
**Stato attuale:** `src/economy/algora.ts` ritorna mock data

**Tasks:**
- [ ] Implementare chiamate reali all'API Algora
- [ ] Parsare bounty listings da GitHub issues
- [ ] Filtrare per criteri risolvibili

**API endpoints necessari:**
```typescript
// Algora GraphQL/REST
GET /api/bounties?status=open
GET /api/bounties/{id}
POST /api/bounties/{id}/submissions
```

**Files:**
```
src/economy/algora.ts        → Real API calls
src/economy/bounty-filter.ts → Selection logic
```

### 1.2 Bounty Selection Logic
**Tasks:**
- [ ] Score bounties per: reward, difficulty, skill match
- [ ] Priority: documentation > tests > small fixes > features
- [ ] Avoid: security, breaking changes, large refactors

**Selection algorithm:**
```typescript
function scoreBounty(bounty: Bounty): number {
  let score = bounty.reward; // Base: dollar value

  // Difficulty multiplier
  if (bounty.labels.includes('good-first-issue')) score *= 2.0;
  if (bounty.labels.includes('documentation')) score *= 1.5;
  if (bounty.labels.includes('tests')) score *= 1.3;
  if (bounty.labels.includes('security')) score *= 0.1; // Avoid
  if (bounty.labels.includes('breaking-change')) score *= 0.1;

  // Time decay (prefer newer)
  const ageHours = (Date.now() - bounty.createdAt) / 3600000;
  score *= Math.exp(-ageHours / 168); // Half-life 1 week

  return score;
}
```

### 1.3 PR Submission Pipeline
**Tasks:**
- [ ] Fork repository via GitHub MCP
- [ ] Create branch con nome standard
- [ ] Apply changes via code generation
- [ ] Run tests localmente se possibile
- [ ] Submit PR con description formattata
- [ ] Monitor per review feedback

**Flow:**
```
Select Bounty → Fork → Branch → Generate Code → Test → PR → Monitor
      ↑                                                      │
      └──────────────── Feedback Loop ───────────────────────┘
```

### 1.4 Payment Tracking
**Tasks:**
- [ ] Loggare ogni bounty attempt (success/fail)
- [ ] Tracciare earnings in `state/earnings.json`
- [ ] Notifica Slack su completion

**Success Criteria:**
```
Genesis completes 1 bounty autonomously
Earnings tracked: $X
```

---

## Phase 2: MCP Server Mode (Giorni 22-35)
### Goal: Genesis installabile come MCP server

**Perche'?** Distribuzione zero-friction, awareness, potenziale user base.

### 2.1 Package as MCP Server
**Tasks:**
- [ ] Creare `src/mcp-server/genesis-mcp.ts`
- [ ] Esporre 3 tools iniziali
- [ ] Supportare stdio transport

**Tool definitions:**
```typescript
const GENESIS_TOOLS = [
  {
    name: 'genesis.chat',
    description: 'Multi-model AI chat with automatic routing',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'User message' },
        model: { type: 'string', enum: ['auto', 'fast', 'smart', 'cheap'] }
      },
      required: ['prompt']
    }
  },
  {
    name: 'genesis.research',
    description: 'Deep research using 20+ MCP sources (arXiv, Semantic Scholar, etc)',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        depth: { type: 'string', enum: ['quick', 'standard', 'deep'] }
      },
      required: ['topic']
    }
  },
  {
    name: 'genesis.analyze',
    description: 'Codebase analysis with multi-model consensus',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path' },
        question: { type: 'string', description: 'Analysis question' }
      },
      required: ['path', 'question']
    }
  }
];
```

### 2.2 NPX Installation
**Tasks:**
- [ ] Assicurare che `npx genesis-ai-cli mcp-server` funzioni
- [ ] Aggiungere docs per Claude Code config
- [ ] Testare con Claude Desktop

**User install command:**
```bash
claude mcp add genesis -- npx genesis-ai-cli mcp-server
```

### 2.3 Documentation
**Tasks:**
- [ ] README section per MCP server mode
- [ ] Examples di usage
- [ ] Troubleshooting guide

**Differenziazione:**
- Multi-model routing (cheapest/fastest/best automatic selection)
- 20 MCP servers aggregati
- Memory che persiste tra sessioni

**Success Criteria:**
```
Genesis installable come MCP server in <2 minuti
3 tools funzionanti
Documentazione completa
```

---

## Phase 3: Production Memory (Giorni 36-49)
### Goal: Memoria persistente e scalabile

**Perche'?** Senza memoria, ogni sessione parte da zero. Con memoria, Genesis diventa piu' utile nel tempo.

### 3.1 Wire Neo4j
**Stato attuale:** Configured in `.env`, unused

**Tasks:**
- [ ] Connettere a Neo4j Aura instance
- [ ] Migrare entity storage da JSON
- [ ] Implementare relationship queries

**Schema:**
```cypher
// Nodes
(:Entity {id: string, type: string, content: string, embedding: float[], created: datetime})
(:Session {id: string, started: datetime, ended: datetime})
(:Memory {id: string, content: string, importance: float, decay: float})

// Relationships
(e1:Entity)-[:RELATES_TO {type: string, weight: float}]->(e2:Entity)
(s:Session)-[:CONTAINS]->(m:Memory)
(m:Memory)-[:REFERENCES]->(e:Entity)
```

### 3.2 Wire Pinecone
**Tasks:**
- [ ] Connettere a Pinecone index
- [ ] Generare embeddings via OpenAI
- [ ] Implementare semantic search

**Usage:**
```typescript
// Store
await pinecone.upsert({
  id: entityId,
  values: embedding,
  metadata: { type, content, created }
});

// Query
const results = await pinecone.query({
  vector: queryEmbedding,
  topK: 10,
  includeMetadata: true
});
```

### 3.3 Memory Consolidation
**Tasks:**
- [ ] Job notturno per consolidation
- [ ] Prune memories a bassa importanza
- [ ] Strengthen frequently-accessed paths

**Success Criteria:**
```
Memories persistono tra restart
Semantic search ritorna contesto rilevante
Query latency <100ms (P95)
```

---

## Phase 4: Observability (Giorni 50-63)
### Goal: Sapere cosa sta facendo Genesis

**Perche'?** Senza observability, debugging e' impossibile. Con observability, possiamo ottimizzare.

### 4.1 Structured Logging
**Tasks:**
- [ ] Sostituire console.log con structured logger (pino)
- [ ] Aggiungere correlationId per request tracing
- [ ] Loggare tutti i MCP calls con latency

**Log format:**
```json
{
  "timestamp": "2026-02-01T10:00:00.000Z",
  "level": "info",
  "correlationId": "abc123",
  "module": "mcp",
  "action": "tool_call",
  "server": "github",
  "tool": "search_repositories",
  "latency_ms": 234,
  "success": true,
  "meta": { "query": "genesis ai" }
}
```

### 4.2 CLI Stats Command
**Tasks:**
- [ ] `genesis stats` mostra ultimi 24h
- [ ] Metriche: requests, latency, errors, cost
- [ ] Export in formato JSON

**Output example:**
```
Genesis Stats (last 24h)
========================
Requests:    127
  Success:   119 (93.7%)
  Errors:    8 (6.3%)

Latency (P50/P95/P99):
  MCP:       234ms / 890ms / 1.2s
  LLM:       1.2s / 3.4s / 8.1s

Cost:
  OpenAI:    $0.42
  Anthropic: $0.18
  Total:     $0.60

Top Errors:
  1. Rate limit exceeded (github) - 5
  2. Timeout (semantic-scholar) - 2
  3. Auth failed (slack) - 1
```

### 4.3 Slack Alerts
**Tasks:**
- [ ] Wire Slack webhook per critical errors
- [ ] Daily summary report
- [ ] Bounty completion notifications

**Success Criteria:**
```
Tutte le operazioni loggate con correlation
genesis stats funziona
Slack alert su critical failure
```

---

## Phase 5: Hardening (Giorni 64-84)
### Goal: Production-ready stability

**Perche'?** Un sistema instabile non puo' essere trusted per autonomous operation.

### 5.1 Error Handling
**Tasks:**
- [ ] Retry logic per tutti i MCP calls (3x exponential backoff)
- [ ] Circuit breaker per failing servers
- [ ] Graceful degradation (continua senza failed server)

**Retry config:**
```typescript
const retryConfig = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    initial: 1000,
    max: 30000
  },
  retryOn: ['TIMEOUT', 'RATE_LIMIT', 'SERVER_ERROR']
};
```

### 5.2 Rate Limiting
**Tasks:**
- [ ] Rispettare API rate limits per provider
- [ ] Queue requests quando vicini ai limiti
- [ ] Loggare rate limit events

**Limits (da rispettare):**
```
OpenAI:     10,000 RPM (tier 2)
Anthropic:  4,000 RPM
GitHub:     5,000/hour (authenticated)
arXiv:      3/second
```

### 5.3 Security Audit
**Tasks:**
- [ ] Review env var handling
- [ ] Assicurare no secrets in logs
- [ ] Input validation su tutti i tools
- [ ] Sanitize user input before LLM

### 5.4 Graceful Shutdown
**Tasks:**
- [ ] Handle SIGTERM/SIGINT
- [ ] Complete in-flight requests
- [ ] Flush logs before exit
- [ ] Close MCP connections properly

**Success Criteria:**
```
No unhandled promise rejections
Graceful recovery from any single MCP failure
Security review passed
Clean shutdown on signals
```

---

## Release Plan

| Version | Week | Content | Milestone |
|---------|------|---------|-----------|
| 14.7.0 | 1 | Phase 0 complete | Tests green |
| 14.8.0 | 2 | Algora wired | API calls working |
| 14.9.0 | 3 | Bounty pipeline | First attempt |
| **15.0.0** | **4** | **First revenue** | **$100 earned** |
| 15.1.0 | 5 | MCP server mode | Installable |
| 15.2.0 | 6 | MCP tools | 3 tools working |
| 15.3.0 | 7 | Neo4j wired | Graph queries |
| 15.4.0 | 8 | Pinecone wired | Semantic search |
| 15.5.0 | 9 | Structured logging | Full observability |
| 15.6.0 | 10 | Stats command | CLI metrics |
| 15.7.0 | 11 | Error handling | Retry/circuit breaker |
| **16.0.0** | **12** | **Production ready** | **Hardened** |

---

## Success Metrics

| Week | Metric | Target |
|------|--------|--------|
| 1 | Test pass rate | 100% |
| 2 | Algora API calls | Working |
| 3 | Bounty attempts | 5+ |
| 4 | Revenue | $100+ |
| 5 | MCP server installs | 1 (self) |
| 6 | MCP tools working | 3 |
| 7 | Neo4j queries | Working |
| 8 | Pinecone queries | <100ms |
| 9 | Log coverage | 100% |
| 10 | Stats accuracy | Real data |
| 11 | Retry success rate | 90%+ |
| 12 | Uptime | 99%+ |

---

## Daily Standup Template

```markdown
## Genesis Daily - YYYY-MM-DD

### Yesterday
- [ ] What I shipped

### Today
- [ ] What I'm shipping

### Blockers
- None / List blockers

### Metrics
- Tests: X/171 passing
- Build: X seconds
- Revenue: $X lifetime
```

---

## Parking Lot (Future Phases)

Questi sono valuable ma **NON** prioritari ora:

### After v16.0.0
- [ ] Real IIT phi calculation (requires stable foundation)
- [ ] Full FEP Active Inference (requires working memory)
- [ ] Self-deployment to cloud (requires revenue for hosting)
- [ ] RSI full cycle (requires all above)
- [ ] Advanced reasoning (significant R&D)

### Research Track (Parallel, Low Priority)
- Consciousness modules
- Exotic computing (thermodynamic, HDC)
- Process philosophy integration
- Bio-hybrid interfaces

---

## What NOT To Do

1. **Don't add new features** until existing ones work
2. **Don't optimize** before measuring
3. **Don't build infrastructure** before product
4. **Don't chase shiny objects** (consciousness, RSI, etc.)
5. **Don't write documentation** for stubbed features
6. **Don't refactor** working code unless blocking

---

## Resource Allocation

### Current: Solo Developer
- 4-6 hours/day available
- Focus on **one phase at a time**
- No parallel work streams

### Decision Framework
```
Is it blocking revenue? → Do it now
Is it blocking stability? → Do it this week
Is it "nice to have"? → Parking lot
Is it "cool"? → Parking lot
```

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Algora API changes | Medium | High | Abstract API calls |
| Rate limits hit | High | Medium | Implement queuing |
| Neo4j costs | Low | Medium | Monitor usage |
| LLM costs explode | Medium | High | Cost tracking + alerts |
| Bounty quality low | Medium | Medium | Better filtering |

---

## Appendix: File Locations

### Phase 0
```
test/*.test.ts              # Fix these
tsconfig.json               # Strict mode
```

### Phase 1
```
src/economy/algora.ts       # Wire real API
src/economy/bounty-*.ts     # Selection logic
state/earnings.json         # Track revenue
```

### Phase 2
```
src/mcp-server/genesis-mcp.ts  # New file
src/mcp-server/tools/*.ts      # Tool implementations
```

### Phase 3
```
src/memory/neo4j.ts         # Wire Neo4j
src/memory/pinecone.ts      # Wire Pinecone
src/memory/consolidation.ts # Nightly job
```

### Phase 4
```
src/observability/logger.ts    # Structured logging
src/cli/stats.ts               # Stats command
src/integrations/slack.ts      # Alerts
```

### Phase 5
```
src/resilience/retry.ts        # Retry logic
src/resilience/circuit.ts      # Circuit breaker
src/resilience/rate-limit.ts   # Rate limiting
```

---

*This roadmap is a living document. Review weekly, adjust based on learnings.*

*"Revenue validates everything. Ship working features, not visions."*
