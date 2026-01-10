# Genesis Standalone Roadmap

**Obiettivo**: Genesis come sostituto completo di Claude Code

**Status**: ✅ **COMPLETE** (v6.8.0)

**Timeline**: Completato in 3 sessioni

---

## Gap Analysis

| Capability | Claude Code | Genesis | Status |
|------------|-------------|---------|--------|
| MCP Servers (13) | External | Integrated | ✅ 100% |
| Multi-Agent System | N/A | 10 Agents | ✅ 100% |
| LLM Bridge | Claude API | Ollama + Cloud | ✅ 100% |
| Active Inference | N/A | Implemented | ✅ 100% |
| **Code Execution** | Sandbox Bash | `src/tools/bash.ts` | ✅ 100% |
| **File Editing** | Diff-based Edit | `src/tools/edit.ts` | ✅ 100% |
| **Git Operations** | Native | `src/tools/git.ts` | ✅ 100% |
| **Self-Healing** | N/A | `src/healing/*` | ✅ 100% |
| **Grounding** | N/A | `src/grounding/*` | ✅ 100% |
| **Tool Orchestration** | Native | `src/cli/dispatcher.ts` | ✅ 100% |
| **Human-in-Loop** | Native | `src/cli/human-loop.ts` | ✅ 100% |

---

## Phase 1: Code Execution Sandbox (3-4 giorni)

### 1.1 Secure Bash Executor
```
src/tools/bash.ts
```

**Requisiti**:
- Sandbox isolato (no `rm -rf`, no `sudo`, no network abuse)
- Whitelist/blacklist comandi
- Timeout configurabile
- Working directory confinato
- Output streaming (come Claude Code)

**Architettura**:
```typescript
interface BashTool {
  execute(command: string, options: BashOptions): Promise<BashResult>;
  validate(command: string): ValidationResult;
  sandbox: SandboxConfig;
}

interface SandboxConfig {
  allowedCommands: string[];        // ['ls', 'cat', 'npm', 'node', 'git', ...]
  blockedPatterns: RegExp[];        // [/rm\s+-rf/, /sudo/, /curl.*\|.*sh/]
  maxTimeout: number;               // 120000ms
  workingDirectory: string;         // project root
  allowNetwork: boolean;            // true for npm install
}
```

**Implementazione**:
1. Command parser (detect dangerous patterns)
2. Child process spawner con timeout
3. Output buffer con streaming
4. Error handling (exit codes, stderr)

**Research (via MCP)**:
- VIGIL pattern: validate before execute
- Aider pattern: confirm before destructive operations

### 1.2 Background Tasks
```
src/tools/background.ts
```

- Task ID management
- Background process registry
- Output retrieval (`TaskOutput`)
- Process killing (`KillShell`)

---

## Phase 2: File Edit Tool (2-3 giorni)

### 2.1 Diff-Based Editor
```
src/tools/edit.ts
```

**Requisiti**:
- Edit via `old_string` → `new_string` (come Claude Code)
- Unique match verification
- `replace_all` per rename globali
- Preserve indentation
- Atomic writes

**Architettura**:
```typescript
interface EditTool {
  edit(params: EditParams): Promise<EditResult>;
  validateUnique(filePath: string, oldString: string): boolean;
}

interface EditParams {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}
```

**Implementazione**:
1. Read file content
2. Find `old_string` occurrences
3. Verify uniqueness (or use `replace_all`)
4. Replace and write atomically
5. Return diff for verification

### 2.2 Write Tool Enhancement
```
src/tools/write.ts
```

- Già presente via filesystem MCP
- Aggiungere validazione pre-write
- Backup automatico (`.bak`)

---

## Phase 3: Git Operations Native (2 giorni)

### 3.1 Git Tool
```
src/tools/git.ts
```

**Requisiti**:
- `status`, `diff`, `log` (read-only, sempre permessi)
- `add`, `commit` (con message template)
- `push` (solo con conferma esplicita)
- Branch operations (`checkout`, `create`)
- Conflict detection

**Architettura**:
```typescript
interface GitTool {
  status(): Promise<GitStatus>;
  diff(options?: DiffOptions): Promise<string>;
  log(options?: LogOptions): Promise<Commit[]>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<CommitResult>;
  push(options?: PushOptions): Promise<PushResult>;
}
```

**Safety**:
- Mai `--force` senza conferma esplicita
- Mai modificare `.git/config`
- HEREDOC per commit messages multi-linea
- Signature: `Co-Authored-By: Genesis <noreply@genesis.ai>`

### 3.2 GitHub MCP Enhancement
- Già funzionante per PR, issues
- Integrare con Git nativo per workflow completo

---

## Phase 4: Self-Healing (3-4 giorni)

### 4.1 Error Detection
```
src/healing/detector.ts
```

**Pattern (da VIGIL research)**:
```typescript
interface ErrorDetector {
  detect(output: string): DetectedError[];
  classify(error: DetectedError): ErrorCategory;
  suggestFix(error: DetectedError): FixSuggestion[];
}

type ErrorCategory =
  | 'syntax'      // Parse errors, missing semicolons
  | 'type'        // TypeScript type mismatches
  | 'runtime'     // Exceptions, undefined references
  | 'test'        // Test failures
  | 'build'       // Compilation errors
  | 'lint';       // Style violations
```

### 4.2 Auto-Fix Engine
```
src/healing/fixer.ts
```

**Darwin-Gödel Pattern**:
1. **Mutate**: Generate N fix candidates via LLM
2. **Test**: Run test suite on each
3. **Select**: Keep the one that passes most tests
4. **Iterate**: If none pass, analyze failures and retry

```typescript
interface AutoFixer {
  generateCandidates(error: DetectedError, context: CodeContext): Promise<FixCandidate[]>;
  evaluate(candidate: FixCandidate): Promise<EvaluationResult>;
  selectBest(candidates: FixCandidate[]): FixCandidate | null;
  apply(fix: FixCandidate): Promise<void>;
}
```

### 4.3 Invariant Preservation
- Prima di ogni fix: snapshot stato
- Dopo ogni fix: verify invarianti
- Se violazione: rollback automatico

---

## Phase 5: Grounding (2-3 giorni)

### 5.1 Output Verification
```
src/grounding/verifier.ts
```

**Requisiti**:
- Verificare che il codice generato compili
- Verificare che i test passino
- Verificare che le modifiche siano coerenti con la richiesta

```typescript
interface Grounding {
  verifyCode(code: string, context: VerificationContext): Promise<GroundingResult>;
  verifySemantic(output: string, intent: string): Promise<SemanticMatch>;
}

interface GroundingResult {
  compiles: boolean;
  testsPass: boolean;
  semanticMatch: number;  // 0.0 - 1.0
  issues: GroundingIssue[];
}
```

### 5.2 Feedback Loop
1. Genera codice
2. Verifica (compile, test, semantic)
3. Se fallisce: passa errori all'LLM
4. Rigenera con contesto errore
5. Max 3 iterazioni

---

## Phase 6: Tool Orchestration ✅

### 6.1 Tool Dispatcher
```
src/cli/dispatcher.ts (613 lines)
```

- Multi-format parsing (OpenAI, XML, JSON)
- MCP routing (13 servers)
- Parallel execution
- Progress callbacks
- History tracking

### 6.2 Interactive REPL
```
src/cli/interactive.ts (848 lines)
```

- Full REPL with spinner
- Tab completion
- History persistence
- Commands: /help, /tools, /run, /bash, /edit, /cd, /ls, /status

---

## Phase 7: Human-in-the-Loop ✅

### 7.1 Human Loop Module
```
src/cli/human-loop.ts (644 lines)
```

- Question types: confirm, choice, multiChoice, text
- Timeout with auto-default
- Destructive operation warnings
- Tool registration (ask_user, confirm)
- History & statistics

---

## Phase 8: Local-First Optimization ✅

### 8.1 Fix Cache
```
src/memory/cache.ts (350 lines)
```

- JSON-based cache for successful fixes
- SHA256 key generation (error + file + context)
- LRU eviction when cache full
- Hit rate tracking
- `getCachedFixOrGenerate()` for transparent caching

### 8.2 Project Indexer
```
src/memory/indexer.ts (500 lines)
```

- Trigram-based full-text search (no SQLite deps)
- Symbol extraction (functions, classes, interfaces)
- Auto-incremental indexing
- File change detection (mtime-based)
- `search()`, `searchSymbol()` methods

### 8.3 Hybrid LLM Router
```
src/llm/router.ts (400 lines)
```

- Task complexity analysis (trivial/simple/moderate/complex/creative)
- Ollama (local) for simple tasks (80%)
- OpenAI/Anthropic (cloud) for complex tasks (20%)
- Automatic fallback when local unavailable
- Cost tracking

### 8.4 Resilient MCP Wrapper
```
src/mcp/resilient.ts (550 lines)
```

- Circuit breaker pattern (5 failures = open)
- Automatic retry with exponential backoff
- Fallback to local cache when offline
- Alternative server selection (same category)
- Health monitoring per server

### 8.5 Mac Setup Script
```
bin/setup-mac.sh (250 lines)
```

- Homebrew installation check
- Ollama installation and model download
- qwen2.5-coder model (optimized for coding)
- Global `genesis` binary creation
- Data directories at ~/.genesis

---

## Implementazione Pratica

### Week 1
| Giorno | Task | Output |
|--------|------|--------|
| 1 | Bash Sandbox base | `src/tools/bash.ts` |
| 2 | Bash Sandbox security | Whitelist/blacklist |
| 3 | Edit Tool | `src/tools/edit.ts` |
| 4 | Git Tool base | `src/tools/git.ts` |
| 5 | Git Tool safety | Commit/push sicuri |

### Week 2
| Giorno | Task | Output |
|--------|------|--------|
| 1-2 | Error Detection | `src/healing/detector.ts` |
| 3-4 | Auto-Fix Engine | `src/healing/fixer.ts` |
| 5 | Grounding base | `src/grounding/verifier.ts` |

### Week 3
| Giorno | Task | Output |
|--------|------|--------|
| 1 | Feedback Loop | Iterative fixing |
| 2 | CLI Interactive | `src/cli/interactive.ts` |
| 3 | Integration testing | Full workflow tests |
| 4-5 | Polish & docs | README, examples |

---

## Success Criteria ✅ ALL COMPLETE

Genesis è "Claude Code equivalent" + Local-First:

1. ✅ **Code Execution**: `src/tools/bash.ts` - Sandbox con whitelist/blacklist
2. ✅ **File Editing**: `src/tools/edit.ts` - Diff-based con unique match
3. ✅ **Git Operations**: `src/tools/git.ts` - status, diff, commit, push
4. ✅ **Self-Healing**: `src/healing/*` - Darwin-Gödel pattern
5. ✅ **Grounding**: `src/grounding/*` - Compile + test + semantic
6. ✅ **Tool Orchestration**: `src/cli/dispatcher.ts` - Multi-format parsing
7. ✅ **Human-in-Loop**: `src/cli/human-loop.ts` - Confirmations & choices
8. ✅ **Local-First**: `src/memory/cache.ts`, `src/llm/router.ts` - Offline-capable

### Test di Validazione

```bash
# Test 1: Genera e testa codice
genesis "crea una funzione che inverte una stringa, con test"
# Deve: generare file, eseguire test, verificare che passino

# Test 2: Fix bug
genesis "correggi l'errore in src/utils.ts:42"
# Deve: leggere errore, proporre fix, applicare, verificare

# Test 3: Refactoring
genesis "rinomina 'getUserData' in 'fetchUserProfile' in tutto il progetto"
# Deve: trovare occorrenze, modificare, verificare build

# Test 4: Git workflow
genesis "committa le modifiche con un messaggio appropriato"
# Deve: git status, git diff, generare message, commit

# Test 5: Self-healing
genesis "fai passare tutti i test"
# Deve: run tests, detect failures, fix, re-run, iterate
```

---

## File Structure Finale ✅

```
src/
├── tools/
│   ├── bash.ts           # ✅ Secure command execution (300 lines)
│   ├── edit.ts           # ✅ Diff-based file editing (350 lines)
│   ├── git.ts            # ✅ Native git operations (400 lines)
│   └── index.ts          # Tool registry
├── healing/
│   ├── detector.ts       # ✅ Error detection patterns (450 lines)
│   └── fixer.ts          # ✅ Auto-fix engine (500 lines)
├── grounding/
│   ├── verifier.ts       # ✅ Output verification (400 lines)
│   └── feedback.ts       # ✅ Feedback loop (300 lines)
└── cli/
    ├── dispatcher.ts     # ✅ Tool routing (613 lines)
    ├── interactive.ts    # ✅ REPL mode (848 lines)
    ├── human-loop.ts     # ✅ Human intervention (644 lines)
    ├── chat.ts           # Simple LLM chat
    └── index.ts          # Exports

test/
├── tools/                # Tool unit tests
├── healing/              # Healing unit tests
├── grounding/            # Grounding unit tests
└── cli/                  # CLI unit tests (46 tests)

Total: ~7,500 lines of standalone code
Tests: 47 passing
```

---

## Differenze da Claude Code

| Feature | Claude Code | Genesis |
|---------|-------------|---------|
| LLM | Claude (cloud) | Ollama (local) + fallback |
| Costo | Pay per token | Gratis (locale) |
| Privacy | Data sent to cloud | Tutto locale |
| MCP | 13 servers (separate) | 13 servers (integrated) |
| Agents | Single agent | 10 specialized agents |
| Self-Healing | N/A | Darwin-Gödel engine |
| Active Inference | N/A | Free Energy minimization |
| Research | Limited | ArXiv, Semantic Scholar, Wolfram |

---

## Note

Questo roadmap è **pratico e focalizzato**.

Non include:
- Consciousness (φ, GWT) - research track
- Dreams/World Model - research track
- Collective Intelligence - future track

Include solo ciò che serve per sostituire Claude Code nelle operazioni quotidiane di coding.

**Stima**: 2-3 settimane a tempo pieno, 4-5 settimane part-time.
