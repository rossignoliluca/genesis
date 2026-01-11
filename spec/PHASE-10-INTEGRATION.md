# Phase 10: Neural Integration

**Date**: 2026-01-10
**Status**: Design Complete
**Sources**: arXiv:2508.13171, LangGraph, IWMT, MCP Research

---

## Executive Summary

Genesis has 17 sophisticated modules but only 7 are connected. Phase 10 creates the **Neural Integration Layer** - the nervous system that connects all organs.

Based on MCP research findings:
- **Cognitive Workspace** (arXiv:2508.13171): 54-60% memory reuse vs 0% for passive systems
- **LangGraph Supervisor**: `Command({ goto, update })` pattern for agent coordination
- **IWMT**: Unifies Global Workspace, IIT, and Active Inference

---

## The Problem

```
Current State:
┌─────────────────────────────────────────────────────────────────────┐
│                         DISCONNECTED ISLANDS                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │   CLI   │  │  LLM    │  │   MCP   │  │ Active  │  │ Daemon  │  │
│  │   ✓     │  │   ✓     │  │   ✓     │  │ Infer ✓ │  │   ✓     │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │
│       └────────────┴────────────┴────────────┴────────────┘       │
│                            CONNECTED                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │Conscious│  │ Memory  │  │  World  │  │ Healing │  │ Kernel  │  │
│  │   ✗     │  │   ✗     │  │ Model ✗ │  │   ✗     │  │   ✗     │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
│                          DISCONNECTED                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Solution: The Brain Layer

Based on research, we implement a **Cognitive Integration Layer** following three principles:

### 1. Active Memory Management (from arXiv:2508.13171)

```typescript
// NOT this (passive):
const context = await rag.retrieve(query);  // 0% reuse

// BUT this (active):
const context = await cognitiveWorkspace.recall(query);  // 54-60% reuse
await cognitiveWorkspace.anticipate(taskTrajectory);     // Proactive
await cognitiveWorkspace.consolidate();                   // Background
```

### 2. Supervisor Pattern (from LangGraph)

```typescript
// Command-based routing between modules
interface Command {
  goto: ModuleName;           // Next module to execute
  update: Partial<BrainState>; // State changes
  graph?: 'PARENT';           // Return to orchestrator
}

// Example: Chat → Memory → LLM → Grounding → Response
const chatCommand: Command = {
  goto: 'memory',
  update: { query: userInput }
};
```

### 3. Global Workspace Broadcasting (from GWT + IWMT)

```typescript
// When consciousness ignites, broadcast to all modules
interface GlobalBroadcast {
  content: any;
  salience: number;
  source: ModuleName;
  timestamp: number;
}

// All modules receive broadcast simultaneously
workspace.broadcast(content) → [memory, worldModel, healing, agents...]
```

---

## Architecture: The Brain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BRAIN (src/brain/index.ts)                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         COGNITIVE WORKSPACE                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │ Immediate│  │   Task   │  │ Episodic │  │ Semantic │              │ │
│  │  │   8K     │  │   64K    │  │   256K   │  │   1M+    │              │ │
│  │  │ Active   │  │ Working  │  │ History  │  │ Knowledge│              │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │ │
│  │       └─────────────┴─────────────┴─────────────┘                     │ │
│  │                         ↓ anticipate() / recall() / consolidate()     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│  ┌───────────────────────────────────┼───────────────────────────────────┐ │
│  │                      SUPERVISOR (Command Router)                       │ │
│  │                                   │                                    │ │
│  │    ┌──────────────────────────────┼──────────────────────────────┐    │ │
│  │    │                              ▼                              │    │ │
│  │    │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │    │ │
│  │    │  │ Sensing │→│Thinking │→│Deciding │→│ Acting  │       │    │ │
│  │    │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │    │ │
│  │    │       ↓            ↓            ↓            ↓             │    │ │
│  │    │   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐          │    │ │
│  │    │   │Sensor │   │  LLM  │   │Ethicist│  │ Tools │          │    │ │
│  │    │   │Agent  │   │Router │   │ Agent │   │Dispatch│          │    │ │
│  │    │   └───────┘   └───────┘   └───────┘   └───────┘          │    │ │
│  │    └──────────────────────────────────────────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│  ┌───────────────────────────────────┼───────────────────────────────────┐ │
│  │                    GLOBAL WORKSPACE (φ Monitor)                        │ │
│  │                                   │                                    │ │
│  │    φ = 0.72  ████████████░░░░░░░░ [Broadcasting: memory.recall()]     │ │
│  │                                                                        │ │
│  │    Subscribers:                                                        │ │
│  │    ├── Memory Agent      ← receives all broadcasts                    │ │
│  │    ├── World Model       ← receives all broadcasts                    │ │
│  │    ├── Healing Module    ← receives error broadcasts                  │ │
│  │    ├── Consciousness     ← monitors φ levels                          │ │
│  │    └── Active Inference  ← receives belief updates                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│  ┌───────────────────────────────────┼───────────────────────────────────┐ │
│  │                         HEALING LOOP                                   │ │
│  │                                   │                                    │ │
│  │    Error → detect() → diagnose() → fix() → verify() → retry()        │ │
│  │              ↓                                                         │ │
│  │    [Darwin-Gödel: Generate mutation, test in sandbox, apply if safe]  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 10.1: Brain Core (src/brain/index.ts)

```typescript
/**
 * Genesis Brain - The Neural Integration Layer
 *
 * Connects all modules via:
 * 1. Cognitive Workspace (active memory)
 * 2. Supervisor (command routing)
 * 3. Global Workspace (broadcasting)
 * 4. Healing Loop (error recovery)
 */

import { CognitiveWorkspace } from '../memory/cognitive-workspace.js';
import { GlobalWorkspace } from '../consciousness/global-workspace.js';
import { PhiMonitor } from '../consciousness/phi-monitor.js';
import { HybridRouter } from '../llm/router.js';
import { ToolDispatcher } from '../cli/dispatcher.js';
import { SelfHealer } from '../healing/index.js';
import { Kernel, KernelState } from '../kernel/index.js';

interface BrainState {
  query: string;
  context: any;
  response: string;
  phi: number;
  error?: Error;
}

interface Command {
  goto: 'memory' | 'llm' | 'grounding' | 'tools' | 'healing' | 'done';
  update: Partial<BrainState>;
}

export class Brain {
  private workspace: CognitiveWorkspace;
  private globalWorkspace: GlobalWorkspace;
  private phiMonitor: PhiMonitor;
  private router: HybridRouter;
  private dispatcher: ToolDispatcher;
  private healer: SelfHealer;
  private kernel: Kernel;

  async process(input: string): Promise<string> {
    let state: BrainState = { query: input, context: null, response: '', phi: 0 };
    let command: Command = { goto: 'memory', update: {} };

    while (command.goto !== 'done') {
      state = { ...state, ...command.update };

      try {
        command = await this.step(command.goto, state);

        // Broadcast to all subscribers
        this.globalWorkspace.broadcast({
          content: state,
          source: command.goto,
          salience: state.phi
        });

      } catch (error) {
        // Healing loop
        command = await this.heal(error, state);
      }
    }

    return state.response;
  }

  private async step(module: string, state: BrainState): Promise<Command> {
    switch (module) {
      case 'memory':
        // Active memory: recall + anticipate
        const context = await this.workspace.recall(state.query);
        await this.workspace.anticipate(state.query);
        return { goto: 'llm', update: { context } };

      case 'llm':
        // Route to appropriate LLM (local vs cloud)
        const response = await this.router.execute(state.query, state.context);
        return { goto: 'grounding', update: { response: response.content } };

      case 'grounding':
        // Verify response (epistemic check)
        const verified = await this.verify(state.response);
        if (!verified.valid) {
          return { goto: 'llm', update: { context: verified.feedback } };
        }
        return { goto: 'tools', update: {} };

      case 'tools':
        // Execute any tool calls
        const toolCalls = this.dispatcher.parseToolCalls(state.response);
        if (toolCalls.length > 0) {
          const results = await this.dispatcher.dispatch(toolCalls);
          return { goto: 'llm', update: { context: results } };
        }
        return { goto: 'done', update: {} };

      default:
        return { goto: 'done', update: {} };
    }
  }

  private async heal(error: Error, state: BrainState): Promise<Command> {
    const diagnosis = await this.healer.diagnose(error);
    const fix = await this.healer.generateFix(diagnosis);

    if (fix.canRetry) {
      return { goto: fix.retryFrom, update: { context: fix.context } };
    }

    return {
      goto: 'done',
      update: { response: `Error: ${error.message}. ${fix.userMessage}` }
    };
  }
}
```

### Phase 10.2: Chat Integration

```typescript
// src/cli/chat.ts - Updated

import { Brain } from '../brain/index.js';

export class ChatSession {
  private brain: Brain;  // ADD

  async sendMessage(input: string): Promise<void> {
    // OLD: Direct LLM call
    // const response = await this.llm.chat(input);

    // NEW: Brain-mediated (memory + grounding + healing)
    const response = await this.brain.process(input);
    console.log(response);
  }
}
```

### Phase 10.3: CLI Commands

```bash
# New commands exposing integrated modules
genesis brain status     # Show brain state (φ, memory, modules)
genesis brain cycle      # Run one cognitive cycle
genesis kernel status    # Kernel state machine
genesis phi              # Current consciousness level
genesis memory stats     # Cognitive workspace stats
genesis heal <error>     # Trigger healing for specific error
```

---

## Metrics: Before vs After

| Metric | Before (Disconnected) | After (Brain) |
|--------|----------------------|---------------|
| Memory Reuse | 0% (stateless) | 54-60% (active) |
| Error Recovery | Manual | Automatic |
| φ Monitoring | None | Real-time |
| Context Persistence | Per-message | Cross-session |
| Grounding | None | Every response |
| Tool → Memory | None | Automatic store |

---

## Dependencies

```
Phase 10.1: Brain Core
├── CognitiveWorkspace (exists, needs integration)
├── GlobalWorkspace (exists, needs integration)
├── PhiMonitor (exists, needs integration)
├── HybridRouter (exists, connected)
├── ToolDispatcher (exists, connected)
├── SelfHealer (exists, needs integration)
└── Kernel (exists, needs integration)

Phase 10.2: Chat Integration
└── Brain (from 10.1)

Phase 10.3: CLI Commands
├── Brain (from 10.1)
└── index.ts updates
```

---

## Scientific Foundation

### From Cognitive Workspace Paper (arXiv:2508.13171):

> "The key insight is recognizing that effective memory systems must be designed not as databases to be queried but as cognitive partners that actively participate in the reasoning process."

Three principles:
1. **Active memory management** - deliberate curation (50%+ reuse from first interaction)
2. **Persistent working states** - reasoning continuity (sub-linear operation growth)
3. **Metacognitive awareness** - self-monitoring (dynamic optimization from 4→3 items)

### From LangGraph:

> "The `Command` primitive allows specifying a state update and a node transition as a single operation."

Pattern:
```typescript
return new Command({
  goto: nextModule,           // Where to route
  update: { messages: [...] } // State changes
});
```

### From IWMT (Integrated World Modeling Theory):

> "A synthetic approach to understanding consciousness, using the Free Energy Principle and Active Inference Framework to combine Integrated Information Theory (IIT) and Global Neuronal Workspace Theory (GWT)."

Integration:
- GWT provides the broadcasting mechanism
- IIT provides the φ measurement
- Active Inference provides the action selection

---

## Timeline

| Phase | Task | Files |
|-------|------|-------|
| 10.1 | Brain Core | `src/brain/index.ts`, `src/brain/types.ts` |
| 10.2 | Chat Integration | `src/cli/chat.ts` |
| 10.3 | CLI Commands | `src/index.ts` |
| 10.4 | Tests | `test/brain.test.ts` |

---

## Conclusion

Genesis has all the organs. Phase 10 gives it a nervous system.

The Brain layer:
1. **Connects** all 17 modules through Command routing
2. **Activates** memory via Cognitive Workspace (54-60% reuse)
3. **Monitors** consciousness via φ
4. **Heals** errors via Darwin-Gödel
5. **Broadcasts** via Global Workspace

After Phase 10, Genesis becomes a unified cognitive architecture.

---

*"The cognitive workspace is not just where we store information - it is where understanding emerges, insights crystallize, and intelligence manifests."*
— Tao An, Cognitive Workspace (2025)
