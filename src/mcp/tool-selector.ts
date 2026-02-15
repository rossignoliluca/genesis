/**
 * Dynamic Action Space Pruning for MCP Tools
 *
 * Research shows (SWE-agent ACI) that restricting available tools per task
 * dramatically improves agent reasoning quality. This module prunes the 46
 * MCP servers down to task-relevant subsets.
 */

export type TaskType =
  | 'market-analysis'
  | 'code-generation'
  | 'research'
  | 'content-creation'
  | 'infrastructure'
  | 'financial-ops'
  | 'social-media'
  | 'presentation'
  | 'general';

export interface ToolProfile {
  servers: string[];
  tools: string[];
  reasoning: string;
}

/**
 * Static mappings from task types to relevant MCP servers.
 * Each mapping is designed to minimize cognitive load while
 * preserving necessary capabilities for the task domain.
 */
const TASK_SERVER_MAP: Record<TaskType, string[]> = {
  'market-analysis': [
    'brave-search',
    'exa',
    'firecrawl',
    'openai',
    'gemini',
    'polygon',
    'alphavantage',
    'memory',
    'postgres',
    'wolfram',
  ],
  'code-generation': [
    'github',
    'filesystem',
    'openai',
    'deepseek',
    'docker',
    'sentry',
    'memory',
  ],
  'research': [
    'brave-search',
    'exa',
    'firecrawl',
    'arxiv',
    'semantic-scholar',
    'openai',
    'gemini',
    'wolfram',
    'context7',
    'memory',
  ],
  'content-creation': [
    'openai',
    'gemini',
    'stability-ai',
    'recraft',
    'imagegen-multi',
    'huggingface',
    'elevenlabs',
    'memory',
  ],
  'infrastructure': [
    'github',
    'vercel',
    'cloudflare',
    'supabase',
    'postgres',
    'docker',
    'aws',
    'memory',
  ],
  'financial-ops': [
    'stripe',
    'coinbase',
    'polygon',
    'alphavantage',
    'postgres',
    'memory',
  ],
  'social-media': [
    'twitter',
    'slack',
    'gmail',
    'youtube',
    'memory',
  ],
  'presentation': [
    'openai',
    'filesystem',
    'stability-ai',
    'recraft',
    'antv-charts',
    'memory',
  ],
  'general': [], // Empty array signals "use all servers"
};

/**
 * Keyword patterns for task type inference.
 * Order matters: more specific patterns should come first.
 */
const TASK_INFERENCE_PATTERNS: Array<{ pattern: RegExp; taskType: TaskType }> = [
  // Market analysis
  { pattern: /market|stock|equity|bond|yield|valuation|economy|macro|fed|inflation/i, taskType: 'market-analysis' },
  { pattern: /earnings|revenue|guidance|analyst|rating|price target/i, taskType: 'market-analysis' },

  // Research
  { pattern: /research|paper|study|arxiv|citation|literature|academic/i, taskType: 'research' },
  { pattern: /analyze.*literature|review.*study|survey.*field/i, taskType: 'research' },

  // Code generation
  { pattern: /code|implement|function|class|refactor|debug|test|repo|pr|commit/i, taskType: 'code-generation' },
  { pattern: /write.*script|create.*module|fix.*bug|deploy.*service/i, taskType: 'code-generation' },

  // Infrastructure
  { pattern: /deploy|docker|kubernetes|cloud|server|infrastructure|devops|ci\/cd/i, taskType: 'infrastructure' },
  { pattern: /container|hosting|cdn|dns|ssl|certificate/i, taskType: 'infrastructure' },

  // Financial ops
  { pattern: /payment|invoice|subscription|stripe|transaction|wallet|crypto/i, taskType: 'financial-ops' },
  { pattern: /charge.*card|process.*payment|send.*money/i, taskType: 'financial-ops' },

  // Social media
  { pattern: /tweet|post|twitter|linkedin|bluesky|mastodon|social media/i, taskType: 'social-media' },
  { pattern: /email|gmail|slack|message|notify|announce/i, taskType: 'social-media' },

  // Presentation
  { pattern: /presentation|slide|deck|pptx|chart|visualization|report/i, taskType: 'presentation' },
  { pattern: /create.*slides|build.*deck|generate.*report/i, taskType: 'presentation' },

  // Content creation
  { pattern: /content|blog|article|image|video|audio|generate.*text|write.*copy/i, taskType: 'content-creation' },
  { pattern: /create.*image|design.*graphic|synthesize.*speech/i, taskType: 'content-creation' },
];

const TASK_REASONING: Record<TaskType, string> = {
  'market-analysis': 'Market analysis requires web search (brave, exa), data APIs (polygon, alphavantage), LLM analysis (openai, gemini), and persistence (memory, postgres). No image generation, deployment, or social tools needed.',
  'code-generation': 'Code generation needs repository access (github), file I/O (filesystem), LLM coding (openai, deepseek), containerization (docker), error tracking (sentry), and memory. No market data or social tools needed.',
  'research': 'Research requires academic search (arxiv, semantic-scholar), web search (brave, exa, firecrawl), computation (wolfram), semantic context (context7), LLM synthesis (openai, gemini), and memory. No deployment or payment tools needed.',
  'content-creation': 'Content creation needs LLMs (openai, gemini), image generation (stability-ai, recraft, imagegen-multi, huggingface), audio synthesis (elevenlabs), and memory. No infrastructure or payment tools needed.',
  'infrastructure': 'Infrastructure work requires repo management (github), deployment platforms (vercel, cloudflare), databases (supabase, postgres), containers (docker), cloud services (aws), and memory. No market data or content generation needed.',
  'financial-ops': 'Financial operations need payment processing (stripe), crypto (coinbase), market data (polygon, alphavantage), database persistence (postgres), and memory. No deployment or social tools needed.',
  'social-media': 'Social media requires posting platforms (twitter), messaging (slack, gmail), video (youtube), and memory. No market data, deployment, or image generation needed.',
  'presentation': 'Presentation creation needs LLM content (openai), file I/O (filesystem), image generation (stability-ai, recraft), charting (antv-charts), and memory. No deployment or payment tools needed.',
  'general': 'General tasks may require any combination of tools. No pruning applied — full action space available.',
};

export class ToolSelector {
  private serverToolMap: Map<string, string[]> = new Map();

  /**
   * Selects the appropriate tool profile for a given task type.
   * Returns a subset of MCP servers and their tools, plus reasoning.
   */
  selectForTask(taskType: TaskType, context?: string): ToolProfile {
    const servers = TASK_SERVER_MAP[taskType];

    // General tasks get all available servers (no pruning)
    if (taskType === 'general') {
      return {
        servers: [],
        tools: [],
        reasoning: TASK_REASONING[taskType],
      };
    }

    // Build tool list from server mappings
    const tools: string[] = [];
    for (const server of servers) {
      const serverTools = this.serverToolMap.get(server) || [];
      tools.push(...serverTools);
    }

    // Deduplicate tools
    const uniqueTools = Array.from(new Set(tools));

    // Enhance reasoning with context if provided
    let reasoning = TASK_REASONING[taskType];
    if (context) {
      reasoning += ` Context: ${context.slice(0, 100)}${context.length > 100 ? '...' : ''}`;
    }

    return {
      servers,
      tools: uniqueTools,
      reasoning,
    };
  }

  /**
   * Infers task type from a natural language prompt using keyword matching.
   * Fast heuristic approach — no LLM call needed.
   */
  inferTaskType(prompt: string): TaskType {
    // Try each pattern in order (specific to general)
    for (const { pattern, taskType } of TASK_INFERENCE_PATTERNS) {
      if (pattern.test(prompt)) {
        return taskType;
      }
    }

    // Default to general if no pattern matches
    return 'general';
  }

  /**
   * Registers available tools for a server.
   * Called during MCP server initialization to build the tool map.
   */
  registerServerTools(serverName: string, tools: string[]): void {
    this.serverToolMap.set(serverName, tools);
  }

  /**
   * Returns all registered servers and their tool counts.
   * Useful for observability and debugging.
   */
  getServerStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [server, tools] of this.serverToolMap.entries()) {
      stats[server] = tools.length;
    }
    return stats;
  }

  /**
   * Validates that a task type has at least one available server.
   * Returns false if the task would have no tools available.
   */
  validateTaskType(taskType: TaskType): boolean {
    if (taskType === 'general') return true;

    const servers = TASK_SERVER_MAP[taskType];
    return servers.some(server => this.serverToolMap.has(server));
  }
}

// Singleton instance
let toolSelectorInstance: ToolSelector | null = null;

/**
 * Returns the singleton ToolSelector instance.
 * Lazily initializes on first call.
 */
export function getToolSelector(): ToolSelector {
  if (!toolSelectorInstance) {
    toolSelectorInstance = new ToolSelector();
  }
  return toolSelectorInstance;
}

/**
 * Resets the singleton instance.
 * Used primarily for testing and lifecycle management.
 */
export function resetToolSelector(): void {
  toolSelectorInstance = null;
}
