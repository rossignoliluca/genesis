/**
 * Genesis 6.0 - Interactive REPL
 *
 * Full-featured REPL with:
 * - Tool dispatching and execution
 * - History persistence
 * - Progress indicators
 * - Syntax highlighting
 * - Tab completion
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { getLLMBridge, GENESIS_SYSTEM_PROMPT, LLMBridge } from '../llm/index.js';
import { getStateStore, StateStore } from '../persistence/index.js';
import {
  ToolDispatcher,
  getDispatcher,
  ToolResult,
  DispatchResult,
  ProgressStatus,
} from './dispatcher.js';
import { toolRegistry } from '../tools/index.js';

// ============================================================================
// Colors & Formatting
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

function c(text: string, ...styles: (keyof typeof colors)[]): string {
  const codes = styles.map(s => colors[s]).join('');
  return `${codes}${text}${colors.reset}`;
}

// Spinner frames
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ============================================================================
// Interactive Session Config
// ============================================================================

export interface InteractiveConfig {
  provider?: 'ollama' | 'openai' | 'anthropic';
  model?: string;
  verbose?: boolean;
  workingDirectory?: string;
  historyFile?: string;
  maxHistorySize?: number;
  enableTools?: boolean;
  autoExecuteTools?: boolean;
}

const DEFAULT_CONFIG: InteractiveConfig = {
  verbose: false,
  workingDirectory: process.cwd(),
  historyFile: path.join(process.env.HOME || '/tmp', '.genesis_history'),
  maxHistorySize: 1000,
  enableTools: true,
  autoExecuteTools: true,
};

// ============================================================================
// Interactive Session
// ============================================================================

export class InteractiveSession {
  private config: InteractiveConfig;
  private llm: LLMBridge;
  private store: StateStore;
  private dispatcher: ToolDispatcher;
  private rl: readline.Interface | null = null;
  private running = false;
  private inputHistory: string[] = [];
  private historyIndex = -1;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private currentSpinnerFrame = 0;

  constructor(config?: Partial<InteractiveConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.llm = getLLMBridge({
      provider: this.config.provider,
      model: this.config.model,
    });

    this.store = getStateStore({
      autoSave: true,
      autoSaveIntervalMs: 60000,
    });

    this.dispatcher = getDispatcher({
      verbose: this.config.verbose,
      onProgress: (status) => this.showProgress(status),
    });

    // Load input history
    this.loadInputHistory();

    // Restore conversation
    const state = this.store.getState();
    if (state.conversation.history.length > 0) {
      for (const msg of state.conversation.history) {
        this.llm.getHistory().push(msg);
      }
    }
  }

  /**
   * Start interactive session
   */
  async start(): Promise<void> {
    this.printBanner();
    this.printStatus();
    this.printHelp();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      completer: (line: string) => this.completer(line),
    });

    // Handle special keys
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
    }

    this.running = true;
    await this.mainLoop();
  }

  /**
   * Main REPL loop
   */
  private async mainLoop(): Promise<void> {
    while (this.running && this.rl) {
      try {
        const input = await this.prompt();

        if (!input) continue;

        // Save to history
        this.addToHistory(input);

        // Handle commands
        if (input.startsWith('/')) {
          await this.handleCommand(input);
          continue;
        }

        // Process input
        await this.processInput(input);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
          break; // readline closed
        }
        console.error(c(`Error: ${error}`, 'red'));
      }
    }
  }

  /**
   * Prompt for input
   */
  private prompt(): Promise<string> {
    return new Promise((resolve, reject) => {
      const promptStr = c('genesis', 'cyan') + c('> ', 'bold');

      this.rl?.question(promptStr, (answer) => {
        resolve(answer?.trim() || '');
      });

      this.rl?.on('close', () => reject(new Error('readline closed')));
    });
  }

  /**
   * Process user input
   */
  private async processInput(input: string): Promise<void> {
    // Check LLM status
    if (!this.llm.isConfigured()) {
      console.log(c('Error: LLM not configured. Set API key first.', 'red'));
      console.log(c('  export OPENAI_API_KEY=sk-...', 'dim'));
      console.log();
      return;
    }

    // Start thinking spinner
    this.startSpinner('Thinking');

    try {
      // Send to LLM
      const response = await this.llm.chat(input);

      this.stopSpinner();

      // Check for tool calls
      if (this.config.enableTools) {
        const toolCalls = this.dispatcher.parseToolCalls(response.content);

        if (toolCalls.length > 0) {
          console.log(c(`\n📦 ${toolCalls.length} tool call(s) detected`, 'yellow'));

          if (this.config.autoExecuteTools) {
            const dispatchResult = await this.executeTools(toolCalls);
            await this.handleToolResults(dispatchResult, input);
          } else {
            // Ask for confirmation
            console.log(c('Tools:', 'dim'));
            for (const call of toolCalls) {
              console.log(c(`  - ${call.name}`, 'cyan'));
            }
            const confirm = await this.confirm('Execute these tools?');
            if (confirm) {
              const dispatchResult = await this.executeTools(toolCalls);
              await this.handleToolResults(dispatchResult, input);
            }
          }
          return;
        }
      }

      // Print response
      this.printResponse(response.content);

      if (this.config.verbose) {
        console.log(c(`  [${response.latency}ms, ${response.usage?.outputTokens || '?'} tokens]`, 'dim'));
      }

      // Persist
      this.store.updateConversation(this.llm.getHistory(), response.usage?.outputTokens);
      this.store.recordInteraction();

    } catch (error) {
      this.stopSpinner();
      const msg = error instanceof Error ? error.message : String(error);
      console.log(c(`\nError: ${msg}`, 'red'));
    }

    console.log();
  }

  /**
   * Execute tool calls
   */
  private async executeTools(toolCalls: any[]): Promise<DispatchResult> {
    this.startSpinner('Executing tools');
    const result = await this.dispatcher.dispatch(toolCalls);
    this.stopSpinner();
    return result;
  }

  /**
   * Handle tool results
   */
  private async handleToolResults(result: DispatchResult, originalInput: string): Promise<void> {
    // Print results
    console.log();
    console.log(c('Tool Results:', 'bold'));

    for (const r of result.results) {
      const status = r.success ? c('✓', 'green') : c('✗', 'red');
      console.log(`  ${status} ${c(r.name, 'cyan')} (${r.duration}ms)`);

      if (!r.success && r.error) {
        console.log(c(`    Error: ${r.error}`, 'red'));
      } else if (this.config.verbose && r.data) {
        const preview = this.formatDataPreview(r.data);
        console.log(c(`    ${preview}`, 'dim'));
      }
    }

    console.log(c(`\nTotal: ${result.totalDuration}ms`, 'dim'));

    // Feed results back to LLM for summary
    const resultsContext = this.dispatcher.formatResultsForLLM(result.results);

    this.startSpinner('Summarizing results');

    try {
      const summary = await this.llm.chat(
        `Based on these tool results, provide a brief summary for the user:\n\n${resultsContext}\n\nOriginal request: ${originalInput}`
      );

      this.stopSpinner();
      console.log();
      this.printResponse(summary.content);

      // Persist
      this.store.updateConversation(this.llm.getHistory(), summary.usage?.outputTokens);
    } catch (error) {
      this.stopSpinner();
      console.log(c('\nCould not summarize results.', 'yellow'));
    }
  }

  /**
   * Format data preview
   */
  private formatDataPreview(data: unknown, maxLength = 100): string {
    if (typeof data === 'string') {
      return data.length > maxLength ? data.substring(0, maxLength) + '...' : data;
    }
    const json = JSON.stringify(data);
    return json.length > maxLength ? json.substring(0, maxLength) + '...' : json;
  }

  /**
   * Handle slash commands
   */
  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...args] = input.slice(1).split(' ');
    const arg = args.join(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
      case 'h':
        this.printHelp();
        break;

      case 'clear':
      case 'c':
        this.llm.clearHistory();
        console.log(c('Conversation cleared.', 'yellow'));
        break;

      case 'status':
      case 's':
        this.printStatus();
        break;

      case 'tools':
      case 't':
        this.printTools();
        break;

      case 'run':
      case 'r':
        if (!arg) {
          console.log(c('Usage: /run <tool_name> <params...>', 'yellow'));
        } else {
          await this.runToolDirect(arg);
        }
        break;

      case 'bash':
      case '!':
        if (!arg) {
          console.log(c('Usage: /bash <command> or !<command>', 'yellow'));
        } else {
          await this.runBash(arg);
        }
        break;

      case 'edit':
        if (!arg) {
          console.log(c('Usage: /edit <file>', 'yellow'));
        } else {
          await this.editFile(arg);
        }
        break;

      case 'cd':
        this.changeDirectory(arg);
        break;

      case 'pwd':
        console.log(c(this.config.workingDirectory || process.cwd(), 'cyan'));
        break;

      case 'ls':
        await this.listFiles(arg);
        break;

      case 'verbose':
      case 'v':
        this.config.verbose = !this.config.verbose;
        console.log(c(`Verbose: ${this.config.verbose ? 'ON' : 'OFF'}`, 'yellow'));
        break;

      case 'history':
        this.printInputHistory();
        break;

      case 'save':
        await this.store.save();
        this.saveInputHistory();
        console.log(c('State saved.', 'green'));
        break;

      case 'quit':
      case 'exit':
      case 'q':
        this.stop();
        break;

      default:
        // Check if it's a shorthand bash command
        if (cmd.startsWith('!')) {
          await this.runBash(cmd.slice(1) + ' ' + arg);
        } else {
          console.log(c(`Unknown command: /${cmd}`, 'red'));
          console.log('Type /help for available commands.');
        }
    }

    console.log();
  }

  /**
   * Run a tool directly
   */
  private async runToolDirect(input: string): Promise<void> {
    const parts = input.split(' ');
    const toolName = parts[0];
    const paramsStr = parts.slice(1).join(' ');

    let params: Record<string, unknown> = {};
    try {
      if (paramsStr.startsWith('{')) {
        params = JSON.parse(paramsStr);
      } else if (paramsStr) {
        // Simple key=value parsing
        for (const part of paramsStr.split(' ')) {
          const [key, ...vals] = part.split('=');
          if (key && vals.length) {
            params[key] = vals.join('=');
          }
        }
      }
    } catch {
      // Use as single 'input' param
      if (paramsStr) {
        params.input = paramsStr;
      }
    }

    const tool = toolRegistry.get(toolName);
    if (!tool) {
      console.log(c(`Tool not found: ${toolName}`, 'red'));
      return;
    }

    this.startSpinner(`Running ${toolName}`);

    try {
      const result = await tool.execute(params);
      this.stopSpinner();
      console.log(c(`✓ ${toolName} completed`, 'green'));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      this.stopSpinner();
      console.log(c(`✗ ${toolName} failed: ${error}`, 'red'));
    }
  }

  /**
   * Run bash command
   */
  private async runBash(command: string): Promise<void> {
    const bashTool = toolRegistry.get('bash');
    if (!bashTool) {
      console.log(c('Bash tool not available.', 'red'));
      return;
    }

    this.startSpinner('Running');

    try {
      const result = await bashTool.execute({
        command,
        cwd: this.config.workingDirectory,
      }) as { success: boolean; stdout?: string; stderr?: string; error?: string };

      this.stopSpinner();

      if (result.stdout) {
        console.log(result.stdout);
      }
      if (result.stderr) {
        console.log(c(result.stderr, 'yellow'));
      }
      if (!result.success) {
        console.log(c(`Exit with error: ${result.error}`, 'red'));
      }
    } catch (error) {
      this.stopSpinner();
      console.log(c(`Error: ${error}`, 'red'));
    }
  }

  /**
   * Edit file (open in $EDITOR or print content)
   */
  private async editFile(filePath: string): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.config.workingDirectory || process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
      console.log(c(`File not found: ${fullPath}`, 'red'));
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    console.log(c(`File: ${fullPath} (${lines.length} lines)`, 'cyan'));
    console.log(c('─'.repeat(60), 'dim'));

    // Print with line numbers
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const lineNum = String(i + 1).padStart(4, ' ');
      console.log(c(lineNum, 'dim') + ' ' + lines[i]);
    }

    if (lines.length > 50) {
      console.log(c(`... and ${lines.length - 50} more lines`, 'dim'));
    }

    console.log(c('─'.repeat(60), 'dim'));
  }

  /**
   * Change directory
   */
  private changeDirectory(dir: string): void {
    if (!dir) {
      console.log(c(this.config.workingDirectory || process.cwd(), 'cyan'));
      return;
    }

    const newDir = path.isAbsolute(dir)
      ? dir
      : path.join(this.config.workingDirectory || process.cwd(), dir);

    if (!fs.existsSync(newDir)) {
      console.log(c(`Directory not found: ${newDir}`, 'red'));
      return;
    }

    this.config.workingDirectory = newDir;
    console.log(c(`Changed to: ${newDir}`, 'green'));
  }

  /**
   * List files
   */
  private async listFiles(dir: string): Promise<void> {
    const targetDir = dir
      ? path.isAbsolute(dir)
        ? dir
        : path.join(this.config.workingDirectory || process.cwd(), dir)
      : this.config.workingDirectory || process.cwd();

    if (!fs.existsSync(targetDir)) {
      console.log(c(`Directory not found: ${targetDir}`, 'red'));
      return;
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        console.log(c(entry.name + '/', 'blue', 'bold'));
      } else {
        console.log(entry.name);
      }
    }
  }

  /**
   * Tab completion
   */
  private completer(line: string): [string[], string] {
    const completions: string[] = [];

    // Command completion
    if (line.startsWith('/')) {
      const commands = [
        '/help', '/clear', '/status', '/tools', '/run', '/bash',
        '/edit', '/cd', '/pwd', '/ls', '/verbose', '/history',
        '/save', '/quit'
      ];
      const matches = commands.filter(c => c.startsWith(line));
      return [matches, line];
    }

    // File path completion
    if (line.includes('/') || line.includes('.')) {
      try {
        const dir = path.dirname(line) || '.';
        const prefix = path.basename(line);
        const basePath = path.isAbsolute(dir)
          ? dir
          : path.join(this.config.workingDirectory || process.cwd(), dir);

        if (fs.existsSync(basePath)) {
          const entries = fs.readdirSync(basePath);
          const matches = entries
            .filter(e => e.startsWith(prefix))
            .map(e => path.join(dir, e));
          return [matches, line];
        }
      } catch {
        // Ignore errors
      }
    }

    return [completions, line];
  }

  /**
   * Confirm prompt
   */
  private confirm(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl?.question(c(`${question} [y/N] `, 'yellow'), (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  /**
   * Start spinner
   */
  private startSpinner(message: string): void {
    this.currentSpinnerFrame = 0;
    process.stdout.write(`${SPINNER[0]} ${c(message + '...', 'dim')}`);

    this.spinnerInterval = setInterval(() => {
      this.currentSpinnerFrame = (this.currentSpinnerFrame + 1) % SPINNER.length;
      process.stdout.write(`\r${SPINNER[this.currentSpinnerFrame]} ${c(message + '...', 'dim')}`);
    }, 80);
  }

  /**
   * Stop spinner
   */
  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
    process.stdout.write('\r\x1b[K'); // Clear line
  }

  /**
   * Show progress
   */
  private showProgress(status: ProgressStatus): void {
    if (!this.config.verbose) return;

    const pct = Math.round((status.current / status.total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));

    process.stdout.write(`\r  [${bar}] ${pct}% ${status.message || ''}`);

    if (status.phase === 'complete') {
      console.log();
    }
  }

  /**
   * Print response with formatting
   */
  private printResponse(content: string): void {
    // Basic syntax highlighting for code blocks
    const formatted = content.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (_, lang, code) => {
        return c(`\`\`\`${lang || ''}\n`, 'dim') +
               c(code, 'cyan') +
               c('```', 'dim');
      }
    );

    console.log(c('Genesis: ', 'green', 'bold') + formatted);
  }

  /**
   * Print banner
   */
  private printBanner(): void {
    console.log(`
${c('╔════════════════════════════════════════════════════════════════╗', 'cyan')}
${c('║', 'cyan')}  ${c('GENESIS', 'bold', 'white')} ${c('Interactive Shell', 'dim')}                              ${c('║', 'cyan')}
${c('║', 'cyan')}  ${c('Tools: bash, edit, git, mcp | Type /help for commands', 'dim')}      ${c('║', 'cyan')}
${c('╚════════════════════════════════════════════════════════════════╝', 'cyan')}
`);
  }

  /**
   * Print status
   */
  private printStatus(): void {
    const llmStatus = this.llm.status();
    const tools = this.dispatcher.listTools();

    console.log(c('Status:', 'bold'));
    console.log(`  LLM:      ${llmStatus.configured ? c(llmStatus.provider, 'green') : c('Not configured', 'red')}`);
    console.log(`  Model:    ${c(llmStatus.model, 'dim')}`);
    console.log(`  Tools:    ${c(String(tools.local.length), 'cyan')} local, ${c(String(Object.keys(tools.mcp).length), 'cyan')} MCP servers`);
    console.log(`  Dir:      ${c(this.config.workingDirectory || process.cwd(), 'dim')}`);
    console.log();
  }

  /**
   * Print help
   */
  private printHelp(): void {
    console.log(c('Commands:', 'bold'));
    console.log('  /help, /h       Show this help');
    console.log('  /status, /s     Show status');
    console.log('  /tools, /t      List available tools');
    console.log('  /run <tool>     Run a tool directly');
    console.log('  /bash <cmd>     Run bash command');
    console.log('  /edit <file>    View file');
    console.log('  /cd <dir>       Change directory');
    console.log('  /ls [dir]       List files');
    console.log('  /clear, /c      Clear conversation');
    console.log('  /verbose, /v    Toggle verbose mode');
    console.log('  /save           Save state');
    console.log('  /quit, /q       Exit');
    console.log();
    console.log(c('Tips:', 'dim'));
    console.log(c('  - Just type naturally to chat with Genesis', 'dim'));
    console.log(c('  - Genesis will automatically use tools when needed', 'dim'));
    console.log(c('  - Use !<command> as shorthand for /bash <command>', 'dim'));
    console.log();
  }

  /**
   * Print tools
   */
  private printTools(): void {
    const tools = this.dispatcher.listTools();

    console.log(c('Local Tools:', 'bold'));
    for (const name of tools.local) {
      console.log(`  ${c(name, 'cyan')}`);
    }

    console.log();
    console.log(c('MCP Tools:', 'bold'));
    for (const [server, serverTools] of Object.entries(tools.mcp)) {
      console.log(`  ${c(server, 'magenta')}: ${serverTools.join(', ')}`);
    }
  }

  /**
   * Input history management
   */
  private loadInputHistory(): void {
    if (!this.config.historyFile) return;

    try {
      if (fs.existsSync(this.config.historyFile)) {
        const content = fs.readFileSync(this.config.historyFile, 'utf-8');
        this.inputHistory = content.split('\n').filter(l => l.trim());
      }
    } catch {
      // Ignore errors
    }
  }

  private saveInputHistory(): void {
    if (!this.config.historyFile) return;

    try {
      const content = this.inputHistory.slice(-this.config.maxHistorySize!).join('\n');
      fs.writeFileSync(this.config.historyFile, content);
    } catch {
      // Ignore errors
    }
  }

  private addToHistory(input: string): void {
    if (input && input !== this.inputHistory[this.inputHistory.length - 1]) {
      this.inputHistory.push(input);
    }
    this.historyIndex = -1;
  }

  private printInputHistory(): void {
    console.log(c('Input History:', 'bold'));
    const recent = this.inputHistory.slice(-20);
    for (let i = 0; i < recent.length; i++) {
      console.log(c(`  ${i + 1}. `, 'dim') + recent[i]);
    }
  }

  /**
   * Stop session
   */
  stop(): void {
    this.running = false;
    this.stopSpinner();

    // Save state
    console.log(c('\nSaving...', 'dim'));
    this.store.updateConversation(this.llm.getHistory());
    this.store.close();
    this.saveInputHistory();

    console.log(c('Goodbye!\n', 'cyan'));
    this.rl?.close();
    process.exit(0);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createInteractiveSession(config?: Partial<InteractiveConfig>): InteractiveSession {
  return new InteractiveSession(config);
}

/**
 * Start interactive session (convenience function)
 */
export async function startInteractive(config?: Partial<InteractiveConfig>): Promise<void> {
  const session = createInteractiveSession(config);
  await session.start();
}
