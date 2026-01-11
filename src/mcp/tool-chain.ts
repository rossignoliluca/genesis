/**
 * Genesis MCP Tool Chaining Framework
 *
 * Automatic orchestration of dependent tool calls.
 * Enables workflows like: generate image → open it → edit it
 *
 * Features:
 * - Declarative chain definitions
 * - Automatic output → input mapping
 * - Conditional branching
 * - Error recovery and rollback
 * - Chain execution history
 */

import { MCPServerName } from '../types.js';
import { getMCPClient, MCPCallResult } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface ChainStep {
  id: string;
  server: MCPServerName;
  tool: string;
  params: Record<string, any> | ((ctx: ChainContext) => Record<string, any>);
  // Transform output before passing to next step
  transform?: (result: any) => any;
  // Condition to execute this step
  condition?: (ctx: ChainContext) => boolean;
  // On error: 'stop' | 'skip' | 'retry' | custom handler
  onError?: 'stop' | 'skip' | 'retry' | ((error: Error, ctx: ChainContext) => ChainStep | null);
  // Max retries if onError is 'retry'
  maxRetries?: number;
}

export interface ChainDefinition {
  id: string;
  name: string;
  description?: string;
  steps: ChainStep[];
  // Initial context values
  initialContext?: Record<string, any>;
  // Post-processing of final result
  finalTransform?: (ctx: ChainContext) => any;
}

export interface ChainContext {
  // Results from each step, keyed by step id
  results: Map<string, any>;
  // Current step index
  currentStep: number;
  // Accumulated errors
  errors: Array<{ stepId: string; error: Error }>;
  // Custom data passed between steps
  data: Record<string, any>;
  // Chain start time
  startTime: Date;
  // Execution log
  log: ChainLogEntry[];
}

export interface ChainLogEntry {
  timestamp: Date;
  stepId: string;
  action: 'start' | 'success' | 'error' | 'skip' | 'retry';
  details?: any;
  latency?: number;
}

export interface ChainResult {
  success: boolean;
  finalResult: any;
  context: ChainContext;
  totalLatency: number;
  stepsExecuted: number;
  stepsFailed: number;
}

// ============================================================================
// Predefined Chain Templates
// ============================================================================

export const CHAIN_TEMPLATES: Record<string, ChainDefinition> = {
  // Generate image and open it
  'generate-and-display': {
    id: 'generate-and-display',
    name: 'Generate and Display Image',
    description: 'Generate an image with Stability AI and open it in the default viewer',
    steps: [
      {
        id: 'generate',
        server: 'stability-ai',
        tool: 'stability-ai-generate-image',
        params: (ctx) => ({
          prompt: ctx.data.prompt || 'a beautiful landscape',
          outputImageFileName: ctx.data.filename || `genesis-${Date.now()}`,
        }),
        transform: (result) => ({
          imagePath: result.imagePath || result.outputPath || result,
        }),
      },
      {
        id: 'open',
        server: 'filesystem',
        tool: 'read_file',
        params: (ctx) => ({
          path: ctx.results.get('generate')?.imagePath,
        }),
        condition: (ctx) => !!ctx.results.get('generate')?.imagePath,
      },
    ],
  },

  // Search and scrape
  'search-and-scrape': {
    id: 'search-and-scrape',
    name: 'Search and Scrape',
    description: 'Search for a topic and scrape the top result',
    steps: [
      {
        id: 'search',
        server: 'brave-search',
        tool: 'brave_web_search',
        params: (ctx) => ({
          query: ctx.data.query,
          count: 3,
        }),
        transform: (result) => ({
          url: result.results?.[0]?.url || result.web?.results?.[0]?.url,
          title: result.results?.[0]?.title || result.web?.results?.[0]?.title,
        }),
      },
      {
        id: 'scrape',
        server: 'firecrawl',
        tool: 'firecrawl_scrape',
        params: (ctx) => ({
          url: ctx.results.get('search')?.url,
          formats: ['markdown'],
        }),
        condition: (ctx) => !!ctx.results.get('search')?.url,
        onError: 'skip',
      },
    ],
  },

  // Research paper workflow
  'research-paper': {
    id: 'research-paper',
    name: 'Research Paper Workflow',
    description: 'Search arXiv, get citations, save to memory',
    steps: [
      {
        id: 'search-arxiv',
        server: 'arxiv',
        tool: 'search_arxiv',
        params: (ctx) => ({
          query: ctx.data.query,
          maxResults: 5,
        }),
      },
      {
        id: 'get-citations',
        server: 'semantic-scholar',
        tool: 'get_paper_citations',
        params: (ctx) => {
          const papers = ctx.results.get('search-arxiv')?.papers || [];
          const firstPaper = papers[0];
          return {
            paperId: firstPaper?.id?.replace('arxiv:', '') || '',
            maxResults: 10,
          };
        },
        condition: (ctx) => {
          const papers = ctx.results.get('search-arxiv')?.papers || [];
          return papers.length > 0;
        },
        onError: 'skip',
      },
      {
        id: 'save-to-memory',
        server: 'memory',
        tool: 'create_entities',
        params: (ctx) => {
          const papers = ctx.results.get('search-arxiv')?.papers || [];
          return {
            entities: papers.slice(0, 3).map((p: any) => ({
              name: p.title || 'Unknown Paper',
              entityType: 'research_paper',
              observations: [
                `Authors: ${p.authors?.join(', ') || 'Unknown'}`,
                `Abstract: ${p.abstract?.slice(0, 200) || 'N/A'}...`,
              ],
            })),
          };
        },
        condition: (ctx) => {
          const papers = ctx.results.get('search-arxiv')?.papers || [];
          return papers.length > 0;
        },
      },
    ],
  },
};

// ============================================================================
// Chain Executor
// ============================================================================

export class ToolChainExecutor {
  private mcpClient = getMCPClient();

  async execute(chain: ChainDefinition, initialData: Record<string, any> = {}): Promise<ChainResult> {
    const context: ChainContext = {
      results: new Map(),
      currentStep: 0,
      errors: [],
      data: { ...chain.initialContext, ...initialData },
      startTime: new Date(),
      log: [],
    };

    let stepsExecuted = 0;
    let stepsFailed = 0;

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      context.currentStep = i;

      // Check condition
      if (step.condition && !step.condition(context)) {
        this.log(context, step.id, 'skip', { reason: 'condition not met' });
        continue;
      }

      const stepStart = Date.now();
      this.log(context, step.id, 'start');

      try {
        // Resolve params (can be function)
        const params = typeof step.params === 'function'
          ? step.params(context)
          : step.params;

        // Execute the tool
        const result = await this.executeStep(step, params, context);

        if (!result.success) {
          throw new Error(result.error || 'Tool call failed');
        }

        // Transform result if needed
        const transformedResult = step.transform
          ? step.transform(result.data)
          : result.data;

        context.results.set(step.id, transformedResult);
        stepsExecuted++;

        this.log(context, step.id, 'success', {
          latency: Date.now() - stepStart,
          resultKeys: Object.keys(transformedResult || {}),
        });

      } catch (error) {
        stepsFailed++;
        const err = error instanceof Error ? error : new Error(String(error));
        context.errors.push({ stepId: step.id, error: err });

        this.log(context, step.id, 'error', {
          message: err.message,
          latency: Date.now() - stepStart,
        });

        // Handle error based on strategy
        if (step.onError === 'stop') {
          break;
        } else if (step.onError === 'retry') {
          const retryResult = await this.retryStep(step, context, step.maxRetries || 3);
          if (retryResult) {
            context.results.set(step.id, retryResult);
            stepsExecuted++;
            this.log(context, step.id, 'retry', { success: true });
          }
        } else if (typeof step.onError === 'function') {
          const recoveryStep = step.onError(err, context);
          if (recoveryStep) {
            // Insert recovery step
            chain.steps.splice(i + 1, 0, recoveryStep);
          }
        }
        // 'skip' just continues to next step
      }
    }

    const finalResult = chain.finalTransform
      ? chain.finalTransform(context)
      : context.results.get(chain.steps[chain.steps.length - 1]?.id);

    return {
      success: stepsFailed === 0,
      finalResult,
      context,
      totalLatency: Date.now() - context.startTime.getTime(),
      stepsExecuted,
      stepsFailed,
    };
  }

  private async executeStep(
    step: ChainStep,
    params: Record<string, any>,
    context: ChainContext
  ): Promise<MCPCallResult> {
    return this.mcpClient.call(step.server, step.tool, params);
  }

  private async retryStep(
    step: ChainStep,
    context: ChainContext,
    maxRetries: number
  ): Promise<any | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const params = typeof step.params === 'function'
          ? step.params(context)
          : step.params;

        const result = await this.executeStep(step, params, context);

        if (result.success) {
          return step.transform ? step.transform(result.data) : result.data;
        }
      } catch {
        // Continue retrying
      }

      // Exponential backoff
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
    }
    return null;
  }

  private log(context: ChainContext, stepId: string, action: ChainLogEntry['action'], details?: any) {
    context.log.push({
      timestamp: new Date(),
      stepId,
      action,
      details,
    });
  }
}

// ============================================================================
// Chain Builder (Fluent API)
// ============================================================================

export class ChainBuilder {
  private chain: ChainDefinition;

  constructor(id: string, name: string) {
    this.chain = {
      id,
      name,
      steps: [],
    };
  }

  description(desc: string): ChainBuilder {
    this.chain.description = desc;
    return this;
  }

  initialContext(ctx: Record<string, any>): ChainBuilder {
    this.chain.initialContext = ctx;
    return this;
  }

  step(step: ChainStep): ChainBuilder {
    this.chain.steps.push(step);
    return this;
  }

  call(
    id: string,
    server: MCPServerName,
    tool: string,
    params: ChainStep['params']
  ): ChainBuilder {
    return this.step({ id, server, tool, params });
  }

  finalTransform(fn: (ctx: ChainContext) => any): ChainBuilder {
    this.chain.finalTransform = fn;
    return this;
  }

  build(): ChainDefinition {
    return this.chain;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let executorInstance: ToolChainExecutor | null = null;

export function getChainExecutor(): ToolChainExecutor {
  if (!executorInstance) {
    executorInstance = new ToolChainExecutor();
  }
  return executorInstance;
}

export function chain(id: string, name: string): ChainBuilder {
  return new ChainBuilder(id, name);
}

export async function executeChain(
  chainOrId: ChainDefinition | string,
  data: Record<string, any> = {}
): Promise<ChainResult> {
  const executor = getChainExecutor();
  const chainDef = typeof chainOrId === 'string'
    ? CHAIN_TEMPLATES[chainOrId]
    : chainOrId;

  if (!chainDef) {
    throw new Error(`Chain not found: ${chainOrId}`);
  }

  return executor.execute(chainDef, data);
}
