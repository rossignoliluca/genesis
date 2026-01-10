/**
 * Genesis 6.0 - Interactive Chat CLI
 *
 * REPL interface to talk to Genesis using readline.
 * No external dependencies.
 */

import * as readline from 'readline';
import { getLLMBridge, GENESIS_SYSTEM_PROMPT, LLMBridge } from '../llm/index.js';
import { getStateStore, StateStore } from '../persistence/index.js';

// ============================================================================
// Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function c(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// Chat Session
// ============================================================================

export interface ChatOptions {
  provider?: 'ollama' | 'openai' | 'anthropic';
  model?: string;
  verbose?: boolean;
}

export class ChatSession {
  private llm: LLMBridge;
  private store: StateStore;
  private rl: readline.Interface | null = null;
  private running = false;
  private verbose: boolean;
  private messageCount = 0;

  constructor(options: ChatOptions = {}) {
    this.llm = getLLMBridge({
      provider: options.provider,
      model: options.model,
    });
    this.store = getStateStore({ autoSave: true, autoSaveIntervalMs: 60000 });
    this.verbose = options.verbose ?? false;

    // Restore conversation history from persisted state
    const state = this.store.getState();
    if (state.conversation.history.length > 0) {
      for (const msg of state.conversation.history) {
        this.llm.getHistory().push(msg);
      }
    }
  }

  /**
   * Start interactive chat session
   */
  async start(): Promise<void> {
    this.printBanner();

    // Check if LLM is configured
    if (!this.llm.isConfigured()) {
      console.log(c('\nWarning: No API key found!', 'yellow'));
      console.log('Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.\n');
      console.log('Example:');
      console.log(c('  export OPENAI_API_KEY=sk-...', 'dim'));
      console.log(c('  export ANTHROPIC_API_KEY=sk-ant-...', 'dim'));
      console.log();
    }

    const status = this.llm.status();
    console.log(c(`Provider: ${status.provider}`, 'dim'));
    console.log(c(`Model: ${status.model}`, 'dim'));
    console.log(c(`Status: ${status.configured ? 'Ready' : 'Not configured'}`, status.configured ? 'green' : 'yellow'));
    console.log();

    this.printHelp();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.running = true;
    await this.chatLoop();
  }

  /**
   * Main chat loop
   */
  private async chatLoop(): Promise<void> {
    while (this.running && this.rl) {
      const input = await this.prompt();

      if (!input) continue;

      // Handle commands
      if (input.startsWith('/')) {
        await this.handleCommand(input);
        continue;
      }

      // Send to LLM
      await this.sendMessage(input);
    }
  }

  /**
   * Prompt for user input
   */
  private prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.rl?.question(c('You: ', 'green'), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Send message to LLM
   */
  private async sendMessage(message: string): Promise<void> {
    if (!this.llm.isConfigured()) {
      console.log(c('Error: LLM not configured. Set API key first.', 'red'));
      return;
    }

    console.log(c('Genesis: ', 'cyan') + c('thinking...', 'dim'));

    try {
      const response = await this.llm.chat(message);
      this.messageCount++;

      // Clear "thinking..." line and print response
      process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear line
      console.log(c('Genesis: ', 'cyan') + response.content);

      if (this.verbose) {
        console.log(c(`  [${response.latency}ms, ${response.usage?.outputTokens || '?'} tokens]`, 'dim'));
      }

      // Persist conversation to state
      this.store.updateConversation(this.llm.getHistory(), response.usage?.outputTokens);
      this.store.recordInteraction();

      console.log();
    } catch (error) {
      process.stdout.write('\x1b[1A\x1b[2K'); // Clear "thinking..." line
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(c(`Genesis: Error - ${errorMessage}`, 'red'));
      console.log();
    }
  }

  /**
   * Handle slash commands
   */
  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
      case 'h':
        this.printHelp();
        break;

      case 'clear':
      case 'c':
        this.llm.clearHistory();
        console.log(c('Conversation history cleared.', 'yellow'));
        console.log();
        break;

      case 'history':
        this.printHistory();
        break;

      case 'status':
      case 's':
        this.printStatus();
        break;

      case 'verbose':
      case 'v':
        this.verbose = !this.verbose;
        console.log(c(`Verbose mode: ${this.verbose ? 'ON' : 'OFF'}`, 'yellow'));
        console.log();
        break;

      case 'quit':
      case 'exit':
      case 'q':
        this.stop();
        break;

      case 'system':
        if (args.length > 0) {
          console.log(c('Custom system prompts not yet supported.', 'yellow'));
        } else {
          console.log(c('Current system prompt:', 'cyan'));
          console.log(c('─'.repeat(50), 'dim'));
          console.log(GENESIS_SYSTEM_PROMPT);
          console.log(c('─'.repeat(50), 'dim'));
        }
        console.log();
        break;

      case 'save':
        await this.store.save();
        console.log(c('State saved.', 'green'));
        console.log();
        break;

      case 'load':
        await this.store.load();
        // Restore conversation history
        this.llm.clearHistory();
        const state = this.store.getState();
        for (const msg of state.conversation.history) {
          this.llm.getHistory().push(msg);
        }
        console.log(c(`State loaded. ${state.conversation.history.length} messages restored.`, 'green'));
        console.log();
        break;

      case 'export':
        if (args.length > 0) {
          await this.store.export(args[0]);
          console.log(c(`State exported to: ${args[0]}`, 'green'));
        } else {
          console.log(c('Usage: /export <filename>', 'yellow'));
        }
        console.log();
        break;

      case 'reset':
        this.store.reset();
        this.llm.clearHistory();
        console.log(c('State reset to empty.', 'yellow'));
        console.log();
        break;

      case 'state':
        this.printStateInfo();
        break;

      default:
        console.log(c(`Unknown command: /${cmd}`, 'red'));
        console.log('Type /help for available commands.');
        console.log();
    }
  }

  /**
   * Print banner
   */
  private printBanner(): void {
    console.log(`
${c('╔═══════════════════════════════════════════════════════════════╗', 'cyan')}
${c('║', 'cyan')}  ${c('GENESIS', 'bold')} - Interactive Chat                                ${c('║', 'cyan')}
${c('║', 'cyan')}  ${c('An autopoietic AI system', 'dim')}                                   ${c('║', 'cyan')}
${c('╚═══════════════════════════════════════════════════════════════╝', 'cyan')}
`);
  }

  /**
   * Print help
   */
  private printHelp(): void {
    console.log(c('Commands:', 'bold'));
    console.log('  /help, /h      Show this help');
    console.log('  /clear, /c     Clear conversation history');
    console.log('  /history       Show conversation history');
    console.log('  /status, /s    Show LLM status');
    console.log('  /verbose, /v   Toggle verbose mode');
    console.log('  /system        Show system prompt');
    console.log();
    console.log(c('State:', 'bold'));
    console.log('  /save          Save state to disk');
    console.log('  /load          Load state from disk');
    console.log('  /export <f>    Export state to file');
    console.log('  /reset         Reset state to empty');
    console.log('  /state         Show state info');
    console.log();
    console.log('  /quit, /q      Exit chat (auto-saves)');
    console.log();
  }

  /**
   * Print conversation history
   */
  private printHistory(): void {
    const history = this.llm.getHistory();
    if (history.length === 0) {
      console.log(c('No conversation history.', 'dim'));
    } else {
      console.log(c(`Conversation history (${history.length} messages):`, 'cyan'));
      for (const msg of history) {
        const role = msg.role === 'user' ? c('You:', 'green') : c('Genesis:', 'cyan');
        const content = msg.content.length > 100
          ? msg.content.substring(0, 100) + '...'
          : msg.content;
        console.log(`  ${role} ${content}`);
      }
    }
    console.log();
  }

  /**
   * Print status
   */
  private printStatus(): void {
    const status = this.llm.status();
    const history = this.llm.getHistory();

    console.log(c('Status:', 'bold'));
    console.log(`  Provider:     ${status.provider}`);
    console.log(`  Model:        ${status.model}`);
    console.log(`  Configured:   ${status.configured ? c('Yes', 'green') : c('No', 'red')}`);
    console.log(`  Messages:     ${history.length}`);
    console.log(`  Verbose:      ${this.verbose ? 'ON' : 'OFF'}`);
    console.log();
  }

  /**
   * Print state info
   */
  private printStateInfo(): void {
    const stats = this.store.stats();
    const state = this.store.getState();

    console.log(c('State Info:', 'bold'));
    console.log(`  Data dir:       ${stats.dataDir}`);
    console.log(`  State exists:   ${stats.stateExists ? c('Yes', 'green') : c('No', 'yellow')}`);
    console.log(`  State size:     ${stats.stateSize} bytes`);
    console.log(`  Backups:        ${stats.backupCount}`);
    console.log(`  Dirty:          ${stats.isDirty ? c('Yes', 'yellow') : 'No'}`);
    console.log(`  Last modified:  ${stats.lastModified}`);
    console.log();
    console.log(c('Memory:', 'cyan'));
    console.log(`  Episodes:       ${state.memory.stats.totalEpisodes}`);
    console.log(`  Facts:          ${state.memory.stats.totalFacts}`);
    console.log(`  Skills:         ${state.memory.stats.totalSkills}`);
    console.log();
    console.log(c('Session:', 'cyan'));
    console.log(`  ID:             ${state.session.id.substring(0, 8)}...`);
    console.log(`  Interactions:   ${state.session.interactions}`);
    console.log(`  Started:        ${state.session.startTime}`);
    console.log();
  }

  /**
   * Stop chat session
   */
  stop(): void {
    this.running = false;

    // Save state before exit
    console.log(c('\nSaving state...', 'dim'));
    this.store.updateConversation(this.llm.getHistory());
    this.store.close();

    console.log(c('Goodbye! Genesis signing off.\n', 'cyan'));
    this.rl?.close();
    process.exit(0);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createChatSession(options?: ChatOptions): ChatSession {
  return new ChatSession(options);
}

/**
 * Start interactive chat (convenience function)
 */
export async function startChat(options?: ChatOptions): Promise<void> {
  const session = createChatSession(options);
  await session.start();
}
