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
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
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
    const importRegex = /^import\s+/gm;
    const matches = code.match(importRegex) || [];

    for (const line of code.split('\n')) {
      if (line.trim().startsWith('import')) {
        // Basic import validation
        if (!line.includes('from') && !line.includes('{')) {
          return false;
        }
      }
    }

    return true;
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
   * Build system prompt for code generation
   */
  private buildSystemPrompt(model: ModelConfig, change: PlannedChange): string {
    return `You are an expert TypeScript code generator for Genesis, an autonomous AI system.

RULES:
1. Generate clean, well-documented TypeScript code
2. Follow existing patterns in the codebase
3. Include proper error handling and type safety
4. No "any" types unless absolutely necessary
5. Use async/await for asynchronous operations
6. Include JSDoc comments for public APIs
7. Output ONLY the code, no explanations or markdown fences

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
        prompt += `\n\nExisting file content (first 2000 chars):\n${content.slice(0, 2000)}`;
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
