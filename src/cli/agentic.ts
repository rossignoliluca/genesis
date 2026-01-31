/**
 * Genesis v14.2 - Agentic CLI Interface
 *
 * Provides Claude Code-like capabilities:
 * - File operations (read, write, edit, glob, grep)
 * - Bash command execution
 * - MCP server integration
 * - Web search/fetch
 * - Memory and context
 * - Agent orchestration
 *
 * Usage: genesis agentic [--model <model>] [--cwd <dir>]
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';

import { getLLMBridge, LLMBridge } from '../llm/index.js';
import { getMCPClient } from '../mcp/index.js';
import { getMemorySystem } from '../memory/index.js';
import { getCoordinator } from '../agents/index.js';
import {
  style, success, error, warning, info, muted,
  Spinner, box,
} from './ui.js';

// ============================================================================
// Colors (local to avoid conflict with ui.js)
// ============================================================================

const AGENTIC_COLORS = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function colorize(text: string, color: keyof typeof AGENTIC_COLORS): string {
  return `${AGENTIC_COLORS[color]}${text}${AGENTIC_COLORS.reset}`;
}

// ============================================================================
// Types
// ============================================================================

export interface AgenticConfig {
  model?: string;
  cwd?: string;
  verbose?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// ============================================================================
// Tool Definitions (Claude Code-like)
// ============================================================================

const AGENTIC_TOOLS: ToolDefinition[] = [
  {
    name: 'Read',
    description: 'Read a file from the filesystem. Returns file contents with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read' },
        offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'Write',
    description: 'Write content to a file, creating it if it does not exist.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'Edit',
    description: 'Edit a file by replacing a specific string with another.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'Exact string to find and replace' },
        new_string: { type: 'string', description: 'Replacement string' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'Glob',
    description: 'Find files matching a glob pattern (e.g., "**/*.ts").',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files' },
        path: { type: 'string', description: 'Directory to search in (default: cwd)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Grep',
    description: 'Search for a regex pattern in files. Returns matching lines.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in' },
        glob_pattern: { type: 'string', description: 'Only search files matching this glob (e.g., "*.ts")' },
        context: { type: 'number', description: 'Lines of context before/after match' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Bash',
    description: 'Execute a bash command. Use for git, npm, docker, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute' },
        cwd: { type: 'string', description: 'Working directory for the command' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'WebSearch',
    description: 'Search the web using configured search providers (Brave, Google, etc.).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'WebFetch',
    description: 'Fetch content from a URL and extract text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        prompt: { type: 'string', description: 'What to extract from the page' },
      },
      required: ['url', 'prompt'],
    },
  },
  {
    name: 'Task',
    description: 'Launch a sub-agent to handle complex tasks autonomously.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Task description for the agent' },
        agent_type: {
          type: 'string',
          description: 'Type of agent to use',
          enum: ['explorer', 'builder', 'critic', 'planner', 'researcher'],
        },
      },
      required: ['prompt', 'agent_type'],
    },
  },
  {
    name: 'Memory',
    description: 'Store or retrieve information from long-term memory. Actions: store (save/remember), search (retrieve/recall/get), list (stats).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: "store" to save, "search" to retrieve/recall, "list" for stats. Aliases: retrieve/recall/get → search, save/remember → store',
          enum: ['store', 'search', 'list', 'retrieve', 'recall', 'get', 'save', 'remember'],
        },
        content: { type: 'string', description: 'Content to store (for store) or query text (for search)' },
        query: { type: 'string', description: 'Query to search for in memories' },
        tags: { type: 'string', description: 'Comma-separated tags for categorization' },
      },
      required: ['action'],
    },
  },
];

// ============================================================================
// Simple Glob Implementation (no external dependency)
// ============================================================================

function simpleGlob(pattern: string, cwd: string): string[] {
  const results: string[] = [];

  function walk(dir: string, prefix: string = ''): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(prefix, entry.name);

        // Skip node_modules, .git, dist
        if (entry.isDirectory() && ['node_modules', '.git', 'dist'].includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath, relativePath);
        } else {
          // Simple pattern matching
          if (matchesPattern(relativePath, pattern)) {
            results.push(relativePath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  function matchesPattern(filePath: string, pat: string): boolean {
    // Convert glob to regex - order matters!
    const regexPat = pat
      .replace(/\./g, '\\.') // Escape dots FIRST (before other replacements)
      .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLESTAR>>>/g, '.*')
      .replace(/\?/g, '.');

    try {
      return new RegExp(`^${regexPat}$`).test(filePath);
    } catch {
      // Fallback to simple includes for malformed patterns
      return filePath.includes(pat.replace(/\*/g, ''));
    }
  }

  walk(cwd);
  return results.sort();
}

// ============================================================================
// Tool Executor
// ============================================================================

export class AgenticToolExecutor {
  private cwd: string;
  private mcp = getMCPClient();
  private memory = getMemorySystem();

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  async execute(tool: ToolCall): Promise<string> {
    const { name, arguments: args } = tool;

    try {
      switch (name) {
        case 'Read':
          return await this.readFile(args as { file_path: string; offset?: number; limit?: number });
        case 'Write':
          return await this.writeFile(args as { file_path: string; content: string });
        case 'Edit':
          return await this.editFile(args as { file_path: string; old_string: string; new_string: string; replace_all?: boolean });
        case 'Glob':
          return await this.globFiles(args as { pattern: string; path?: string });
        case 'Grep':
          return await this.grepFiles(args as { pattern: string; path?: string; glob_pattern?: string; context?: number });
        case 'Bash':
          return await this.executeBash(args as { command: string; cwd?: string; timeout?: number });
        case 'WebSearch':
          return await this.webSearch(args as { query: string; num_results?: number });
        case 'WebFetch':
          return await this.webFetch(args as { url: string; prompt: string });
        case 'Task':
          return await this.launchTask(args as { prompt: string; agent_type: string });
        case 'Memory':
          return await this.handleMemory(args as { action: string; content?: string; query?: string; tags?: string });
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err) {
      return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Read file with line numbers
  private async readFile(args: { file_path?: string; path?: string; offset?: number; limit?: number }): Promise<string> {
    // Accept both file_path and path for flexibility
    const inputPath = args.file_path || args.path;
    if (!inputPath) {
      return 'Error: file_path is required';
    }
    const filePath = path.isAbsolute(inputPath) ? inputPath : path.join(this.cwd, inputPath);

    if (!fs.existsSync(filePath)) {
      return `File not found: ${filePath}`;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const offset = args.offset || 1;
    const limit = args.limit || lines.length;
    const startIdx = Math.max(0, offset - 1);
    const endIdx = Math.min(lines.length, startIdx + limit);

    const result = lines.slice(startIdx, endIdx).map((line, i) => {
      const lineNum = startIdx + i + 1;
      const padding = String(endIdx).length;
      return `${String(lineNum).padStart(padding)}→${line}`;
    }).join('\n');

    return result || '(empty file)';
  }

  // Write file
  private async writeFile(args: { file_path?: string; path?: string; content: string }): Promise<string> {
    const inputPath = args.file_path || args.path;
    if (!inputPath) {
      return 'Error: file_path is required';
    }
    const filePath = path.isAbsolute(inputPath) ? inputPath : path.join(this.cwd, inputPath);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, args.content, 'utf-8');
    return `Successfully wrote ${args.content.length} bytes to ${filePath}`;
  }

  // Edit file with string replacement
  private async editFile(args: { file_path?: string; path?: string; old_string: string; new_string: string; replace_all?: boolean }): Promise<string> {
    const inputPath = args.file_path || args.path;
    if (!inputPath) {
      return 'Error: file_path is required';
    }
    const filePath = path.isAbsolute(inputPath) ? inputPath : path.join(this.cwd, inputPath);

    if (!fs.existsSync(filePath)) {
      return `File not found: ${filePath}`;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    if (!content.includes(args.old_string)) {
      return `String not found in file: "${args.old_string.slice(0, 50)}..."`;
    }

    const count = (content.match(new RegExp(args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    let newContent: string;
    if (args.replace_all) {
      newContent = content.split(args.old_string).join(args.new_string);
    } else {
      newContent = content.replace(args.old_string, args.new_string);
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');

    return args.replace_all
      ? `Replaced ${count} occurrences in ${filePath}`
      : `Replaced 1 occurrence in ${filePath}`;
  }

  // Glob file matching
  private async globFiles(args: { pattern: string; path?: string }): Promise<string> {
    const searchPath = args.path ? (path.isAbsolute(args.path) ? args.path : path.join(this.cwd, args.path)) : this.cwd;

    const files = simpleGlob(args.pattern, searchPath);

    if (files.length === 0) {
      return 'No files found matching pattern';
    }

    return files.slice(0, 100).join('\n') + (files.length > 100 ? `\n... and ${files.length - 100} more` : '');
  }

  // Grep search
  private async grepFiles(args: { pattern: string; path?: string; glob_pattern?: string; context?: number }): Promise<string> {
    const searchPath = args.path || this.cwd;
    const context = args.context || 0;

    // Use ripgrep if available, fallback to grep
    const cmd = args.glob_pattern
      ? `rg -n ${context > 0 ? `-C ${context}` : ''} --glob "${args.glob_pattern}" "${args.pattern}" "${searchPath}" 2>/dev/null || grep -rn ${context > 0 ? `-C ${context}` : ''} --include="${args.glob_pattern}" "${args.pattern}" "${searchPath}" 2>/dev/null`
      : `rg -n ${context > 0 ? `-C ${context}` : ''} "${args.pattern}" "${searchPath}" 2>/dev/null || grep -rn ${context > 0 ? `-C ${context}` : ''} "${args.pattern}" "${searchPath}" 2>/dev/null`;

    try {
      const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
      const lines = result.split('\n');
      return lines.slice(0, 200).join('\n') + (lines.length > 200 ? `\n... and ${lines.length - 200} more matches` : '');
    } catch {
      return 'No matches found';
    }
  }

  // Bash command execution
  private async executeBash(args: { command: string; cwd?: string; timeout?: number }): Promise<string> {
    const cwd = args.cwd || this.cwd;
    const timeout = args.timeout || 120000;

    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', args.command], {
        cwd,
        timeout,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim() || '(no output)');
        } else {
          resolve(`Exit code ${code}\n${stderr || stdout}`);
        }
      });

      proc.on('error', (err) => {
        resolve(`Error: ${err.message}`);
      });
    });
  }

  // Web search via MCP
  private async webSearch(args: { query: string; num_results?: number }): Promise<string> {
    try {
      // Try Brave search first, then Gemini, then Exa
      const providers = ['brave-search.brave_web_search', 'gemini.web_search', 'exa.web_search_exa'];

      for (const provider of providers) {
        const [server, tool] = provider.split('.');
        try {
          const result = await this.mcp.call(server as any, tool, {
            query: args.query,
            count: args.num_results || 5,
          });

          if (result.success && result.data) {
            return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
          }
        } catch {
          continue;
        }
      }

      return 'Web search not available - no search MCP servers configured';
    } catch (err) {
      return `Web search error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Web fetch via MCP (firecrawl)
  private async webFetch(args: { url: string; prompt: string }): Promise<string> {
    try {
      const result = await this.mcp.call('firecrawl' as any, 'firecrawl_scrape', {
        url: args.url,
        formats: ['markdown'],
      });

      if (result.success && result.data) {
        const content = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        return content.slice(0, 10000) + (content.length > 10000 ? '\n... (truncated)' : '');
      }

      return 'Failed to fetch URL';
    } catch (err) {
      return `Fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Launch sub-agent task
  private async launchTask(args: { prompt: string; agent_type: string }): Promise<string> {
    const coordinator = getCoordinator();

    try {
      const task = await coordinator.coordinate({
        query: args.prompt,
        agents: [args.agent_type as any],
        pattern: 'sequential',
      });

      if (task.finalResult) {
        return typeof task.finalResult === 'string' ? task.finalResult : JSON.stringify(task.finalResult, null, 2);
      }

      return `Task completed with status: ${task.status}`;
    } catch (err) {
      return `Task error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Memory operations
  private async handleMemory(args: { action: string; content?: string; query?: string; tags?: string }): Promise<string> {
    const memory = this.memory;

    // Normalize action - support common aliases
    const normalizedAction = (() => {
      const action = args.action?.toLowerCase() || '';
      if (['store', 'save', 'remember', 'add', 'write'].includes(action)) return 'store';
      if (['search', 'query', 'find', 'retrieve', 'recall', 'get', 'read', 'load', 'fetch'].includes(action)) return 'search';
      if (['list', 'stats', 'status', 'info'].includes(action)) return 'list';
      return action;
    })();

    switch (normalizedAction) {
      case 'store':
        if (!args.content) return 'Missing content to store';
        // Use remember for simple episodic storage
        memory.remember({
          what: args.content,
          tags: args.tags?.split(',').map(t => t.trim()) || [],
        });
        return 'Stored in memory';

      case 'search':
        // If no query but has content, use content as query
        const searchQuery = args.query || args.content;
        if (!searchQuery) return 'Missing search query';
        const results = await memory.recall(searchQuery, { limit: 5 });
        if (!results || results.length === 0) {
          return 'No memories found matching query';
        }
        return results.map((r: any, i: number) => {
          const text = typeof r === 'string' ? r : (r.content || r.text || JSON.stringify(r));
          return `${i + 1}. ${text.slice(0, 200)}...`;
        }).join('\n\n');

      case 'list':
        const stats = memory.getStats();
        return `Memory stats: ${JSON.stringify(stats, null, 2)}`;

      default:
        return `Unknown memory action: ${args.action}. Valid actions: store, search, list (or aliases: save, retrieve, recall, get, etc.)`;
    }
  }
}

// ============================================================================
// Agentic Chat Loop
// ============================================================================

export class AgenticChat {
  private config: AgenticConfig;
  private llm: LLMBridge;
  private executor: AgenticToolExecutor;
  private conversationHistory: string[] = [];
  private rl: readline.Interface | null = null;

  constructor(config: AgenticConfig = {}) {
    this.config = {
      cwd: process.cwd(),
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      temperature: 0.7,
      ...config,
    };

    this.llm = getLLMBridge();
    this.executor = new AgenticToolExecutor(this.config.cwd!);
  }

  async start(): Promise<void> {
    this.showWelcome();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(muted(`Working directory: ${this.config.cwd}`));
    console.log(muted(`Model: ${this.config.model}`));
    console.log(muted('Type /help for commands, /quit to exit\n'));

    await this.chatLoop();
  }

  private showWelcome(): void {
    console.log('\n' + box(
      `${colorize('Genesis Agentic Interface', 'cyan')}

${muted('Claude Code-like capabilities:')}
 ${colorize('•', 'green')} Read/Write/Edit files
 ${colorize('•', 'green')} Bash command execution
 ${colorize('•', 'green')} Web search and fetch
 ${colorize('•', 'green')} Agent task delegation
 ${colorize('•', 'green')} Persistent memory`,
      { padding: 1 }
    ));
  }

  private buildSystemPrompt(): string {
    return `You are Genesis, an autonomous AI agent with full agentic capabilities.

You have access to these tools:
${AGENTIC_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Current working directory: ${this.config.cwd}
Current date: ${new Date().toISOString().split('T')[0]}

Guidelines:
1. Use tools proactively to accomplish tasks
2. Read files before editing them
3. Use Glob/Grep to explore codebases
4. Execute bash commands for git, npm, etc.
5. Break complex tasks into steps
6. Store important information in memory

When you need to use a tool, respond with a JSON tool call in this format:
\`\`\`tool
{"name": "ToolName", "arguments": {...}}
\`\`\`

You can make multiple tool calls in sequence. After each tool result, continue your work.`;
  }

  private async chatLoop(): Promise<void> {
    return new Promise((resolve) => {
      const askQuestion = (): void => {
        if (!this.rl) {
          resolve();
          return;
        }

        this.rl.question(colorize('\n❯ ', 'cyan'), async (input) => {
          if (!input.trim()) {
            askQuestion();
            return;
          }

          // Handle commands
          if (input.startsWith('/')) {
            const handled = await this.handleCommand(input);
            if (handled === 'quit') {
              resolve();
              return;
            }
            askQuestion();
            return;
          }

          // Process user message
          await this.processUserMessage(input);
          askQuestion();
        });
      };

      // Handle readline close event (e.g., Ctrl+D)
      this.rl!.on('close', () => {
        console.log(muted('\nGoodbye!'));
        resolve();
      });

      askQuestion();
    });
  }

  private async handleCommand(input: string): Promise<string | void> {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd) {
      case 'quit':
      case 'exit':
      case 'q':
        console.log(muted('\nGoodbye!'));
        this.rl?.close();
        return 'quit';

      case 'help':
        console.log(`
${colorize('Commands:', 'cyan')}
  /help     - Show this help
  /clear    - Clear conversation
  /tools    - List available tools
  /memory   - Show memory stats
  /cwd      - Change working directory
  /quit     - Exit
`);
        break;

      case 'clear':
        this.conversationHistory = [];
        console.log(success('Conversation cleared'));
        break;

      case 'tools':
        console.log(`\n${colorize('Available Tools:', 'cyan')}\n`);
        AGENTIC_TOOLS.forEach(t => {
          console.log(`  ${colorize(t.name, 'green')}: ${muted(t.description)}`);
        });
        break;

      case 'memory':
        const result = await this.executor.execute({
          id: 'cmd',
          name: 'Memory',
          arguments: { action: 'list' },
        });
        console.log(result);
        break;

      case 'cwd':
        if (args[0]) {
          const newCwd = path.resolve(this.config.cwd!, args[0]);
          if (fs.existsSync(newCwd)) {
            this.config.cwd = newCwd;
            this.executor = new AgenticToolExecutor(newCwd);
            console.log(success(`Working directory: ${newCwd}`));
          } else {
            console.log(error(`Directory not found: ${newCwd}`));
          }
        } else {
          console.log(info(`Current: ${this.config.cwd}`));
        }
        break;

      default:
        console.log(warning(`Unknown command: ${cmd}`));
    }
  }

  private async processUserMessage(input: string): Promise<void> {
    // Build full context
    const systemPrompt = this.buildSystemPrompt();
    const contextMessages = this.conversationHistory.join('\n\n');
    const fullPrompt = contextMessages ? `${contextMessages}\n\nUser: ${input}` : input;

    this.conversationHistory.push(`User: ${input}`);

    const spinner = new Spinner('Thinking...');
    spinner.start();

    try {
      let continueLoop = true;
      let iterations = 0;
      const maxIterations = 20;
      let currentPrompt = fullPrompt;

      while (continueLoop && iterations < maxIterations) {
        iterations++;

        // Call LLM using chat method
        const response = await this.llm.chat(currentPrompt, systemPrompt);

        spinner.stop();

        const content = response.content || '';

        // Check for tool calls
        const toolMatch = content.match(/```tool\s*\n([\s\S]*?)\n```/);

        if (toolMatch) {
          try {
            const rawJson = toolMatch[1].trim();
            const toolCall = JSON.parse(rawJson) as { name: string; arguments?: Record<string, unknown> };

            // Ensure arguments exists
            if (!toolCall.arguments) {
              toolCall.arguments = {};
            }

            console.log(muted(`\n  ⚙ ${toolCall.name}...`));
            // Debug: show what arguments were parsed
            if (Object.keys(toolCall.arguments).length === 0) {
              console.log(muted(`  ⚠ No arguments parsed. Raw JSON: ${rawJson.slice(0, 200)}`));
            }

            const result = await this.executor.execute({
              id: `tool-${Date.now()}`,
              name: toolCall.name,
              arguments: toolCall.arguments,
            });

            // Show tool result
            const resultPreview = result.length > 500 ? result.slice(0, 500) + '...' : result;
            console.log(muted(`  ✓ ${resultPreview.split('\n')[0]}`));

            // Add to conversation history
            this.conversationHistory.push(`Assistant: ${content}`);
            this.conversationHistory.push(`Tool (${toolCall.name}): ${result}`);

            // Continue with tool result
            currentPrompt = `Tool result for ${toolCall.name}:\n\`\`\`\n${result}\n\`\`\`\n\nContinue with your task.`;

            spinner.start();
          } catch {
            // Not a valid tool call, treat as regular response
            this.conversationHistory.push(`Assistant: ${content}`);
            console.log('\n' + this.formatResponse(content));
            continueLoop = false;
          }
        } else {
          // Regular response without tool call
          this.conversationHistory.push(`Assistant: ${content}`);
          console.log('\n' + this.formatResponse(content));
          continueLoop = false;
        }
      }

      if (iterations >= maxIterations) {
        console.log(warning('\n(Reached maximum iterations)'));
      }
    } catch (err) {
      spinner.stop();
      console.log(error(`\nError: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  private formatResponse(content: string): string {
    // Remove tool blocks from display
    return content.replace(/```tool\s*\n[\s\S]*?\n```/g, '').trim();
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function runAgenticChat(args: string[]): Promise<void> {
  const config: AgenticConfig = {
    cwd: process.cwd(),
    model: 'claude-sonnet-4-20250514',
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      config.model = args[++i];
    } else if (args[i] === '--cwd' && args[i + 1]) {
      config.cwd = path.resolve(args[++i]);
    } else if (args[i] === '--verbose') {
      config.verbose = true;
    }
  }

  const chat = new AgenticChat(config);
  await chat.start();
}
