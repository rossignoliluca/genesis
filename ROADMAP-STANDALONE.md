# Genesis Standalone Roadmap

**Obiettivo**: Genesis come sostituto completo di Claude Code

**Timeline**: 2-3 settimane di implementazione pratica

---

## Gap Analysis

| Capability | Claude Code | Genesis | Status |
|------------|-------------|---------|--------|
| MCP Servers (13) | External | Integrated | ✅ 100% |
| Multi-Agent System | N/A | 10 Agents | ✅ 100% |
| LLM Bridge | Claude API | Ollama + Cloud | ✅ 100% |
| Active Inference | N/A | Implemented | ✅ 100% |
| **Code Execution** | Sandbox Bash | Missing | ❌ 0% |
| **File Editing** | Diff-based Edit | Missing | ❌ 0% |
| **Git Operations** | Native | Partial (MCP) | ⚠️ 50% |
| **Self-Healing** | N/A | Missing | ❌ 0% |
| **Grounding** | N/A | Missing | ❌ 0% |

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

## Phase 6: CLI Enhancement (1-2 giorni)

### 6.1 Interactive Mode
```
src/cli/interactive.ts
```

- REPL loop come Claude Code
- History persistente
- Tab completion
- Syntax highlighting

### 6.2 Tool Dispatch
```
src/cli/dispatcher.ts
```

- Router per tool calls
- Parallel execution dove possibile
- Progress indicators

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

## Success Criteria

Genesis è "Claude Code equivalent" quando:

1. **Code Execution**: Può eseguire comandi bash in modo sicuro
2. **File Editing**: Può modificare file con precisione diff-based
3. **Git Operations**: Può fare commit, push, branch
4. **Self-Healing**: Può correggere autonomamente errori comuni
5. **Grounding**: Verifica sempre che l'output sia corretto

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

## File Structure Finale

```
src/
├── tools/
│   ├── bash.ts           # Secure command execution
│   ├── edit.ts           # Diff-based file editing
│   ├── write.ts          # File creation
│   ├── git.ts            # Native git operations
│   └── background.ts     # Background task management
├── healing/
│   ├── detector.ts       # Error detection patterns
│   ├── fixer.ts          # Auto-fix engine
│   └── invariants.ts     # Invariant preservation
├── grounding/
│   ├── verifier.ts       # Output verification
│   └── semantic.ts       # Semantic matching
└── cli/
    ├── interactive.ts    # REPL mode
    └── dispatcher.ts     # Tool routing
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
