/**
 * Genesis v10.5 - Next-Gen Streaming Chat Handler
 *
 * Integrates:
 * - StreamOrchestrator (hybrid streaming with tool loops)
 * - ReasoningDisplay (progressive disclosure of thinking)
 * - BlockRenderer (structured block-based output)
 * - Sparkline utilities (live metrics visualization)
 * - TerminalCapabilities (adaptive layout)
 * - ContextGrounder (project-aware prompts)
 */

import {
  StreamOrchestrator,
  createStreamOrchestrator,
} from '../streaming/orchestrator.js';
import {
  StreamEvent,
  StreamMetrics,
  ToolDefinition,
  HybridStreamOptions,
  Message,
} from '../streaming/types.js';
import { ProviderName } from '../streaming/provider-adapter.js';
import { ContextGrounder } from '../streaming/context-grounder.js';
import { ReasoningDisplay, ReasoningNode } from './reasoning-display.js';
import {
  BlockRenderer,
  createTextBlock,
  createToolCallBlock,
  createToolResultBlock,
  createThinkingBlock,
  createErrorBlock,
  Block,
} from './block-renderer.js';
import {
  sparkline,
  latencyIndicator,
  tokenCounter,
  costMeter,
  formatNumber,
  trendIndicator,
} from './sparkline.js';
import {
  detectTerminal,
  getResponsiveLayout,
  TerminalCapabilities,
  ResponsiveLayout,
} from './terminal-detect.js';
import { c } from './ui.js';

// ============================================================================
// Types
// ============================================================================

export interface StreamChatOptions {
  provider: ProviderName;
  model: string;
  systemPrompt: string;
  userMessage: string;
  tools?: ToolDefinition[];
  enableThinking?: boolean;
  maxToolCalls?: number;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
  onComplete?: (result: StreamChatResult) => void;
}

export interface StreamChatResult {
  content: string;
  metrics: StreamMetrics;
  toolCalls: number;
  thinkingTokens: number;
  blocks: Block[];
}

// ============================================================================
// StreamChatHandler
// ============================================================================

export class StreamChatHandler {
  private orchestrator: StreamOrchestrator;
  private grounder: ContextGrounder;
  private reasoning: ReasoningDisplay;
  private renderer: BlockRenderer;
  private terminal: TerminalCapabilities;
  private layout: ResponsiveLayout;

  // Live state
  private tokenHistory: number[] = [];
  private lastTokenTime = 0;
  private tokensInWindow = 0;
  private currentBlocks: Block[] = [];
  private isThinking = false;
  private thinkingContent = '';

  constructor() {
    this.orchestrator = createStreamOrchestrator();
    this.grounder = new ContextGrounder();
    this.reasoning = new ReasoningDisplay();
    this.renderer = new BlockRenderer();
    this.terminal = detectTerminal();
    this.layout = getResponsiveLayout(this.terminal);
  }

  /**
   * Execute a streaming chat with full UX orchestration
   */
  async execute(options: StreamChatOptions): Promise<StreamChatResult> {
    this.resetState();

    // Gather context for grounding
    const context = await this.grounder.gather();
    const groundingSection = this.grounder.formatForPrompt(context);

    // Build system prompt with grounding
    const systemPrompt = groundingSection
      ? `${options.systemPrompt}\n\n${groundingSection}`
      : options.systemPrompt;

    // Build messages
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: options.userMessage },
    ];

    // Build stream options
    const streamOptions: HybridStreamOptions = {
      provider: options.provider,
      model: options.model,
      messages,
      tools: options.tools,
      enableThinking: options.enableThinking,
      maxToolCalls: options.maxToolCalls || 10,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    };

    // Print spacing before response
    console.log();

    let fullContent = '';
    let toolCallCount = 0;
    let thinkingTokenCount = 0;

    try {
      for await (const event of this.orchestrator.execute(streamOptions)) {
        this.handleEvent(event, options.verbose || false);

        switch (event.type) {
          case 'token':
            fullContent += event.content;
            this.trackTokenRate();
            break;
          case 'tool_start':
            toolCallCount++;
            break;
          case 'thinking_token':
            thinkingTokenCount++;
            break;
          case 'done':
            break;
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Unknown streaming error';
      console.log();
      console.log(c(`  Error: ${msg}`, 'red'));
    }

    // Final newline after streaming
    console.log();

    // Show metrics summary
    const metrics = this.orchestrator.getMetrics();
    if (options.verbose) {
      this.printMetricsSummary(metrics);
    }

    const result: StreamChatResult = {
      content: fullContent,
      metrics,
      toolCalls: toolCallCount,
      thinkingTokens: thinkingTokenCount,
      blocks: this.currentBlocks,
    };

    if (options.onComplete) {
      options.onComplete(result);
    }

    return result;
  }

  /**
   * Get the underlying orchestrator for advanced control
   */
  getOrchestrator(): StreamOrchestrator {
    return this.orchestrator;
  }

  /**
   * Abort the current stream
   */
  abort(): void {
    this.orchestrator.abort();
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private handleEvent(event: StreamEvent, verbose: boolean): void {
    switch (event.type) {
      case 'token':
        this.handleToken(event.content);
        break;

      case 'thinking_start':
        this.handleThinkingStart();
        break;

      case 'thinking_token':
        this.handleThinkingToken(event.content);
        break;

      case 'thinking_end':
        this.handleThinkingEnd();
        break;

      case 'tool_start':
        this.handleToolStart(event.name, event.args);
        break;

      case 'tool_result':
        this.handleToolResult(
          event.toolCallId,
          event.content as string,
          event.success,
          event.duration
        );
        break;

      case 'metadata':
        if (verbose) {
          this.handleMetadata(event);
        }
        break;

      case 'error':
        this.handleError(event.code, event.message);
        break;

      case 'done':
        // Handled in execute()
        break;
    }
  }

  private handleToken(content: string): void {
    process.stdout.write(content);
  }

  private handleThinkingStart(): void {
    this.isThinking = true;
    this.thinkingContent = '';

    if (this.terminal.colorDepth > 1) {
      // Show subtle thinking indicator
      process.stdout.write(c('  ◆ thinking...', 'dim'));
    }
  }

  private handleThinkingToken(content: string): void {
    this.thinkingContent += content;

    // Feed to reasoning display for progressive visualization
    this.reasoning.addToken(content);
  }

  private handleThinkingEnd(): void {
    this.isThinking = false;

    if (this.terminal.colorDepth > 1) {
      // Clear the thinking indicator line
      process.stdout.write('\r\x1b[K');
    }

    // Add thinking block for structured output
    if (this.thinkingContent.length > 0) {
      const block = createThinkingBlock(this.thinkingContent);
      this.currentBlocks.push(block);

      // Show condensed thinking summary
      const summary = this.thinkingContent.length > 120
        ? this.thinkingContent.slice(0, 120) + '...'
        : this.thinkingContent;
      if (this.terminal.colorDepth > 1) {
        console.log(c(`  ◆ ${summary}`, 'dim'));
        console.log();
      }
    }
  }

  private handleToolStart(name: string, args: Record<string, unknown>): void {
    console.log();

    const argsPreview = Object.keys(args).length > 0
      ? ` ${JSON.stringify(args).slice(0, 60)}`
      : '';

    if (this.terminal.colorDepth > 1) {
      console.log(c(`  ▸ ${name}${argsPreview}`, 'cyan'));
    } else {
      console.log(`  > ${name}${argsPreview}`);
    }
  }

  private handleToolResult(
    _id: string,
    content: string,
    success: boolean,
    duration: number
  ): void {
    const durationStr = latencyIndicator(duration);
    const statusIcon = success ? '✓' : '✗';
    const color = success ? 'green' : 'red';

    if (this.terminal.colorDepth > 1) {
      const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;
      console.log(c(`    ${statusIcon} ${durationStr} ${preview}`, color));
    } else {
      console.log(`    ${statusIcon} [${duration}ms] ${content.slice(0, 80)}`);
    }

    console.log();
  }

  private handleMetadata(event: StreamEvent & { type: 'metadata' }): void {
    if (event.usage) {
      const { inputTokens, outputTokens } = event.usage;
      if (this.terminal.colorDepth > 1) {
        console.log(c(
          `  │ in:${formatNumber(inputTokens)} out:${formatNumber(outputTokens)}`,
          'dim'
        ));
      }
    }
  }

  private handleError(code: string, message: string): void {
    console.log();
    if (this.terminal.colorDepth > 1) {
      console.log(c(`  ✗ [${code}] ${message}`, 'red'));
    } else {
      console.log(`  Error [${code}]: ${message}`);
    }

    const block = createErrorBlock(`[${code}] ${message}`);
    this.currentBlocks.push(block);
  }

  // ============================================================================
  // Metrics Display
  // ============================================================================

  private printMetricsSummary(metrics: StreamMetrics): void {
    const parts: string[] = [];

    // Token count
    parts.push(`${metrics.outputTokens} tok`);

    // Speed
    if (metrics.tokensPerSecond > 0) {
      parts.push(`${Math.round(metrics.tokensPerSecond)}/s`);
    }

    // Cost
    if (metrics.cost > 0) {
      const costStr = metrics.cost < 0.01
        ? `${(metrics.cost * 1000).toFixed(2)}m`
        : `$${metrics.cost.toFixed(4)}`;
      parts.push(costStr);
    }

    // Elapsed
    parts.push(`${Math.round(metrics.elapsed)}ms`);

    // TTFT
    if (metrics.timeToFirstToken !== undefined) {
      parts.push(`TTFT:${metrics.timeToFirstToken}ms`);
    }

    // Tool calls
    if (metrics.toolCallCount > 0) {
      parts.push(`${metrics.toolCallCount} tools`);
    }

    // Thinking tokens
    if (metrics.thinkingTokens > 0) {
      parts.push(`${metrics.thinkingTokens} thinking`);
    }

    // Token rate sparkline
    if (this.tokenHistory.length > 3) {
      const spark = sparkline(this.tokenHistory, { width: 8 });
      parts.push(spark);
    }

    if (this.terminal.colorDepth > 1) {
      console.log(c(`  ${parts.join(' · ')}`, 'dim'));
    } else {
      console.log(`  ${parts.join(' | ')}`);
    }
  }

  // ============================================================================
  // Token Rate Tracking
  // ============================================================================

  private trackTokenRate(): void {
    const now = Date.now();
    this.tokensInWindow++;

    // Sample every 500ms
    if (now - this.lastTokenTime >= 500) {
      const rate = this.tokensInWindow * 2; // Convert to tokens/sec
      this.tokenHistory.push(rate);
      if (this.tokenHistory.length > 20) {
        this.tokenHistory.shift();
      }
      this.tokensInWindow = 0;
      this.lastTokenTime = now;
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  private resetState(): void {
    this.tokenHistory = [];
    this.lastTokenTime = Date.now();
    this.tokensInWindow = 0;
    this.currentBlocks = [];
    this.isThinking = false;
    this.thinkingContent = '';
    this.reasoning = new ReasoningDisplay();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createStreamChatHandler(): StreamChatHandler {
  return new StreamChatHandler();
}
