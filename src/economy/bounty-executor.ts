/**
 * Genesis v16 — Bounty Executor
 *
 * The missing link between bounty discovery and completion.
 * Orchestrates:
 * 1. BountyHunter.scan() — discover bounties
 * 2. BountyCodeGenerator — generate solution using LLM
 * 3. PRPipeline.submitBounty() — submit solution
 * 4. RSI Feedback — learn from outcomes
 *
 * This module enables autonomous revenue generation.
 */

import { getBountyHunter, Bounty, BountySubmission, BountyHunterStats } from './generators/bounty-hunter.js';
import { PRPipeline, CodeChange, PRSubmission } from './live/pr-pipeline.js';
import { getRevenueTracker } from './live/revenue-tracker.js';
import { getBountyRSIFeedback } from './rsi-feedback.js';
import { getHybridRouter } from '../llm/router.js';
import { getMCPClient } from '../mcp/index.js';

// ============================================================================
// Types
// ============================================================================

export interface BountyExecutorConfig {
  githubUsername: string;
  maxConcurrentExecutions: number;
  dryRun: boolean;
  autoSubmit: boolean;
  minConfidenceToSubmit: number; // 0-1
}

export interface GeneratedSolution {
  success: boolean;
  changes: CodeChange[];
  description: string;
  confidence: number;
  error?: string;
}

export interface ExecutionResult {
  bountyId: string;
  status: 'success' | 'failed' | 'skipped';
  solution?: GeneratedSolution;
  submission?: PRSubmission;
  error?: string;
  duration: number;
}

// ============================================================================
// Bounty Code Generator
// ============================================================================

export class BountyCodeGenerator {
  private router = getHybridRouter();
  private mcp = getMCPClient();

  /**
   * Generate code solution for a bounty using LLM
   */
  async generate(bounty: Bounty): Promise<GeneratedSolution> {
    console.log(`[BountyCodeGen] Generating solution for: ${bounty.title}`);

    try {
      // 1. Gather context about the bounty
      const context = await this.gatherContext(bounty);

      // 2. Generate solution with multi-model approach
      const solution = await this.generateWithRetry(bounty, context);

      if (!solution) {
        return {
          success: false,
          changes: [],
          description: '',
          confidence: 0,
          error: 'All models failed to generate valid solution',
        };
      }

      // 3. Validate solution
      const validation = await this.validateSolution(solution, bounty);

      if (!validation.valid) {
        return {
          success: false,
          changes: [],
          description: '',
          confidence: 0,
          error: validation.error,
        };
      }

      return {
        success: true,
        changes: solution.changes,
        description: solution.description,
        confidence: validation.confidence,
      };
    } catch (error) {
      console.error(`[BountyCodeGen] Error:`, error);
      return {
        success: false,
        changes: [],
        description: '',
        confidence: 0,
        error: String(error),
      };
    }
  }

  private async gatherContext(bounty: Bounty): Promise<string> {
    const parts: string[] = [];

    parts.push(`# Bounty: ${bounty.title}`);
    parts.push(`Platform: ${bounty.platform}`);
    parts.push(`Category: ${bounty.category}`);
    parts.push(`Difficulty: ${bounty.difficulty}`);
    parts.push(`Reward: $${bounty.reward}`);
    parts.push(`\n## Description:\n${bounty.description}`);

    // If GitHub bounty, fetch repository context
    if (bounty.sourceMetadata?.org && bounty.sourceMetadata?.repo) {
      try {
        // Get README
        const readme = await this.mcp.call('github', 'get_file_contents', {
          owner: bounty.sourceMetadata.org,
          repo: bounty.sourceMetadata.repo,
          path: 'README.md',
        });
        if (readme) {
          parts.push(`\n## Repository README:\n${String(readme).slice(0, 2000)}`);
        }
      } catch {
        // README not available
      }

      // Get issue details if available
      if (bounty.sourceMetadata.issueNumber) {
        try {
          const issue = await this.mcp.call('github', 'get_issue', {
            owner: bounty.sourceMetadata.org,
            repo: bounty.sourceMetadata.repo,
            issue_number: bounty.sourceMetadata.issueNumber,
          });
          if (issue) {
            parts.push(`\n## Issue Details:\n${JSON.stringify(issue, null, 2).slice(0, 3000)}`);
          }
        } catch {
          // Issue not available
        }
      }
    }

    return parts.join('\n');
  }

  private async generateWithRetry(
    bounty: Bounty,
    context: string,
  ): Promise<{ changes: CodeChange[]; description: string } | null> {
    const systemPrompt = `You are an expert software developer completing bounties.
Your task is to generate high-quality code that solves the bounty requirements.

IMPORTANT:
- Generate complete, working code (no placeholders or TODOs)
- Follow the repository's coding style
- Include proper error handling
- Write clear, concise commit messages

Respond in JSON format:
{
  "changes": [
    { "path": "path/to/file.ts", "content": "full file content", "operation": "create|update" }
  ],
  "description": "PR description explaining the changes"
}`;

    const userPrompt = `${context}

Generate the code changes needed to complete this bounty. Be thorough and complete.`;

    // Try with primary model
    try {
      const response = await this.router.execute(userPrompt, systemPrompt);
      const parsed = this.parseResponse(response.content);
      if (parsed) return parsed;
    } catch (error) {
      console.log(`[BountyCodeGen] Primary model failed: ${error}`);
    }

    // Try with fallback (explicit OpenAI)
    try {
      const response = await this.router.execute(userPrompt, systemPrompt);
      const parsed = this.parseResponse(response.content);
      if (parsed) return parsed;
    } catch (error) {
      console.log(`[BountyCodeGen] Fallback model failed: ${error}`);
    }

    return null;
  }

  private parseResponse(content: string): { changes: CodeChange[]; description: string } | null {
    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      let jsonStr = content;

      // Try to extract from markdown code block first
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        // Fallback: find outermost JSON object
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.log('[BountyCodeGen] No JSON found in response');
          console.log('[BountyCodeGen] Response preview:', content.slice(0, 200));
          return null;
        }
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed.changes)) {
        console.log('[BountyCodeGen] Response missing "changes" array');
        return null;
      }

      if (typeof parsed.description !== 'string') {
        console.log('[BountyCodeGen] Response missing "description" string');
        return null;
      }

      // Validate each change (with flexible field names)
      const normalizedChanges: CodeChange[] = [];
      for (const change of parsed.changes) {
        const path = change.path || change.file || change.filename;
        const content = change.content || change.code || change.source;
        const operation = change.operation || change.action || change.type || 'create';

        if (!path || !content) {
          console.log('[BountyCodeGen] Change missing path or content:', change);
          continue; // Skip invalid changes instead of failing entirely
        }

        normalizedChanges.push({ path, content, operation });
      }

      if (normalizedChanges.length === 0) {
        console.log('[BountyCodeGen] No valid changes in response');
        return null;
      }

      return { changes: normalizedChanges, description: parsed.description };
    } catch (error) {
      console.log('[BountyCodeGen] JSON parse error:', String(error));
      return null;
    }
  }

  private async validateSolution(
    solution: { changes: CodeChange[]; description: string },
    bounty: Bounty,
  ): Promise<{ valid: boolean; confidence: number; error?: string }> {
    // Basic validation
    if (solution.changes.length === 0) {
      return { valid: false, confidence: 0, error: 'No changes generated' };
    }

    // Check for placeholder code
    for (const change of solution.changes) {
      if (
        change.content.includes('// TODO') ||
        change.content.includes('// PLACEHOLDER') ||
        change.content.includes('throw new Error("Not implemented")')
      ) {
        return { valid: false, confidence: 0, error: 'Solution contains placeholder code' };
      }
    }

    // Check description quality
    if (solution.description.length < 50) {
      return { valid: false, confidence: 0, error: 'PR description too short' };
    }

    // Estimate confidence based on bounty difficulty
    const difficultyConfidence: Record<string, number> = {
      easy: 0.8,
      medium: 0.6,
      hard: 0.4,
      critical: 0.2,
    };

    const baseConfidence = difficultyConfidence[bounty.difficulty] || 0.5;

    // Adjust based on category (code bounties have highest confidence)
    const categoryMultiplier: Record<string, number> = {
      code: 1.0,
      content: 0.9,
      design: 0.7,
      audit: 0.5,
      research: 0.6,
      translation: 0.8,
    };

    const confidence = baseConfidence * (categoryMultiplier[bounty.category] || 0.7);

    return { valid: true, confidence };
  }
}

// ============================================================================
// Bounty Executor
// ============================================================================

export class BountyExecutor {
  private hunter = getBountyHunter();
  private codeGenerator = new BountyCodeGenerator();
  private prPipeline: PRPipeline;
  private revenueTracker = getRevenueTracker();
  private rsiFeedback = getBountyRSIFeedback();
  private config: BountyExecutorConfig;

  private activeExecutions = new Map<string, Promise<ExecutionResult>>();

  constructor(config: Partial<BountyExecutorConfig> = {}) {
    this.config = {
      githubUsername: config.githubUsername || process.env.GITHUB_USERNAME || 'genesis-ai',
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 2,
      dryRun: config.dryRun ?? false,
      autoSubmit: config.autoSubmit ?? true,
      minConfidenceToSubmit: config.minConfidenceToSubmit ?? 0.5,
    };

    this.prPipeline = new PRPipeline({
      githubUsername: this.config.githubUsername,
      dryRun: this.config.dryRun,
    });
  }

  /**
   * Execute a single bounty hunting cycle
   */
  async executeLoop(): Promise<ExecutionResult | null> {
    console.log('[BountyExecutor] Starting bounty execution cycle...');

    // 1. Scan all platforms for bounties
    console.log('[BountyExecutor] Step 1: Scanning for bounties...');
    await this.hunter.scan();

    // 2. Select best bounty by expected value
    console.log('[BountyExecutor] Step 2: Selecting best bounty...');
    const bounty = this.hunter.selectBest();

    if (!bounty) {
      console.log('[BountyExecutor] No suitable bounties found');
      return null;
    }

    console.log(`[BountyExecutor] Selected: ${bounty.title} ($${bounty.reward})`);

    // 3. Check if we're already executing this bounty
    if (this.activeExecutions.has(bounty.id)) {
      console.log('[BountyExecutor] Already executing this bounty');
      return null;
    }

    // 4. Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      console.log('[BountyExecutor] Max concurrent executions reached');
      return null;
    }

    // 5. Execute the bounty
    const executionPromise = this.executeBounty(bounty);
    this.activeExecutions.set(bounty.id, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this.activeExecutions.delete(bounty.id);
    }
  }

  /**
   * Execute a specific bounty
   */
  async executeBounty(bounty: Bounty): Promise<ExecutionResult> {
    const startTime = Date.now();

    console.log(`[BountyExecutor] Executing bounty: ${bounty.id}`);

    try {
      // 1. Claim the bounty
      console.log('[BountyExecutor] Claiming bounty...');
      const claimed = await this.hunter.claim(bounty.id);
      if (!claimed) {
        return {
          bountyId: bounty.id,
          status: 'failed',
          error: 'Failed to claim bounty',
          duration: Date.now() - startTime,
        };
      }

      // 2. Generate solution
      console.log('[BountyExecutor] Generating solution...');
      const solution = await this.codeGenerator.generate(bounty);

      if (!solution.success) {
        // Record failure for RSI learning
        await this.rsiFeedback.recordFailure(
          bounty as any,
          solution.error || 'Code generation failed',
          bounty.reward / 1000, // Estimated hours
          bounty.reward,
        );

        return {
          bountyId: bounty.id,
          status: 'failed',
          solution,
          error: solution.error,
          duration: Date.now() - startTime,
        };
      }

      // 3. Check confidence threshold
      if (solution.confidence < this.config.minConfidenceToSubmit) {
        console.log(
          `[BountyExecutor] Confidence ${solution.confidence.toFixed(2)} below threshold ${this.config.minConfidenceToSubmit}`,
        );
        return {
          bountyId: bounty.id,
          status: 'skipped',
          solution,
          error: 'Confidence below threshold',
          duration: Date.now() - startTime,
        };
      }

      // 4. Submit PR (if autoSubmit enabled and not dry run)
      if (this.config.autoSubmit && !this.config.dryRun) {
        console.log('[BountyExecutor] Submitting PR...');
        const submission = await this.prPipeline.submitBounty(
          bounty,
          solution.changes,
          solution.description,
        );

        if (submission) {
          // Record potential revenue (map 'token' to 'USD' for revenue tracking)
          const revenueCurrency = bounty.currency === 'token' ? 'USD' : bounty.currency;
          this.revenueTracker.record({
            source: 'bounty',
            amount: bounty.reward,
            currency: revenueCurrency,
            metadata: {
              bountyId: bounty.id,
              platform: bounty.platform,
              prUrl: submission.prUrl,
              status: 'pending',
            },
          });

          console.log(`[BountyExecutor] PR submitted: ${submission.prUrl}`);

          return {
            bountyId: bounty.id,
            status: 'success',
            solution,
            submission,
            duration: Date.now() - startTime,
          };
        } else {
          return {
            bountyId: bounty.id,
            status: 'failed',
            solution,
            error: 'PR submission failed',
            duration: Date.now() - startTime,
          };
        }
      }

      // Dry run or no auto-submit
      return {
        bountyId: bounty.id,
        status: 'success',
        solution,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[BountyExecutor] Error executing bounty:`, error);

      // Record failure
      await this.rsiFeedback.recordFailure(
        bounty as any,
        String(error),
        bounty.reward / 1000,
        bounty.reward,
      );

      return {
        bountyId: bounty.id,
        status: 'failed',
        error: String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    activeExecutions: number;
    hunterStats: BountyHunterStats;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      hunterStats: this.hunter.getStats(),
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let bountyExecutorInstance: BountyExecutor | null = null;

export function getBountyExecutor(config?: Partial<BountyExecutorConfig>): BountyExecutor {
  if (!bountyExecutorInstance) {
    bountyExecutorInstance = new BountyExecutor(config);
  }
  return bountyExecutorInstance;
}

export function resetBountyExecutor(): void {
  bountyExecutorInstance = null;
}
