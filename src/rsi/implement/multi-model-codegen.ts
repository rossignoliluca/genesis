/**
 * Multi-Model Code Generation for RSI
 *
 * Generates code using multiple LLMs with:
 * - Model racing (parallel generation)
 * - Consensus-based selection
 * - Automatic validation
 * - Self-improvement feedback
 */

import { getMCPClient } from '../../mcp/index.js';
import { PlannedChange } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'gemini' | 'xai';
  model: string;
  maxTokens: number;
  temperature: number;
  costPer1kTokens: number;
  strengths: string[];
  enabled: boolean;
}

export interface CodeGenerationResult {
  model: string;
  code: string | null;
  latency: number;
  tokenCount: number;
  cost: number;
  error?: string;
  score?: number;
}

export interface ValidationResult {
  valid: boolean;
  syntaxErrors: string[];
  typeErrors: string[];
  styleWarnings: string[];
  securityIssues: string[];
  score: number;
}

export interface ConsensusResult {
  selectedCode: string | null;
  selectedModel: string;
  confidence: number;
  alternatives: Array<{
    model: string;
    code: string;
    score: number;
  }>;
  validationResults: Map<string, ValidationResult>;
}

// ============================================================================
// Model Registry
// ============================================================================

const MODELS: ModelConfig[] = [
  {
    id: 'claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.3,
    costPer1kTokens: 0.003,
    strengths: ['code-quality', 'reasoning', 'typescript'],
    enabled: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.3,
    costPer1kTokens: 0.005,
    strengths: ['general', 'python', 'debugging'],
    enabled: true,
  },
  {
    id: 'gemini-pro',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    maxTokens: 8192,
    temperature: 0.3,
    costPer1kTokens: 0.0001,
    strengths: ['speed', 'cost', 'multimodal'],
    enabled: true,
  },
  {
    id: 'grok',
    name: 'Grok 2',
    provider: 'xai',
    model: 'grok-2',
    maxTokens: 4096,
    temperature: 0.3,
    costPer1kTokens: 0.002,
    strengths: ['reasoning', 'code-generation'],
    enabled: false, // Enable if API available
  },
];

// ============================================================================
// Code Validation
// ============================================================================

export class CodeValidator {
  /**
   * Validate generated TypeScript code
   */
  validate(code: string, context: { file: string; type: string }): ValidationResult {
    const syntaxErrors: string[] = [];
    const typeErrors: string[] = [];
    const styleWarnings: string[] = [];
    const securityIssues: string[] = [];

    // Basic syntax checks
    if (!this.checkBalancedBraces(code)) {
      syntaxErrors.push('Unbalanced braces or brackets');
    }

    if (!this.checkImports(code)) {
      syntaxErrors.push('Invalid import statement(s)');
    }

    // TypeScript-specific checks
    if (code.includes('any') && !code.includes('// eslint-disable')) {
      styleWarnings.push('Usage of "any" type detected');
    }

    if (code.includes('as any')) {
      styleWarnings.push('Type assertion to "any" detected');
    }

    // Security checks
    if (code.includes('eval(')) {
      securityIssues.push('Usage of eval() detected - security risk');
    }

    if (code.match(/exec(Sync)?\s*\(/)) {
      styleWarnings.push('Shell execution detected - verify input sanitization');
    }

    if (code.includes('dangerouslySetInnerHTML')) {
      securityIssues.push('Dangerous HTML injection detected');
    }

    // Check for common issues
    if (code.includes('console.log') && context.type !== 'debug') {
      styleWarnings.push('Console.log statement detected - consider removing');
    }

    // Calculate score
    const score = this.calculateScore(syntaxErrors, typeErrors, styleWarnings, securityIssues);

    return {
      valid: syntaxErrors.length === 0 && typeErrors.length === 0 && securityIssues.length === 0,
      syntaxErrors,
      typeErrors,
      styleWarnings,
      securityIssues,
      score,
    };
  }

  private checkBalancedBraces(code: string): boolean {
    const stack: string[] = [];
    const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && code[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (pairs[char]) {
        stack.push(pairs[char]);
      } else if (char === '}' || char === ']' || char === ')') {
        if (stack.pop() !== char) return false;
      }
    }

    return stack.length === 0;
  }

  private checkImports(code: string): boolean {
    for (const line of code.split('\n')) {
      if (line.trim().startsWith('import')) {
        if (!line.includes('from') && !line.includes('{')) return false;
      }
    }
    return true;
  }

  /**
   * Validate that imported relative modules actually exist
   */
  validateImportPaths(code: string, sandboxPath: string, targetFile?: string): string[] {
    const errors: string[] = [];
    const importRegex = /import\s+(?:\{[^}]+\}|[a-zA-Z0-9_*]+(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/g;
    const srcDir = path.resolve(process.cwd(), 'src');
    // Resolve from the target file's directory, not sandbox root
    const fileDir = targetFile
      ? path.dirname(path.resolve(sandboxPath, targetFile))
      : sandboxPath;
    const srcFileDir = targetFile
      ? path.dirname(path.resolve(process.cwd(), targetFile))
      : srcDir;

    for (const match of code.matchAll(importRegex)) {
      const modulePath = match[1];
      if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) continue;
      const jsPath = modulePath.replace(/\.js$/, '.ts');
      const candidates = [
        path.resolve(fileDir, jsPath),
        path.resolve(fileDir, jsPath.replace(/\.ts$/, '') + '/index.ts'),
        path.resolve(srcFileDir, jsPath),
        path.resolve(srcFileDir, jsPath.replace(/\.ts$/, '') + '/index.ts'),
      ];
      if (!candidates.some(c => fs.existsSync(c))) {
        errors.push(`Import not found: ${modulePath}`);
      }
    }
    return errors;
  }

  /**
   * Validate that generated code can be safely appended to a file
   * Catches class members outside class scope, unbalanced combined braces, etc.
   */
  validateAppendable(code: string, sandboxPath: string, targetFile: string): string[] {
    const errors: string[] = [];
    const lines = code.split('\n');

    // Check for class member syntax at top level (private/protected/public)
    // and this. usage outside any function/class context
    let braceDepth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      // Track brace depth to know if we're at top level
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      // At top level (braceDepth <= 0), these patterns indicate class member code
      if (braceDepth <= 0) {
        if (/^(?:private|protected|public)\s+/.test(trimmed) && !trimmed.includes('class ')) {
          errors.push('Class member outside class body: ' + trimmed.slice(0, 60));
          break;
        }
        if (/^this\./.test(trimmed)) {
          errors.push('this. reference at module scope: ' + trimmed.slice(0, 60));
          break;
        }
      }
    }

    // Check combined braces balance if original file exists
    const filePath = path.resolve(sandboxPath, targetFile);
    const srcFilePath = path.resolve(process.cwd(), targetFile);
    const existingPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(srcFilePath) ? srcFilePath : null);

    if (existingPath) {
      try {
        const existing = fs.readFileSync(existingPath, 'utf-8');
        const combined = existing + '\n\n' + code;
        if (!this.checkBalancedBraces(combined)) {
          errors.push('Combined file has unbalanced braces');
        }
      } catch { /* ignore */ }
    }

    return errors;
  }

  private calculateScore(
    syntax: string[],
    types: string[],
    style: string[],
    security: string[]
  ): number {
    let score = 100;

    score -= syntax.length * 25; // Syntax errors are severe
    score -= types.length * 20; // Type errors are significant
    score -= style.length * 5; // Style warnings are minor
    score -= security.length * 30; // Security issues are critical

    return Math.max(0, score);
  }
}

// ============================================================================
// Multi-Model Code Generator
// ============================================================================

export class MultiModelCodeGenerator {
  private mcp = getMCPClient();
  private validator = new CodeValidator();
  private stats = {
    totalGenerations: 0,
    successfulGenerations: 0,
    modelStats: new Map<string, { attempts: number; successes: number; avgLatency: number }>(),
  };

  /**
   * Generate code using multiple models in parallel
   */
  async generateWithRacing(
    change: PlannedChange,
    sandboxPath: string,
    options: {
      maxModels?: number;
      timeout?: number;
      useConsensus?: boolean;
    } = {}
  ): Promise<ConsensusResult> {
    const { maxModels = 3, timeout = 60000, useConsensus = true } = options;

    // Select best models for this task
    const selectedModels = this.selectModels(change, maxModels);

    console.log(`[MultiModelCodeGen] Racing ${selectedModels.length} models: ${selectedModels.map(m => m.name).join(', ')}`);

    // Generate in parallel
    const startTime = Date.now();
    const results = await Promise.allSettled(
      selectedModels.map(model =>
        this.generateWithModel(model, change, sandboxPath, timeout)
      )
    );

    // Process results
    const successfulResults: CodeGenerationResult[] = [];
    const validationResults = new Map<string, ValidationResult>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const model = selectedModels[i];

      if (result.status === 'fulfilled' && result.value.code) {
        const genResult = result.value;
        const code = genResult.code!; // Non-null assertion (we checked above)

        // Validate code
        const validation = this.validator.validate(code, {
          file: change.file,
          type: change.type,
        });

        // Validate import paths exist in codebase
        const importErrors = this.validator.validateImportPaths(code, sandboxPath, change.file);
        if (importErrors.length > 0) {
          validation.typeErrors.push(...importErrors);
          validation.score = Math.max(0, validation.score - importErrors.length * 30);
          console.log(`[MultiModelCodeGen] ${model.name}: ${importErrors.length} bad imports`);
        }

        // For modify operations, check generated code won't break when appended
        if (change.type === 'modify') {
          const structErrors = this.validator.validateAppendable(code, sandboxPath, change.file);
          if (structErrors.length > 0) {
            validation.typeErrors.push(...structErrors);
            validation.score = Math.max(0, validation.score - structErrors.length * 25);
            console.log(`[MultiModelCodeGen] ${model.name}: ${structErrors.length} structural errors`);
          }
        }

        validationResults.set(model.id, validation);

        // Score the result
        genResult.score = this.scoreResult(genResult, validation);
        successfulResults.push(genResult);

        console.log(`[MultiModelCodeGen] ${model.name}: score=${genResult.score?.toFixed(1)}, latency=${genResult.latency}ms`);
      } else {
        const error = result.status === 'rejected' ? result.reason : result.value.error;
        console.log(`[MultiModelCodeGen] ${model.name}: failed - ${error}`);
      }
    }

    // Update stats
    this.stats.totalGenerations++;
    if (successfulResults.length > 0) {
      this.stats.successfulGenerations++;
    }

    // No successful generations
    if (successfulResults.length === 0) {
      return {
        selectedCode: null,
        selectedModel: 'none',
        confidence: 0,
        alternatives: [],
        validationResults,
      };
    }

    // Select best result
    if (useConsensus && successfulResults.length >= 2) {
      return this.selectByConsensus(successfulResults, validationResults);
    } else {
      // Simple selection: highest score
      const sorted = successfulResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      const best = sorted[0];

      return {
        selectedCode: best.code,
        selectedModel: best.model,
        confidence: (best.score || 0) / 100,
        alternatives: sorted.slice(1).map(r => ({
          model: r.model,
          code: r.code!,
          score: r.score || 0,
        })),
        validationResults,
      };
    }
  }

  /**
   * Generate code with a specific model
   */
  private async generateWithModel(
    model: ModelConfig,
    change: PlannedChange,
    sandboxPath: string,
    timeout: number
  ): Promise<CodeGenerationResult> {
    const startTime = Date.now();

    const systemPrompt = this.buildSystemPrompt(model, change);
    const userPrompt = this.buildUserPrompt(change, sandboxPath);

    try {
      let response: any;

      switch (model.provider) {
        case 'anthropic':
          response = await this.callAnthropic(model, systemPrompt, userPrompt, timeout);
          break;
        case 'openai':
          response = await this.callOpenAI(model, systemPrompt, userPrompt, timeout);
          break;
        case 'gemini':
          response = await this.callGemini(model, systemPrompt, userPrompt, timeout);
          break;
        case 'xai':
          response = await this.callXAI(model, systemPrompt, userPrompt, timeout);
          break;
        default:
          throw new Error(`Unknown provider: ${model.provider}`);
      }

      const latency = Date.now() - startTime;
      const code = this.extractCode(response);

      // Update model stats
      this.updateModelStats(model.id, true, latency);

      return {
        model: model.id,
        code,
        latency,
        tokenCount: response.tokenCount || 0,
        cost: (response.tokenCount || 0) / 1000 * model.costPer1kTokens,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateModelStats(model.id, false, latency);

      return {
        model: model.id,
        code: null,
        latency,
        tokenCount: 0,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Call Anthropic Claude API via MCP
   */
  private async callAnthropic(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    timeout: number
  ): Promise<any> {
    // Anthropic API call via direct fetch (no MCP wrapper for Anthropic typically)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model.model,
          max_tokens: model.maxTokens,
          temperature: model.temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return {
        content: data.content?.[0]?.text || '',
        tokenCount: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Call OpenAI API via MCP
   */
  private async callOpenAI(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    timeout: number
  ): Promise<any> {
    const result = await this.mcp.call('openai', 'openai_chat', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: model.model,
      max_tokens: model.maxTokens,
      temperature: model.temperature,
    }) as any;

    return {
      content: result?.content || result?.message?.content || '',
      tokenCount: result?.usage?.total_tokens || 0,
    };
  }

  /**
   * Call Gemini API via MCP
   */
  private async callGemini(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    timeout: number
  ): Promise<any> {
    // Gemini via direct API
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n' + userPrompt }],
              },
            ],
            generationConfig: {
              maxOutputTokens: model.maxTokens,
              temperature: model.temperature,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        content,
        tokenCount: data.usageMetadata?.totalTokenCount || 0,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Call X.AI Grok API
   */
  private async callXAI(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    timeout: number
  ): Promise<any> {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error('XAI_API_KEY not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: model.maxTokens,
          temperature: model.temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`X.AI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return {
        content: data.choices?.[0]?.message?.content || '',
        tokenCount: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Select models based on task type
   */
  private selectModels(change: PlannedChange, maxModels: number): ModelConfig[] {
    const enabledModels = MODELS.filter(m => m.enabled);

    // Score models based on task requirements
    const scored = enabledModels.map(model => {
      let score = 50; // Base score

      // Boost for TypeScript tasks
      if (change.file.endsWith('.ts') && model.strengths.includes('typescript')) {
        score += 20;
      }

      // Boost for code quality
      if (model.strengths.includes('code-quality')) {
        score += 15;
      }

      // Consider cost (lower is better)
      score -= model.costPer1kTokens * 1000;

      // Consider historical performance
      const stats = this.stats.modelStats.get(model.id);
      if (stats && stats.attempts > 0) {
        const successRate = stats.successes / stats.attempts;
        score += successRate * 20;
      }

      return { model, score };
    });

    // Sort by score and take top N
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxModels)
      .map(s => s.model);
  }

  /**
   * Build concise codebase module context for LLM grounding
   */
  private buildCodebaseContext(targetFile: string): string {
    const srcDir = path.resolve(process.cwd(), 'src');
    if (!fs.existsSync(srcDir)) return '';
    const lines: string[] = [];
    const targetDir = path.dirname(path.join(srcDir, '..', targetFile));

    try {
      const dirs = fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name).sort();
      lines.push('AVAILABLE MODULES (src/):');
      lines.push(dirs.join(', '));
    } catch { /* ignore */ }

    // Compute relative prefix from target file to src/
    // e.g., src/features/foo.ts → '../', src/rsi/impl/foo.ts → '../../'
    const targetInSrc = targetFile.replace(/^src\//, '');
    const depth = targetInSrc.split('/').length - 1; // dirs between file and src/
    const relPrefix = depth > 0 ? '../'.repeat(depth) : './';

    lines.push('');
    lines.push('KEY IMPORTS — always use NAMED imports (import { X } from), NEVER default imports:');
    lines.push(`  import { getMemorySystem } from '${relPrefix}memory/index.js';`);
    lines.push(`  import { getConsciousnessSystem } from '${relPrefix}consciousness/index.js';`);
    lines.push(`  import { getNeuromodulationSystem } from '${relPrefix}neuromodulation/index.js';`);
    lines.push(`  import { createPublisher, createSubscriber } from '${relPrefix}bus/index.js';`);
    lines.push(`  import { toolRegistry } from '${relPrefix}tools/index.js'; // Map<string,LegacyTool> — .set()/.get()/.has() NOT .register()`);
    lines.push(`  import { getMCPClient } from '${relPrefix}mcp/index.js';`);
    lines.push(`  import EventEmitter from 'events';`);
    lines.push('IMPORTANT: These are the ONLY available imports. Do NOT invent exports like getLLM, getAI, etc.');

    if (fs.existsSync(targetDir)) {
      try {
        const siblings = fs.readdirSync(targetDir)
          .filter(f => f.endsWith('.ts') && f !== 'index.ts').slice(0, 15);
        if (siblings.length > 0) {
          lines.push('');
          lines.push(`SIBLING FILES in ${path.relative(path.join(srcDir, '..'), targetDir)}:`);
          lines.push(siblings.join(', '));
        }
      } catch { /* ignore */ }
    }

    return lines.join('\n');
  }

  /**
   * Extract interface/type definitions from source for LLM grounding
   */
  private extractTypeDefinitions(content: string): string {
    const defs: string[] = [];
    const lines = content.split('\n');
    let inTypeDef = false;
    let braceDepth = 0;
    let currentDef: string[] = [];

    for (const line of lines) {
      if (!inTypeDef && /^\s*(?:export\s+)?(?:interface|type)\s+\w+/.test(line)) {
        inTypeDef = true;
        braceDepth = 0;
        currentDef = [line];
      }
      if (inTypeDef) {
        if (!currentDef.includes(line)) currentDef.push(line);
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
        if (braceDepth <= 0 && currentDef.length > 1) {
          defs.push(currentDef.length <= 15
            ? currentDef.join('\n')
            : currentDef.slice(0, 12).join('\n') + '\n  // ... more fields');
          inTypeDef = false;
          currentDef = [];
        }
        if (currentDef.length > 20) { inTypeDef = false; currentDef = []; }
      }
    }
    return defs.slice(0, 10).join('\n\n');
  }

  /**
   * Extract type definitions from imported files for LLM grounding
   */
  private extractImportedTypes(content: string, filePath: string): string {
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    const typeNames = new Set<string>();
    const defs: string[] = [];
    const fileDir = path.dirname(filePath);

    for (const match of content.matchAll(importRegex)) {
      const names = match[1].split(',').map(n => n.trim().replace(/\s+as\s+\w+/, ''));
      const modulePath = match[2];
      if (!modulePath.startsWith('.')) continue;

      // Resolve to .ts file
      const resolved = path.resolve(fileDir, modulePath.replace(/\.js$/, '.ts'));
      const candidates = [resolved, resolved.replace(/\.ts$/, '/index.ts')];

      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        try {
          const depContent = fs.readFileSync(candidate, 'utf-8');
          for (const name of names) {
            if (typeNames.has(name) || !/^[A-Z]/.test(name)) continue;
            // Extract this specific type/interface
            const regex = new RegExp(`(?:export\\s+)?(?:interface|type)\\s+${name}\\s*[{=]`, 'm');
            const typeMatch = depContent.match(regex);
            if (typeMatch) {
              typeNames.add(name);
              const startIdx = depContent.indexOf(typeMatch[0]);
              const snippet = depContent.slice(startIdx, startIdx + 500);
              // Find end of definition
              let braces = 0;
              let endIdx = 0;
              for (let i = 0; i < snippet.length; i++) {
                if (snippet[i] === '{') braces++;
                if (snippet[i] === '}') { braces--; if (braces <= 0 && i > 0) { endIdx = i + 1; break; } }
              }
              if (endIdx > 0) {
                defs.push(snippet.slice(0, endIdx));
              }
            }
          }
        } catch { /* ignore */ }
        break;
      }
    }
    return defs.slice(0, 8).join('\n\n') || '(none found)';
  }

  /**
   * Build system prompt for code generation
   */
  private buildSystemPrompt(model: ModelConfig, change: PlannedChange): string {
    const context = this.buildCodebaseContext(change.file);

    return `You are an expert TypeScript code generator for Genesis, an autonomous AI system.

${context}

RULES:
1. ONLY import modules from the KEY IMPORTS list — NEVER invent exports or module names
2. Always use NAMED imports: import { X } from '...' — NEVER default imports
3. Always use .js extension in import paths (NodeNext module resolution)
4. Use __dirname, NOT import.meta.url
5. Generate clean, well-documented TypeScript code
6. Proper error handling (catch blocks: use unknown type)
7. No "any" types unless absolutely necessary
8. toolRegistry is a Map<string, LegacyTool> — .set(name, tool), .get(name), .has(name) — NEVER .register()
9. Do NOT guess property types — check TYPE DEFINITIONS
10. Output ONLY the code, no explanations or markdown fences

FILE: ${change.file}
CHANGE TYPE: ${change.type}`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(change: PlannedChange, sandboxPath: string): string {
    let prompt = `Generate TypeScript code for the following specification:

File: ${change.file}
Change type: ${change.type}
Description: ${change.description}

Specification:
${change.codeSpec || change.description}`;

    // Add existing file context if modifying
    if (change.type === 'modify') {
      const filePath = path.join(sandboxPath, change.file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const existingDecls = content.match(
          /export\s+(?:function|class|interface|type|const|enum|async function)\s+(\w+)/g
        ) || [];
        const signatures = content.match(
          /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|enum)\s+\w+[^{;]*/g
        ) || [];
        const methodSigs = content.match(
          /^\s+(?:async\s+)?(?:public\s+|private\s+|protected\s+)?\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?/gm
        ) || [];

        prompt += `\n\nIMPORTANT: This is a MODIFY operation. Code will be APPENDED TO THE END of the existing file (AFTER all existing code).
CRITICAL RULES FOR MODIFY:
- Your code will be placed at MODULE SCOPE (top level), NOT inside any class or function
- NEVER generate class methods (no private/protected/public keywords) — they cannot exist at module level
- ONLY generate: standalone exported functions, new exported classes, new interfaces/types, or new const declarations
- DO NOT redeclare existing imports, types, interfaces, classes, or functions
- DO NOT call methods that don't exist — only use methods listed below
- DO NOT access properties that don't exist on types — check TYPE DEFINITIONS below
- If you need to modify class behavior, create a wrapper function or subclass instead
Generate ONLY the NEW code to add.

Existing file (first 5000 chars):
${content.slice(0, 5000)}

ALREADY DECLARED (do NOT redeclare):
${existingDecls.slice(0, 30).join('\n')}

EXISTING API (only call these):
${signatures.slice(0, 20).map(s => s.trim()).join('\n')}
${methodSigs.slice(0, 30).map(s => s.trim()).join('\n')}

TYPE DEFINITIONS (only use existing properties):
${this.extractTypeDefinitions(content)}

IMPORTED TYPES (from dependency files):
${this.extractImportedTypes(content, filePath)}`;
      }
    }

    // For 'create' operations, add sibling context
    if (change.type === 'create') {
      const targetDir = path.dirname(path.join(sandboxPath, change.file));
      if (fs.existsSync(targetDir)) {
        try {
          const siblings = fs.readdirSync(targetDir).filter(f => f.endsWith('.ts')).slice(0, 5);
          for (const sib of siblings) {
            try {
              const content = fs.readFileSync(path.join(targetDir, sib), 'utf-8');
              const importLines = content.split('\n').filter(l => l.startsWith('import ')).slice(0, 10);
              const exportLines = content.split('\n').filter(l => l.startsWith('export ')).slice(0, 10);
              if (importLines.length > 0) {
                prompt += `\n\nPattern reference from ${sib}:\n${importLines.join('\n')}\n${exportLines.join('\n')}`;
              }
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
    }

    prompt += '\n\nGenerate ONLY the code, no markdown fences or explanations.';
    return prompt;
  }

  /**
   * Extract code from LLM response
   */
  private extractCode(response: any): string | null {
    let code = response.content || '';

    if (!code) return null;

    // Remove markdown code fences
    code = code.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '');
    code = code.replace(/\n?```$/i, '');

    // Remove any trailing explanations
    const exportIndex = code.lastIndexOf('\nexport');
    const functionIndex = code.lastIndexOf('\nfunction');
    const classIndex = code.lastIndexOf('\nclass');
    const maxIndex = Math.max(exportIndex, functionIndex, classIndex);

    if (maxIndex > 0) {
      // Find end of the last code block
      let endIndex = code.length;
      for (let i = maxIndex + 1; i < code.length; i++) {
        if (code[i] === '\n' && code[i + 1] && !code[i + 1].match(/[\s}]/)) {
          // Potential end of code block
          const rest = code.slice(i + 1);
          if (rest.match(/^[A-Z][a-z]/)) {
            // Looks like start of explanation
            endIndex = i;
            break;
          }
        }
      }
      code = code.slice(0, endIndex);
    }

    return code.trim() || null;
  }

  /**
   * Score a generation result
   */
  private scoreResult(result: CodeGenerationResult, validation: ValidationResult): number {
    let score = validation.score;

    // Latency bonus (faster is better)
    if (result.latency < 3000) score += 10;
    else if (result.latency < 5000) score += 5;
    else if (result.latency > 30000) score -= 10;

    // Cost bonus (cheaper is better)
    if (result.cost < 0.01) score += 5;
    else if (result.cost > 0.1) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Select best code by consensus
   */
  private selectByConsensus(
    results: CodeGenerationResult[],
    validationResults: Map<string, ValidationResult>
  ): ConsensusResult {
    // Sort by score
    const sorted = results.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Check for consensus (multiple models with similar high scores)
    const topScore = sorted[0].score || 0;
    const consensusThreshold = topScore * 0.9; // Within 10% of top score

    const consensusResults = sorted.filter(r => (r.score || 0) >= consensusThreshold);

    // Calculate confidence based on consensus
    let confidence = topScore / 100;
    if (consensusResults.length >= 2) {
      confidence += 0.1; // Bonus for consensus
    }
    if (consensusResults.length === sorted.length) {
      confidence += 0.1; // Full consensus bonus
    }

    return {
      selectedCode: sorted[0].code,
      selectedModel: sorted[0].model,
      confidence: Math.min(1, confidence),
      alternatives: sorted.slice(1).map(r => ({
        model: r.model,
        code: r.code!,
        score: r.score || 0,
      })),
      validationResults,
    };
  }

  /**
   * Update model statistics
   */
  private updateModelStats(modelId: string, success: boolean, latency: number): void {
    let stats = this.stats.modelStats.get(modelId);
    if (!stats) {
      stats = { attempts: 0, successes: 0, avgLatency: 0 };
    }

    const totalLatency = stats.avgLatency * stats.attempts + latency;
    stats.attempts++;
    if (success) stats.successes++;
    stats.avgLatency = totalLatency / stats.attempts;

    this.stats.modelStats.set(modelId, stats);
  }

  /**
   * Get generation statistics
   */
  getStats(): {
    totalGenerations: number;
    successRate: number;
    modelStats: Array<{
      model: string;
      attempts: number;
      successRate: number;
      avgLatency: number;
    }>;
  } {
    return {
      totalGenerations: this.stats.totalGenerations,
      successRate: this.stats.totalGenerations > 0
        ? this.stats.successfulGenerations / this.stats.totalGenerations
        : 0,
      modelStats: Array.from(this.stats.modelStats.entries()).map(([model, stats]) => ({
        model,
        attempts: stats.attempts,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
        avgLatency: stats.avgLatency,
      })),
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let multiModelInstance: MultiModelCodeGenerator | null = null;

export function getMultiModelCodeGenerator(): MultiModelCodeGenerator {
  if (!multiModelInstance) {
    multiModelInstance = new MultiModelCodeGenerator();
  }
  return multiModelInstance;
}

export function resetMultiModelCodeGenerator(): void {
  multiModelInstance = null;
}
