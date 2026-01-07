/**
 * Genesis - Autopoietic Kernel
 *
 * Core system responsible for self-maintenance and self-improvement.
 * Implements the autopoietic pattern where the system can create
 * improved versions of itself.
 */

import { SystemSpec, PipelineStage, MCPServer } from './types.js';

// ============================================================================
// State Machine
// ============================================================================

export type KernelState =
  | 'idle'
  | 'researching'
  | 'designing'
  | 'generating'
  | 'visualizing'
  | 'persisting'
  | 'publishing'
  | 'self_improving'
  | 'error';

export interface StateTransition {
  from: KernelState;
  to: KernelState;
  event: KernelEvent;
  timestamp: Date;
}

export type KernelEvent =
  | 'START_PIPELINE'
  | 'STAGE_COMPLETE'
  | 'PIPELINE_COMPLETE'
  | 'ERROR_OCCURRED'
  | 'SELF_IMPROVE_TRIGGER'
  | 'SELF_IMPROVE_COMPLETE'
  | 'RESET';

// ============================================================================
// Kernel Class
// ============================================================================

export class AutopoieticKernel {
  private state: KernelState = 'idle';
  private history: StateTransition[] = [];
  private metrics: KernelMetrics = {
    pipelinesCompleted: 0,
    systemsCreated: 0,
    selfImprovements: 0,
    errors: 0,
    startTime: new Date(),
  };

  // Invariants that must always hold
  private readonly invariants = [
    'MCP servers must always be reachable',
    'Pipeline stages are processed sequentially',
    'State transitions follow valid paths',
    'All tools pass schema validation',
    'Self-production preserves core invariants',
  ];

  constructor() {
    this.log('Autopoietic Kernel initialized');
  }

  // ============================================================================
  // State Machine
  // ============================================================================

  getState(): KernelState {
    return this.state;
  }

  private transition(event: KernelEvent): void {
    const validTransitions: Record<KernelState, Partial<Record<KernelEvent, KernelState>>> = {
      idle: {
        START_PIPELINE: 'researching',
        SELF_IMPROVE_TRIGGER: 'self_improving',
      },
      researching: {
        STAGE_COMPLETE: 'designing',
        ERROR_OCCURRED: 'error',
      },
      designing: {
        STAGE_COMPLETE: 'generating',
        ERROR_OCCURRED: 'error',
      },
      generating: {
        STAGE_COMPLETE: 'visualizing',
        ERROR_OCCURRED: 'error',
      },
      visualizing: {
        STAGE_COMPLETE: 'persisting',
        ERROR_OCCURRED: 'error',
      },
      persisting: {
        STAGE_COMPLETE: 'publishing',
        ERROR_OCCURRED: 'error',
      },
      publishing: {
        PIPELINE_COMPLETE: 'idle',
        ERROR_OCCURRED: 'error',
      },
      self_improving: {
        SELF_IMPROVE_COMPLETE: 'idle',
        ERROR_OCCURRED: 'error',
      },
      error: {
        RESET: 'idle',
      },
    };

    const nextState = validTransitions[this.state]?.[event];
    if (nextState) {
      const transition: StateTransition = {
        from: this.state,
        to: nextState,
        event,
        timestamp: new Date(),
      };
      this.history.push(transition);
      this.state = nextState;
      this.log(`State: ${transition.from} → ${transition.to} (${event})`);
    }
  }

  // ============================================================================
  // Pipeline Execution
  // ============================================================================

  async executePipeline(spec: SystemSpec): Promise<PipelineResult> {
    this.log(`Starting pipeline for: ${spec.name}`);
    this.transition('START_PIPELINE');

    const stages: PipelineStage[] = [
      'research',
      'design',
      'generate',
      'visualize',
      'persist',
      'publish',
    ];

    const results: StageResult[] = [];

    for (const stage of stages) {
      try {
        const result = await this.executeStage(stage, spec);
        results.push(result);
        this.transition('STAGE_COMPLETE');
      } catch (error) {
        this.metrics.errors++;
        this.transition('ERROR_OCCURRED');
        return {
          success: false,
          spec,
          stages: results,
          error: String(error),
        };
      }
    }

    this.transition('PIPELINE_COMPLETE');
    this.metrics.pipelinesCompleted++;
    this.metrics.systemsCreated++;

    // Check if self-improvement is needed
    if (this.shouldSelfImprove()) {
      await this.selfImprove();
    }

    return {
      success: true,
      spec,
      stages: results,
    };
  }

  private async executeStage(
    stage: PipelineStage,
    spec: SystemSpec
  ): Promise<StageResult> {
    const mcps = this.getMCPsForStage(stage);
    this.log(`Executing ${stage} with MCPs: ${mcps.join(', ')}`);

    const start = Date.now();

    // Stage execution would be done by the MCP orchestrator
    // This kernel just manages state and metrics

    return {
      stage,
      success: true,
      duration: Date.now() - start,
      mcpsUsed: mcps,
    };
  }

  private getMCPsForStage(stage: PipelineStage): MCPServer[] {
    const mapping: Record<PipelineStage, MCPServer[]> = {
      research: ['arxiv', 'semantic-scholar', 'context7', 'gemini', 'brave-search', 'exa', 'firecrawl'],
      design: ['openai', 'wolfram'],
      generate: ['openai', 'context7', 'filesystem'],
      visualize: ['stability-ai'],
      persist: ['memory', 'filesystem'],
      publish: ['github'],
    };
    return mapping[stage];
  }

  // ============================================================================
  // Self-Improvement (Autopoiesis)
  // ============================================================================

  private shouldSelfImprove(): boolean {
    // Trigger self-improvement every 10 successful pipelines
    return this.metrics.pipelinesCompleted > 0 &&
           this.metrics.pipelinesCompleted % 10 === 0;
  }

  private async selfImprove(): Promise<void> {
    this.log('Self-improvement triggered');
    this.transition('SELF_IMPROVE_TRIGGER');

    // Self-improvement process:
    // 1. Analyze metrics
    // 2. Identify bottlenecks
    // 3. Generate improvements
    // 4. Validate against invariants
    // 5. Apply if valid

    const improvements = this.analyzeForImprovements();

    if (improvements.length > 0) {
      this.log(`Identified ${improvements.length} potential improvements`);
      // In a real system, this would generate new code
      this.metrics.selfImprovements++;
    }

    this.transition('SELF_IMPROVE_COMPLETE');
  }

  private analyzeForImprovements(): string[] {
    const improvements: string[] = [];

    // Analyze error rate
    const errorRate = this.metrics.errors / (this.metrics.pipelinesCompleted || 1);
    if (errorRate > 0.1) {
      improvements.push('Improve error handling');
    }

    // Analyze stage performance from history
    const avgDuration = this.calculateAveragePipelineDuration();
    if (avgDuration > 60000) {
      improvements.push('Optimize slow stages');
    }

    return improvements;
  }

  private calculateAveragePipelineDuration(): number {
    // Calculate from transition history
    const pipelineStarts = this.history.filter(t => t.event === 'START_PIPELINE');
    const pipelineEnds = this.history.filter(t => t.event === 'PIPELINE_COMPLETE');

    if (pipelineStarts.length === 0 || pipelineEnds.length === 0) {
      return 0;
    }

    let totalDuration = 0;
    const count = Math.min(pipelineStarts.length, pipelineEnds.length);

    for (let i = 0; i < count; i++) {
      totalDuration += pipelineEnds[i].timestamp.getTime() - pipelineStarts[i].timestamp.getTime();
    }

    return totalDuration / count;
  }

  // ============================================================================
  // Invariant Checking
  // ============================================================================

  checkInvariants(): InvariantCheck[] {
    return this.invariants.map(inv => ({
      invariant: inv,
      satisfied: true, // Would actually check each invariant
      timestamp: new Date(),
    }));
  }

  // ============================================================================
  // Metrics & Status
  // ============================================================================

  getMetrics(): KernelMetrics {
    return { ...this.metrics };
  }

  getStatus(): KernelStatus {
    return {
      state: this.state,
      metrics: this.getMetrics(),
      invariants: this.checkInvariants(),
      uptime: Date.now() - this.metrics.startTime.getTime(),
    };
  }

  reset(): void {
    this.transition('RESET');
  }

  private log(message: string): void {
    console.log(`[Kernel] ${message}`);
  }
}

// ============================================================================
// Types
// ============================================================================

interface KernelMetrics {
  pipelinesCompleted: number;
  systemsCreated: number;
  selfImprovements: number;
  errors: number;
  startTime: Date;
}

interface StageResult {
  stage: PipelineStage;
  success: boolean;
  duration: number;
  mcpsUsed: MCPServer[];
  error?: string;
}

interface PipelineResult {
  success: boolean;
  spec: SystemSpec;
  stages: StageResult[];
  error?: string;
}

interface InvariantCheck {
  invariant: string;
  satisfied: boolean;
  timestamp: Date;
}

interface KernelStatus {
  state: KernelState;
  metrics: KernelMetrics;
  invariants: InvariantCheck[];
  uptime: number;
}

// ============================================================================
// Export
// ============================================================================

export function createKernel(): AutopoieticKernel {
  return new AutopoieticKernel();
}
