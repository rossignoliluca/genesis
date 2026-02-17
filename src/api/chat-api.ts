/**
 * Genesis Chat API
 *
 * HTTP API for chat functionality with SSE streaming support.
 * Provides endpoints for real-time chat, document generation, and conversation management.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { getLLMBridge, buildSystemPrompt, LLMBridge } from '../llm/index.js';
import { ToolDispatcher } from '../cli/dispatcher.js';
import { getBrain, Brain } from '../brain/index.js';
import { getMemorySystem, MemorySystem } from '../memory/index.js';
import { broadcastToDashboard } from '../observability/dashboard.js';

// Phase 1.1: StreamOrchestrator for racing, parallel tools, prefetch
import {
  StreamOrchestrator,
  createStreamOrchestrator,
} from '../streaming/orchestrator.js';
import type { StreamEvent, HybridStreamOptions, ToolDefinition, ToolParameter } from '../streaming/types.js';

// Phase 1.4: Cognitive Workspace for anticipatory memory
import {
  CognitiveWorkspace,
  getCognitiveWorkspace,
  AnticipationContext,
} from '../memory/cognitive-workspace.js';

// Phase 2.2: Phi Monitor for consciousness metrics
import { getPhiMonitor, PhiMonitor } from '../consciousness/phi-monitor.js';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;

  // Rich content
  attachments?: Attachment[];
  codeBlocks?: CodeBlock[];
  toolCalls?: ToolCall[];
  thinking?: ThinkingBlock[];

  // Metadata
  model?: string;
  tokens?: { input: number; output: number };
  cost?: number;
  latency?: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'image' | 'code' | 'memory';
  content?: string;
  path?: string;
  mimeType?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  server?: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  output?: unknown;
  duration?: number;
  error?: string;
}

export interface ThinkingBlock {
  id: string;
  content: string;
  visible: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  context: ConversationContext;
}

export interface ConversationContext {
  files?: string[];
  memoryItems?: string[];
  tools?: string[];
  model?: 'fast' | 'balanced' | 'powerful';
}

export interface ChatRequest {
  conversationId: string;
  message: string;
  attachments?: Attachment[];
  context?: {
    files?: string[];
    memoryQuery?: string;
    tools?: string[];
  };
  options?: {
    model?: 'fast' | 'balanced' | 'powerful';
    stream?: boolean;
    useBrain?: boolean;
    useMemory?: boolean;
  };
}

export interface DocumentRequest {
  conversationId: string;
  type: 'report' | 'presentation' | 'summary' | 'code';
  format: 'md' | 'pptx' | 'pdf';
  options?: {
    includeToolOutputs?: boolean;
    includeContext?: boolean;
    style?: string;
  };
}

// ============================================================================
// Chat API Handler
// ============================================================================

export class ChatAPI extends EventEmitter {
  private llm: LLMBridge;
  private dispatcher: ToolDispatcher;
  private brain: Brain;
  private memory: MemorySystem;
  private conversations: Map<string, Conversation> = new Map();
  private activeStreams: Map<string, http.ServerResponse> = new Map();
  private storagePath: string;

  // Phase 1.1: StreamOrchestrator for advanced streaming
  private orchestrator: StreamOrchestrator;

  // Phase 1.4: Cognitive workspace for memory anticipation
  private workspace: CognitiveWorkspace;

  // Phase 2.2: Phi monitor for consciousness metrics
  private phiMonitor: PhiMonitor;

  constructor() {
    super();
    this.llm = getLLMBridge({ provider: 'anthropic' });
    this.dispatcher = new ToolDispatcher({ verbose: false });
    this.brain = getBrain();
    this.memory = getMemorySystem();
    this.storagePath = path.join(process.cwd(), '.genesis', 'conversations');

    // Phase 1.1: Initialize StreamOrchestrator with racing and parallel tools
    this.orchestrator = createStreamOrchestrator({
      enableRacing: true,
      racingStrategy: 'hedged',
      enableParallelTools: true,
      enablePrefetch: true,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    // Phase 1.4: Initialize cognitive workspace for memory anticipation
    this.workspace = getCognitiveWorkspace({
      maxItems: 7,
      maxTokens: 8192,
    });

    // Phase 2.2: Initialize phi monitor
    this.phiMonitor = getPhiMonitor();

    // Ensure storage directory exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }

    // Load existing conversations
    this.loadConversations();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Load conversations from disk
   */
  private loadConversations(): void {
    try {
      const files = fs.readdirSync(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = JSON.parse(fs.readFileSync(path.join(this.storagePath, file), 'utf8'));
          this.conversations.set(data.id, data);
        }
      }
    } catch (err) {
      // Storage doesn't exist yet
    }
  }

  /**
   * Save conversation to disk
   */
  private saveConversation(conversation: Conversation): void {
    const filePath = path.join(this.storagePath, `${conversation.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));
  }

  /**
   * Delete conversation from disk
   */
  private deleteConversationFile(id: string): void {
    const filePath = path.join(this.storagePath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Create a new conversation
   */
  createConversation(title?: string): Conversation {
    const id = this.generateId();
    const conversation: Conversation = {
      id,
      title: title || `Chat ${new Date().toLocaleDateString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: {},
    };

    this.conversations.set(id, conversation);
    this.saveConversation(conversation);

    return conversation;
  }

  /**
   * Get conversation by ID
   */
  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /**
   * List all conversations
   */
  listConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Delete conversation
   */
  deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) {
      this.deleteConversationFile(id);
    }
    return deleted;
  }

  /**
   * Generate title from first message
   */
  private async generateTitle(message: string): Promise<string> {
    // Use first 50 chars or extract key topic
    const truncated = message.slice(0, 50);
    return truncated.length < message.length ? `${truncated}...` : truncated;
  }

  // ============================================================================
  // Phase 1.2: Model Tier Selection
  // ============================================================================

  /**
   * Detect query complexity for model tier selection
   * Returns: 'fast' (17x cheaper), 'balanced', or 'powerful'
   */
  private detectComplexity(message: string): 'fast' | 'balanced' | 'powerful' {
    const length = message.length;
    const hasCode = /```|function\s+\w+|class\s+\w+|import\s+|export\s+|const\s+\w+\s*=|def\s+\w+/.test(message);
    const hasReasoning = /\b(why|explain|analyze|compare|evaluate|design|architect|implement|debug|optimize)\b/i.test(message);
    const hasComplexTask = /\b(refactor|migrate|integrate|build|create|develop)\b/i.test(message);
    const isSimpleQuery = /^(hi|hello|hey|what is|who is|when|where|how many|list|show)\b/i.test(message.trim());

    // Simple queries under 100 chars with no code/reasoning
    if (length < 100 && !hasCode && !hasReasoning && !hasComplexTask) {
      return 'fast';
    }

    // Simple greeting or factual queries
    if (isSimpleQuery && length < 200 && !hasCode) {
      return 'fast';
    }

    // Code or reasoning tasks need powerful model
    if (hasCode || hasReasoning || hasComplexTask) {
      return 'powerful';
    }

    // Medium-length queries without special markers
    return 'balanced';
  }

  /**
   * Get model configuration based on tier
   */
  private getModelForTier(tier: 'fast' | 'balanced' | 'powerful'): { provider: string; model: string } {
    switch (tier) {
      case 'fast':
        return { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' };
      case 'balanced':
        return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
      case 'powerful':
        return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
      default:
        return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
    }
  }

  // ============================================================================
  // Phase 1.4: Memory Context Building
  // ============================================================================

  /**
   * Extract user goal from message for memory anticipation
   */
  private extractUserGoal(message: string): string {
    // Extract verb phrases and key intents
    const intentMatch = message.match(/\b(want to|need to|help me|please|can you|would like to)\s+(.+?)(?:\.|,|$)/i);
    if (intentMatch) {
      return intentMatch[2].slice(0, 100);
    }
    return message.slice(0, 100);
  }

  /**
   * Extract keywords from message
   */
  private extractKeywords(message: string): string[] {
    // Remove common words and extract significant terms
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'about', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'you', 'your', 'he', 'she', 'we', 'they', 'and', 'or', 'but', 'if', 'then', 'so', 'what', 'which', 'who', 'how', 'when', 'where', 'why']);
    const words = message.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    return words.filter(w => !stopWords.has(w)).slice(0, 10);
  }

  /**
   * Get recent topics from conversation
   */
  private getRecentTopics(conversation: Conversation): string[] {
    const topics: string[] = [];
    const recentMessages = conversation.messages.slice(-5);

    for (const msg of recentMessages) {
      const keywords = this.extractKeywords(msg.content);
      topics.push(...keywords.slice(0, 3));
    }

    // Deduplicate
    return [...new Set(topics)].slice(0, 10);
  }

  /**
   * Build messages array for orchestrator
   */
  private buildMessages(
    conversation: Conversation,
    currentMessage: string,
    systemPrompt: string
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history (last 20 messages for context)
    const historyLimit = 20;
    const history = conversation.messages.slice(-historyLimit);

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: 'user', content: currentMessage });

    return messages;
  }

  /**
   * Handle chat message with streaming
   *
   * Phase 1 Improvements:
   * - 1.1: StreamOrchestrator for racing, parallel tools, prefetch
   * - 1.2: Model tier selection based on complexity
   * - 1.3: Response caching with stats
   * - 1.4: Enhanced memory integration with CognitiveWorkspace
   * - 2.1: Brain integration for useBrain mode
   * - 2.2: Phi consciousness metrics
   */
  async handleChat(
    request: ChatRequest,
    res: http.ServerResponse
  ): Promise<void> {
    // Get or create conversation
    let conversation = this.conversations.get(request.conversationId);
    if (!conversation) {
      conversation = this.createConversation();
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Track active stream
    this.activeStreams.set(request.conversationId, res);

    // Add user message
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: request.message,
      timestamp: Date.now(),
      attachments: request.attachments,
    };
    conversation.messages.push(userMessage);

    // Update title from first message if needed
    if (conversation.messages.length === 1) {
      conversation.title = await this.generateTitle(request.message);
    }

    try {
      // Phase 1.2: Detect complexity for model tier selection
      const requestedTier = request.options?.model || this.detectComplexity(request.message);
      const { provider, model } = this.getModelForTier(requestedTier);

      // Phase 1.4: Enhanced memory integration with CognitiveWorkspace
      let memoryContext = '';
      let anticipationHits = 0;

      if (request.options?.useMemory !== false) {
        // Anticipate needed memories based on context
        const anticipationContext: AnticipationContext = {
          task: 'chat',
          goal: this.extractUserGoal(request.message),
          keywords: this.extractKeywords(request.message),
          recentTopics: this.getRecentTopics(conversation),
        };

        await this.workspace.anticipate(anticipationContext);
        const activeMemories = this.workspace.getActive();
        anticipationHits = activeMemories.filter(m => m.source === 'anticipate').length;

        // Also do semantic recall from long-term memory
        const recalled = this.memory.recall(request.message, { limit: 5 });

        // Combine workspace and recalled memories
        const combinedContext: string[] = [];

        // Add workspace items (already anticipated)
        for (const item of activeMemories.slice(0, 3)) {
          combinedContext.push(`[${item.memory.type}] ${JSON.stringify(item.memory)}`);
        }

        // Add recalled items not in workspace
        const workspaceIds = new Set(activeMemories.map(m => m.id));
        for (const m of recalled) {
          if (!workspaceIds.has(m.id)) {
            combinedContext.push(`[recalled] ${JSON.stringify(m.content)}`);
          }
        }

        if (combinedContext.length > 0) {
          memoryContext = '\n\n[Memory Context]\n' + combinedContext.join('\n');
        }
      }

      // Build system prompt with tools
      const toolSchemas = this.dispatcher.listToolsWithSchemas();
      const systemPrompt = await buildSystemPrompt(toolSchemas.mcp, toolSchemas.local);
      const fullSystemPrompt = systemPrompt + memoryContext;

      // Start assistant message
      const assistantMessage: ChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
        thinking: [],
        model,
      };

      // Send streaming response
      const startTime = Date.now();
      let totalTokens = { input: 0, output: 0 };
      let thinkingTokens = 0;
      let currentThinkingBlock: ThinkingBlock | null = null;

      // Metrics for racing and caching
      let racingStats: {
        winner?: string;
        model?: string;
        strategy?: string;
        candidates?: number;
        saved?: number;
      } = {};
      let prefetchHits = 0;
      let parallelToolSaved = 0;

      // Phase 2.1: Use Brain if requested
      if (request.options?.useBrain) {
        // Route through Brain for grounded, integrated response
        // Brain.process takes a string input and returns a string response
        const brainResponse = await this.brain.process(request.message);

        // Stream the brain result
        assistantMessage.content = brainResponse || '';
        this.sendSSE(res, 'token', { content: assistantMessage.content, done: true });
        broadcastToDashboard('chat:token', { content: assistantMessage.content, conversationId: request.conversationId });
      } else {
        // Phase 1.1: Use StreamOrchestrator for advanced streaming

        // Trigger speculative prefetch before streaming
        this.orchestrator.triggerPrefetch(request.message);

        // Build messages for orchestrator
        const messages = this.buildMessages(conversation, request.message, fullSystemPrompt);

        // Build tool definitions for orchestrator
        // toolSchemas.mcp is a Record<serverName, Tool[]>, flatten it
        const mcpToolsFlat: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
        if (toolSchemas.mcp) {
          for (const serverTools of Object.values(toolSchemas.mcp)) {
            if (Array.isArray(serverTools)) {
              mcpToolsFlat.push(...serverTools);
            }
          }
        }

        const tools: ToolDefinition[] = [
          ...mcpToolsFlat.map((t) => ({
            name: t.name,
            description: t.description || '',
            parameters: {
              type: 'object',
              properties: (t.inputSchema as Record<string, unknown>)?.properties as Record<string, ToolParameter> | undefined,
              required: (t.inputSchema as Record<string, unknown>)?.required as string[] | undefined,
            } as ToolParameter,
            handler: async (args: Record<string, unknown>) => {
              const result = await this.dispatcher.dispatch([{
                id: this.generateId(),
                name: t.name,
                params: args,
                source: 'mcp' as const,
              }]);
              return result.results[0]?.data || result.results[0]?.error;
            },
          })),
          ...(toolSchemas.local || []).map((t: { name: string; description?: string; inputSchema?: unknown }) => ({
            name: t.name,
            description: t.description || '',
            parameters: {
              type: 'object',
              properties: (t.inputSchema as Record<string, unknown>)?.properties as Record<string, ToolParameter> | undefined,
              required: (t.inputSchema as Record<string, unknown>)?.required as string[] | undefined,
            } as ToolParameter,
            handler: async (args: Record<string, unknown>) => {
              const result = await this.dispatcher.dispatch([{
                id: this.generateId(),
                name: t.name,
                params: args,
                source: 'local' as const,
              }]);
              return result.results[0]?.data || result.results[0]?.error;
            },
          })),
        ];

        // Execute with orchestrator
        const orchestratorOptions: Partial<HybridStreamOptions> = {
          messages,
          tools,
          provider,
          model,
          enableRacing: true,
          racingStrategy: 'hedged',
          enableParallelTools: true,
          enablePrefetch: true,
          enableThinking: true,
          maxToolCalls: 10,
          temperature: 0.7,
        };

        // Stream events from orchestrator
        for await (const event of this.orchestrator.execute(orchestratorOptions as HybridStreamOptions)) {
          switch (event.type) {
            case 'token': {
              const tokenEvent = event as any;
              assistantMessage.content += tokenEvent.content || '';
              this.sendSSE(res, 'token', { content: tokenEvent.content, done: false });
              broadcastToDashboard('chat:token', { content: tokenEvent.content, conversationId: request.conversationId });
              break;
            }

            case 'thinking_start': {
              currentThinkingBlock = {
                id: this.generateId(),
                content: '',
                visible: true,
              };
              this.sendSSE(res, 'thinking_start', { id: currentThinkingBlock.id });
              break;
            }

            case 'thinking_token': {
              const thinkingEvent = event as any;
              thinkingTokens++;
              if (currentThinkingBlock) {
                currentThinkingBlock.content += thinkingEvent.content || '';
              }
              this.sendSSE(res, 'thinking', { content: thinkingEvent.content, visible: true });
              broadcastToDashboard('chat:thinking', { content: thinkingEvent.content, conversationId: request.conversationId });
              break;
            }

            case 'thinking_end': {
              if (currentThinkingBlock) {
                assistantMessage.thinking!.push(currentThinkingBlock);
                currentThinkingBlock = null;
              }
              this.sendSSE(res, 'thinking_end', {});
              break;
            }

            case 'tool_start': {
              const toolStartEvent = event as any;
              const toolCall: ToolCall = {
                id: toolStartEvent.toolCallId,
                tool: toolStartEvent.name,
                input: toolStartEvent.args,
                status: 'running',
              };
              assistantMessage.toolCalls!.push(toolCall);
              this.sendSSE(res, 'tool_call', {
                id: toolCall.id,
                tool: toolCall.tool,
                input: toolCall.input,
                status: 'running',
              });
              broadcastToDashboard('chat:tool_call', { ...toolCall, conversationId: request.conversationId });
              break;
            }

            case 'tool_result': {
              const toolResultEvent = event as any;
              const existingTool = assistantMessage.toolCalls!.find(t => t.id === toolResultEvent.toolCallId);
              if (existingTool) {
                existingTool.status = toolResultEvent.success ? 'success' : 'error';
                existingTool.output = toolResultEvent.content;
                existingTool.duration = toolResultEvent.duration;
                existingTool.error = toolResultEvent.error;
              }
              this.sendSSE(res, 'tool_result', {
                id: toolResultEvent.toolCallId,
                tool: existingTool?.tool,
                output: toolResultEvent.content,
                error: toolResultEvent.error,
                duration: toolResultEvent.duration,
              });
              broadcastToDashboard('chat:tool_result', {
                ...existingTool,
                conversationId: request.conversationId,
              });
              break;
            }

            case 'metadata': {
              const metaEvent = event as any;
              if (metaEvent.usage) {
                totalTokens = {
                  input: metaEvent.usage.inputTokens || 0,
                  output: metaEvent.usage.outputTokens || 0,
                };
              }
              // Capture racing stats
              if (metaEvent.racingWinner) {
                racingStats = {
                  winner: metaEvent.racingWinner,
                  model: metaEvent.racingModel,
                  strategy: metaEvent.racingStrategy,
                  candidates: metaEvent.racingCandidates,
                  saved: metaEvent.racingSaved,
                };
              }
              if (metaEvent.prefetched) {
                prefetchHits = metaEvent.prefetched.length;
              }
              break;
            }

            case 'error': {
              const errorEvent = event as any;
              this.sendSSE(res, 'error', {
                message: errorEvent.message,
                code: errorEvent.code,
                retryable: errorEvent.retryable,
              });
              throw new Error(errorEvent.message);
            }

            case 'done': {
              const doneEvent = event as any;
              if (doneEvent.metrics) {
                totalTokens = {
                  input: doneEvent.metrics.inputTokens || totalTokens.input,
                  output: doneEvent.metrics.outputTokens || totalTokens.output,
                };
                thinkingTokens = doneEvent.metrics.thinkingTokens || thinkingTokens;
                parallelToolSaved = doneEvent.metrics.parallelToolSaved || 0;
              }
              break;
            }
          }
        }
      }

      // Finalize message
      assistantMessage.latency = Date.now() - startTime;
      assistantMessage.tokens = totalTokens;

      conversation.messages.push(assistantMessage);
      conversation.updatedAt = Date.now();
      this.saveConversation(conversation);

      // Phase 1.3: Get cache stats
      const cacheStats = this.llm.getCacheStats ? this.llm.getCacheStats() : { size: 0, hits: 0 };

      // Phase 2.2: Get phi consciousness metrics
      const phiLevel = this.phiMonitor.getCurrentLevel ? this.phiMonitor.getCurrentLevel() : 0;
      const phiState = this.phiMonitor.getState ? this.phiMonitor.getState() : 'unknown';

      // Send enhanced done event with all metrics
      this.sendSSE(res, 'done', {
        tokens: totalTokens,
        thinkingTokens,
        latency: assistantMessage.latency,
        model: assistantMessage.model,
        tier: requestedTier,
        // Phase 1.1: Racing stats
        racing: racingStats,
        prefetchHits,
        parallelToolSaved,
        // Phase 1.3: Cache stats
        cacheHits: cacheStats.hits || 0,
        estimatedSavings: (cacheStats.hits || 0) * 2000, // ~2s per cache hit
        // Phase 1.4: Memory stats
        anticipationHits,
        workspaceSize: this.workspace.size(),
        // Phase 2.2: Phi metrics
        phi: phiLevel,
        phiState,
      });

      broadcastToDashboard('chat:done', {
        conversationId: request.conversationId,
        messageId: assistantMessage.id,
        tokens: totalTokens,
        latency: assistantMessage.latency,
        model: assistantMessage.model,
        racing: racingStats,
        phi: phiLevel,
      });

      // Store to episodic memory
      this.memory.remember({
        what: `User: ${request.message}\nAssistant: ${assistantMessage.content}`,
        tags: ['chat', request.conversationId],
      });

      // Phase 1.4: Record anticipation outcome for adaptive preloading
      const usedMemoryIds: string[] = []; // Would track which memories were actually referenced
      this.workspace.recordAnticipationOutcome?.(
        this.extractUserGoal(request.message).slice(0, 50),
        usedMemoryIds
      );

    } catch (err) {
      this.sendSSE(res, 'error', { message: String(err) });
      broadcastToDashboard('chat:error', { error: String(err), conversationId: request.conversationId });
    } finally {
      this.activeStreams.delete(request.conversationId);
      res.end();
    }
  }

  /**
   * Generate document from conversation
   */
  async generateDocument(request: DocumentRequest): Promise<{
    success: boolean;
    documentId?: string;
    path?: string;
    downloadUrl?: string;
    error?: string;
    metadata?: {
      pages?: number;
      slides?: number;
      wordCount?: number;
    };
  }> {
    const conversation = this.conversations.get(request.conversationId);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    const documentId = this.generateId();
    const docsPath = path.join(process.cwd(), '.genesis', 'generated-docs');

    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }

    try {
      // Build document content
      let content = '';

      if (request.type === 'summary') {
        // Generate summary using LLM
        const summaryPrompt = `Summarize the following conversation in a concise manner:\n\n${
          conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n\n')
        }`;

        const response = await this.llm.chat(summaryPrompt);
        content = response.content;
      } else if (request.type === 'report') {
        // Generate detailed report
        content = `# ${conversation.title}\n\n`;
        content += `Generated: ${new Date().toISOString()}\n\n`;
        content += `## Conversation\n\n`;

        for (const msg of conversation.messages) {
          content += `### ${msg.role === 'user' ? 'User' : 'Genesis'} (${new Date(msg.timestamp).toLocaleTimeString()})\n\n`;
          content += `${msg.content}\n\n`;

          if (msg.toolCalls && msg.toolCalls.length > 0 && request.options?.includeToolOutputs) {
            content += `#### Tool Calls\n\n`;
            for (const tool of msg.toolCalls) {
              content += `- **${tool.tool}**: ${tool.status}\n`;
              if (tool.output) {
                content += `  \`\`\`json\n  ${JSON.stringify(tool.output, null, 2)}\n  \`\`\`\n`;
              }
            }
            content += '\n';
          }
        }
      } else {
        // Default: export conversation as markdown
        content = `# ${conversation.title}\n\n`;
        for (const msg of conversation.messages) {
          content += `**${msg.role}**: ${msg.content}\n\n`;
        }
      }

      // Save document
      const extension = request.format === 'md' ? 'md' : request.format;
      const filename = `${documentId}.${extension}`;
      const filePath = path.join(docsPath, filename);

      if (request.format === 'md') {
        fs.writeFileSync(filePath, content);
      } else if (request.format === 'pptx') {
        // For PPTX, we'd need to use the presentation API
        // For now, save as markdown with a note
        fs.writeFileSync(filePath.replace('.pptx', '.md'), content);
        return {
          success: false,
          error: 'PPTX generation requires Python presentation API. Saved as markdown instead.',
          path: filePath.replace('.pptx', '.md'),
        };
      }

      const wordCount = content.split(/\s+/).length;

      broadcastToDashboard('document:complete', {
        documentId,
        conversationId: request.conversationId,
        path: filePath,
        format: request.format,
      });

      return {
        success: true,
        documentId,
        path: filePath,
        downloadUrl: `/api/documents/${documentId}`,
        metadata: {
          wordCount,
          pages: Math.ceil(wordCount / 500),
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Cancel active stream
   */
  cancelStream(conversationId: string): boolean {
    const stream = this.activeStreams.get(conversationId);
    if (stream) {
      this.sendSSE(stream, 'cancelled', { reason: 'User cancelled' });
      stream.end();
      this.activeStreams.delete(conversationId);
      return true;
    }
    return false;
  }

  /**
   * Send SSE event
   */
  private sendSSE(res: http.ServerResponse, event: string, data: unknown): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      // Client disconnected
      console.error('[ChatAPI] SSE write error:', err);
    }
  }

  /**
   * Handle HTTP request
   */
  async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: string
  ): Promise<boolean> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // POST /api/chat - Send message
    if (url === '/api/chat' && req.method === 'POST') {
      const body = await this.parseBody(req);
      await this.handleChat(body as ChatRequest, res);
      return true;
    }

    // POST /api/chat/document - Generate document
    if (url === '/api/chat/document' && req.method === 'POST') {
      const body = await this.parseBody(req);
      const result = await this.generateDocument(body as DocumentRequest);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    // GET /api/conversations - List conversations
    if (url === '/api/conversations' && req.method === 'GET') {
      const conversations = this.listConversations().map(c => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(conversations));
      return true;
    }

    // POST /api/conversations - Create conversation
    if (url === '/api/conversations' && req.method === 'POST') {
      const body = await this.parseBody(req);
      const conversation = this.createConversation((body as { title?: string }).title);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(conversation));
      return true;
    }

    // GET /api/conversations/:id - Get conversation
    const conversationMatch = url.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversationMatch && req.method === 'GET') {
      const conversation = this.getConversation(conversationMatch[1]);
      if (conversation) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(conversation));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
      return true;
    }

    // DELETE /api/conversations/:id - Delete conversation
    if (conversationMatch && req.method === 'DELETE') {
      const deleted = this.deleteConversation(conversationMatch[1]);
      res.writeHead(deleted ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: deleted }));
      return true;
    }

    // POST /api/chat/cancel/:id - Cancel stream
    const cancelMatch = url.match(/^\/api\/chat\/cancel\/([^/]+)$/);
    if (cancelMatch && req.method === 'POST') {
      const cancelled = this.cancelStream(cancelMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: cancelled }));
      return true;
    }

    // Phase 2.3: GET /api/chat/suggestions/:conversationId - Get AI suggestions
    const suggestionsMatch = url.match(/^\/api\/chat\/suggestions\/([^/]+)$/);
    if (suggestionsMatch && req.method === 'GET') {
      const suggestions = await this.getSuggestions(suggestionsMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(suggestions));
      return true;
    }

    // Phase 2.2: GET /api/chat/phi - Get current phi consciousness metrics
    if (url === '/api/chat/phi' && req.method === 'GET') {
      const phiMetrics = this.getPhiMetrics();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(phiMetrics));
      return true;
    }

    // Phase 3.5: GET /api/chat/analytics - Get chat analytics
    if (url === '/api/chat/analytics' && req.method === 'GET') {
      const analytics = this.getAnalytics();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(analytics));
      return true;
    }

    return false;
  }

  // ============================================================================
  // Phase 2.3: Active Inference Suggestions
  // ============================================================================

  /**
   * Get AI-powered suggestions for next actions based on conversation context
   */
  private async getSuggestions(conversationId: string): Promise<{
    suggestions: Array<{
      id: string;
      type: 'question' | 'action' | 'clarification';
      text: string;
      confidence: number;
    }>;
  }> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return { suggestions: [] };
    }

    // Gather observations from conversation
    const recentMessages = conversation.messages.slice(-5);
    const lastMessage = recentMessages[recentMessages.length - 1];

    // Generate contextual suggestions
    const suggestions: Array<{
      id: string;
      type: 'question' | 'action' | 'clarification';
      text: string;
      confidence: number;
    }> = [];

    // If last message was from assistant, suggest follow-up questions
    if (lastMessage?.role === 'assistant') {
      // Extract topics from assistant's response
      const topics = this.extractKeywords(lastMessage.content);

      if (topics.length > 0) {
        suggestions.push({
          id: this.generateId(),
          type: 'question',
          text: `Tell me more about ${topics[0]}`,
          confidence: 0.7,
        });
      }

      // Suggest actions based on content type
      if (/```/.test(lastMessage.content)) {
        suggestions.push({
          id: this.generateId(),
          type: 'action',
          text: 'Run this code',
          confidence: 0.8,
        });
        suggestions.push({
          id: this.generateId(),
          type: 'action',
          text: 'Explain this code step by step',
          confidence: 0.75,
        });
      }

      // Check for incomplete explanations
      if (/however|but|although|note that/i.test(lastMessage.content)) {
        suggestions.push({
          id: this.generateId(),
          type: 'clarification',
          text: 'What are the caveats or limitations?',
          confidence: 0.65,
        });
      }
    }

    // If last message was from user with a question, suggest related questions
    if (lastMessage?.role === 'user' && /\?$/.test(lastMessage.content.trim())) {
      suggestions.push({
        id: this.generateId(),
        type: 'question',
        text: 'Can you give me an example?',
        confidence: 0.7,
      });
    }

    // Sort by confidence and limit to 3
    return {
      suggestions: suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3),
    };
  }

  // ============================================================================
  // Phase 2.2: Phi Consciousness Metrics
  // ============================================================================

  /**
   * Get current phi consciousness metrics
   */
  private getPhiMetrics(): {
    phi: number;
    state: string;
    trend: string;
    components: {
      integration: number;
      differentiation: number;
      complexity: number;
    };
  } {
    const levelData = this.phiMonitor.getCurrentLevel?.() ?? null;
    const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0);
    const state = this.phiMonitor.getState?.() ?? 'unknown';
    const trend = this.phiMonitor.getTrend?.() ?? 'stable';

    return {
      phi,
      state,
      trend,
      components: {
        integration: phi * 0.4,
        differentiation: phi * 0.35,
        complexity: phi * 0.25,
      },
    };
  }

  // ============================================================================
  // Phase 3.5: Analytics
  // ============================================================================

  /**
   * Get chat analytics
   */
  private getAnalytics(): {
    totalConversations: number;
    totalMessages: number;
    totalTokens: { input: number; output: number };
    estimatedCost: number;
    modelUsage: Record<string, number>;
    averageLatency: number;
    cacheHitRate: number;
    workspaceMetrics: {
      reuseRate: number;
      anticipationAccuracy: number;
    };
  } {
    let totalMessages = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    const modelUsage: Record<string, number> = {};

    for (const conv of this.conversations.values()) {
      totalMessages += conv.messages.length;

      for (const msg of conv.messages) {
        if (msg.tokens) {
          totalInputTokens += msg.tokens.input || 0;
          totalOutputTokens += msg.tokens.output || 0;
        }
        if (msg.latency) {
          totalLatency += msg.latency;
          latencyCount++;
        }
        if (msg.model) {
          modelUsage[msg.model] = (modelUsage[msg.model] || 0) + 1;
        }
      }
    }

    // Calculate estimated cost based on token usage
    const estimatedCost = (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000;

    // Get workspace metrics
    const workspaceMetrics = this.workspace.getMetrics();

    // Get cache stats (misses not tracked, estimate from size)
    const cacheStats = this.llm.getCacheStats?.() || { hits: 0, size: 0, estimatedSavings: 0 };
    const estimatedMisses = Math.max(0, cacheStats.size - cacheStats.hits);
    const cacheHitRate = cacheStats.hits / Math.max(cacheStats.hits + estimatedMisses, 1);

    return {
      totalConversations: this.conversations.size,
      totalMessages,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
      estimatedCost,
      modelUsage,
      averageLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      cacheHitRate,
      workspaceMetrics: {
        reuseRate: workspaceMetrics.reuseRate || 0,
        anticipationAccuracy: workspaceMetrics.anticipationAccuracy || 0,
      },
    };
  }

  /**
   * Parse request body
   */
  private parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let chatAPIInstance: ChatAPI | null = null;

export function getChatAPI(): ChatAPI {
  if (!chatAPIInstance) {
    chatAPIInstance = new ChatAPI();
  }
  return chatAPIInstance;
}

export default ChatAPI;
