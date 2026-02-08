/**
 * Bounty Orchestrator v20.0
 *
 * The brain of the bounty economy - coordinates all modules through:
 * - Event Bus: All communication via typed events
 * - Memory System: Long-term learning storage
 * - Active Inference: EFE-based bounty selection
 * - Email Integration: Real-time feedback via Gmail
 * - Dashboard: Live status visualization
 * - Agent Swarm: Multi-agent collaborative solving
 *
 * This is the ultimate integrated bounty hunting system.
 *
 * @module economy/bounty-orchestrator
 * @version 20.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getMCPClient } from '../mcp/index.js';
import type { MCPServerName } from '../types.js';
import { getHybridRouter } from '../llm/router.js';
import { getMemorySystem } from '../memory/index.js';

// Import all bounty modules
import { getBountyHunter, type Bounty } from './generators/bounty-hunter.js';
import { getBountyExecutor, type ExecutionResult } from './bounty-executor.js';
import { classifyBounty, scoreBountyIntelligently, type BountyClassification } from './bounty-intelligence.js';
import { getBountyLearning } from './bounty-learning.js';
import { getFeedbackAnalyzer } from './feedback-analyzer.js';
import { getFeedbackLoop } from './feedback-loop.js';
import { getAutoRevision } from './auto-revision.js';
import { getMultiValidator } from './multi-validator.js';
import { getRepoStyleLearner } from './repo-style-learner.js';
import { getTestGenerator } from './test-generator.js';
import { getSmartRetry } from './smart-retry.js';
import { getSuccessPatterns } from './success-patterns.js';
import { getMaintainerProfiler } from './maintainer-profiler.js';
import { getPRTemplateMatcher } from './pr-template-matcher.js';
import { getPortfolioTracker, type PortfolioStats } from './portfolio-tracker.js';
import { getCommitOptimizer } from './commit-optimizer.js';
import { getIssueAnalyzer, type IssueAnalysis } from './issue-analyzer.js';
import { getCompetitionDetector, type CompetitionAnalysis } from './competition-detector.js';
import { getSolutionComparator } from './solution-comparator.js';
import { getModelSelector } from './model-selector.js';
import { getBountySwarm, type BountySwarm, type SwarmResult } from './bounty-swarm.js';

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorConfig {
  // Mode
  mode: 'autonomous' | 'supervised' | 'learning-only';

  // Thresholds
  minEFEScore: number;  // Minimum Expected Free Energy score to pursue
  minSuccessProbability: number;  // Minimum estimated success probability
  maxConcurrentBounties: number;

  // Integrations
  enableEmailMonitoring: boolean;
  enableDashboardUpdates: boolean;
  enableMemoryPersistence: boolean;
  enableContentSharing: boolean;

  // Limits
  dailyBountyLimit: number;
  dailyBudget: number;

  // Learning
  learningRate: number;
  explorationRate: number;  // For exploration vs exploitation
}

export interface OrchestratorState {
  status: 'idle' | 'scanning' | 'analyzing' | 'solving' | 'submitting' | 'learning';
  activeBounties: Map<string, ActiveBounty>;
  pendingFeedback: string[];
  todayStats: {
    bountiesAttempted: number;
    bountiesCompleted: number;
    bountiesFailed: number;
    revenue: number;
    spent: number;
  };
  lastCycleTime: Date;
  cycleCount: number;
}

export interface ActiveBounty {
  bounty: Bounty;
  classification: BountyClassification;
  issueAnalysis?: IssueAnalysis;
  competitionAnalysis?: CompetitionAnalysis;
  efeScore: number;
  startedAt: Date;
  phase: 'analyzing' | 'generating' | 'validating' | 'submitting' | 'awaiting-feedback';
  attempts: number;
  lastError?: string;
}

export interface BountyEvent {
  type: string;
  bountyId: string;
  timestamp: Date;
  data: any;
}

// Bounty-specific event types for the event bus
export type BountyEventType =
  | 'bounty.discovered'
  | 'bounty.analyzed'
  | 'bounty.selected'
  | 'bounty.started'
  | 'bounty.solution.generated'
  | 'bounty.solution.validated'
  | 'bounty.submitted'
  | 'bounty.feedback.received'
  | 'bounty.completed'
  | 'bounty.failed'
  | 'bounty.payment.received'
  | 'bounty.learning.captured';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  mode: 'autonomous',
  minEFEScore: 0.6,
  minSuccessProbability: 0.5,
  maxConcurrentBounties: 3,
  enableEmailMonitoring: true,
  enableDashboardUpdates: true,
  enableMemoryPersistence: true,
  enableContentSharing: false,
  dailyBountyLimit: 10,
  dailyBudget: 100,
  learningRate: 0.1,
  explorationRate: 0.15,
};

// ============================================================================
// Bounty Orchestrator
// ============================================================================

export class BountyOrchestrator {
  private config: OrchestratorConfig;
  private state: OrchestratorState;
  private bus: GenesisEventBus;
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private persistPath: string;

  // Module references
  private hunter = getBountyHunter();
  private executor = getBountyExecutor();
  private swarm = getBountySwarm();
  private learningEngine = getBountyLearning();
  private feedbackAnalyzer = getFeedbackAnalyzer();
  private feedbackLoop = getFeedbackLoop();
  private issueAnalyzer = getIssueAnalyzer();
  private competitionDetector = getCompetitionDetector();
  private solutionComparator = getSolutionComparator();
  private modelSelector = getModelSelector();
  private portfolioTracker = getPortfolioTracker();
  private successPatterns = getSuccessPatterns();
  private maintainerProfiler = getMaintainerProfiler();
  private prTemplateMatcher = getPRTemplateMatcher();

  // Email monitoring
  private emailCheckInterval: NodeJS.Timeout | null = null;
  private lastEmailCheck: Date = new Date(0);

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.persistPath = '.genesis/bounty-orchestrator.json';
    this.bus = getEventBus();

    this.state = {
      status: 'idle',
      activeBounties: new Map(),
      pendingFeedback: [],
      todayStats: {
        bountiesAttempted: 0,
        bountiesCompleted: 0,
        bountiesFailed: 0,
        revenue: 0,
        spent: 0,
      },
      lastCycleTime: new Date(),
      cycleCount: 0,
    };

    this.load();
    this.setupEventHandlers();
  }

  // ===========================================================================
  // Event Bus Integration
  // ===========================================================================

  private setupEventHandlers(): void {
    // Listen for economic events using prefix matching
    this.bus.subscribePrefix('economy.', async (event: any) => {
      if (event.topic === 'economy.revenue.recorded' && event.source === 'bounty') {
        await this.handlePaymentReceived(event);
      }
    });

    // Listen for neuromodulation (for adaptive behavior)
    this.bus.subscribePrefix('neuromod.', (event: any) => {
      if (event.topic === 'neuromod.fatigue' && event.magnitude > 0.8) {
        console.log('[Orchestrator] High fatigue detected, reducing activity');
        this.config.dailyBountyLimit = Math.max(1, this.config.dailyBountyLimit - 2);
      }
      if (event.topic === 'neuromod.novelty' && event.magnitude > 0.7) {
        console.log('[Orchestrator] High novelty - increasing exploration');
        this.config.explorationRate = Math.min(0.4, this.config.explorationRate + 0.1);
      }
    });
  }

  private emitEvent(type: BountyEventType, bountyId: string, data: any): void {
    // Emit using publish with any type (bounty events are not in core event map)
    try {
      (this.bus as any).publish(type, {
        bountyId,
        timestamp: new Date().toISOString(),
        source: 'bounty-orchestrator',
        ...data,
      });
    } catch {
      // Event bus may not support custom topics
    }

    // Log for dashboard (would be picked up by SSE)
    console.log(`[Orchestrator:Event] ${type}: ${bountyId}`);
  }

  // ===========================================================================
  // Main Orchestration Loop
  // ===========================================================================

  /**
   * Run a complete bounty hunting cycle
   */
  async runCycle(): Promise<{ selected: number; started: number; completed: number }> {
    console.log('\n[Orchestrator] ═══════════════════════════════════════');
    console.log('[Orchestrator] Starting bounty cycle #' + (this.state.cycleCount + 1));
    console.log('[Orchestrator] ═══════════════════════════════════════\n');

    this.state.cycleCount++;
    this.state.lastCycleTime = new Date();
    let selected = 0, started = 0, completed = 0;

    try {
      // Phase 1: Check for feedback on pending submissions
      this.state.status = 'learning';
      await this.checkPendingFeedback();

      // Phase 2: Check email for real-time updates
      if (this.config.enableEmailMonitoring) {
        await this.checkEmailFeedback();
      }

      // Phase 3: Scan for new bounties
      this.state.status = 'scanning';
      console.log('[Orchestrator] Phase 1: Scanning for bounties...');
      await this.hunter.scan();
      const allBounties = this.hunter.getAllBounties();
      console.log(`[Orchestrator] Found ${allBounties.length} bounties`);

      // Phase 4: Analyze and rank bounties using Active Inference
      this.state.status = 'analyzing';
      console.log('[Orchestrator] Phase 2: Analyzing with Active Inference...');
      const rankedBounties = await this.rankBountiesWithEFE(allBounties);
      console.log(`[Orchestrator] Top candidates: ${rankedBounties.slice(0, 3).map(b => b.bounty.title.slice(0, 40)).join(', ')}`);

      // Phase 5: Select bounties to pursue
      const selectedBounties = this.selectBountiesToPursue(rankedBounties);
      selected = selectedBounties.length;
      console.log(`[Orchestrator] Selected ${selected} bounties to pursue`);

      // Phase 6: Execute selected bounties
      this.state.status = 'solving';
      for (const candidate of selectedBounties) {
        const result = await this.executeBounty(candidate);
        if (result.status === 'success') {
          started++;
          if (result.submission?.status === 'merged') {
            completed++;
          }
        }
      }

      // Phase 7: Consolidate learnings to memory
      this.state.status = 'learning';
      if (this.config.enableMemoryPersistence) {
        await this.consolidateLearnings();
      }

      this.state.status = 'idle';
      this.save();

      console.log('\n[Orchestrator] ═══════════════════════════════════════');
      console.log(`[Orchestrator] Cycle complete: ${selected} selected, ${started} started, ${completed} completed`);
      console.log('[Orchestrator] ═══════════════════════════════════════\n');

    } catch (error) {
      console.error('[Orchestrator] Cycle error:', error);
      this.state.status = 'idle';
    }

    return { selected, started, completed };
  }

  // ===========================================================================
  // Active Inference Bounty Selection
  // ===========================================================================

  /**
   * Rank bounties using Expected Free Energy (EFE)
   */
  private async rankBountiesWithEFE(bounties: Bounty[]): Promise<Array<{
    bounty: Bounty;
    classification: BountyClassification;
    issueAnalysis?: IssueAnalysis;
    competition?: CompetitionAnalysis;
    efeScore: number;
    reasoning: string[];
  }>> {
    const ranked: Array<{
      bounty: Bounty;
      classification: BountyClassification;
      issueAnalysis?: IssueAnalysis;
      competition?: CompetitionAnalysis;
      efeScore: number;
      reasoning: string[];
    }> = [];

    // Process bounties in parallel batches
    const batchSize = 5;
    for (let i = 0; i < bounties.length; i += batchSize) {
      const batch = bounties.slice(i, i + batchSize);

      const analyses = await Promise.all(batch.map(async (bounty) => {
        const reasoning: string[] = [];

        // 1. Classify bounty
        const classification = classifyBounty(bounty);
        reasoning.push(`Type: ${classification.type} (${(classification.confidence * 100).toFixed(0)}%)`);

        // 2. Check if already submitted
        const alreadySubmitted = this.executor.getPRPipeline().getAllSubmissions()
          .some(s => s.bountyId === bounty.id);
        if (alreadySubmitted) {
          return null;  // Skip
        }

        // 3. Check competition
        const competition = await this.competitionDetector.analyze(bounty);
        if (!competition.shouldCompete) {
          reasoning.push(`Skip: ${competition.reasoning[0]}`);
          return null;
        }
        reasoning.push(`Competition: ${competition.competitorType} (${competition.competitorCount})`);

        // 4. Analyze issue for requirements
        let issueAnalysis: IssueAnalysis | undefined;
        if (bounty.sourceMetadata?.issueNumber) {
          const analysis = await this.issueAnalyzer.analyzeBounty(bounty);
          issueAnalysis = analysis ?? undefined;
          if (issueAnalysis) {
            reasoning.push(`Clarity: ${(issueAnalysis.clarity * 100).toFixed(0)}%`);
            if (issueAnalysis.blockers.length > 0) {
              reasoning.push(`Blocker: ${issueAnalysis.blockers[0]}`);
              return null;  // Has blockers, skip
            }
          }
        }

        // 5. Calculate EFE score (Expected Free Energy)
        const efeScore = this.calculateEFE(bounty, classification, competition, issueAnalysis);
        reasoning.push(`EFE Score: ${(efeScore * 100).toFixed(0)}%`);

        // 6. Check minimum threshold
        if (efeScore < this.config.minEFEScore) {
          reasoning.push(`Below threshold (${(this.config.minEFEScore * 100).toFixed(0)}%)`);
          return null;
        }

        // Emit discovery event
        this.emitEvent('bounty.analyzed', bounty.id, {
          title: bounty.title,
          efeScore,
          classification: classification.type,
        });

        return {
          bounty,
          classification,
          issueAnalysis,
          competition,
          efeScore,
          reasoning,
        };
      }));

      // Filter out nulls and add to ranked
      ranked.push(...analyses.filter((a): a is NonNullable<typeof a> => a !== null));
    }

    // Sort by EFE score (highest first)
    ranked.sort((a, b) => b.efeScore - a.efeScore);

    return ranked;
  }

  /**
   * Calculate Expected Free Energy for a bounty
   *
   * EFE = Expected Information Gain + Expected Reward
   * Lower EFE = better choice
   *
   * We invert it for scoring (higher = better)
   */
  private calculateEFE(
    bounty: Bounty,
    classification: BountyClassification,
    competition: CompetitionAnalysis,
    issueAnalysis?: IssueAnalysis
  ): number {
    // === Component 1: Epistemic Value (Information Gain) ===
    // Higher if bounty teaches us something new
    let epistemicValue = 0.5;

    // Novel bounty type increases epistemic value
    const typeSuccessRate = this.learningEngine.getTypeSuccessRate(classification.type);
    if (typeSuccessRate < 0.3) {
      epistemicValue += 0.2;  // Learning opportunity
    }

    // New repository increases epistemic value
    const repoKey = `${bounty.sourceMetadata?.org}/${bounty.sourceMetadata?.repo}`;
    const repoHistory = this.portfolioTracker.getStats();
    const isNewRepo = !Object.keys(repoHistory.revenueByPlatform).includes(repoKey);
    if (isNewRepo) {
      epistemicValue += 0.15;
    }

    // === Component 2: Pragmatic Value (Expected Reward) ===
    let pragmaticValue = 0;

    // Base reward value (normalized to $500 max)
    pragmaticValue += Math.min(1, bounty.reward / 500) * 0.3;

    // Success probability from classification
    pragmaticValue += classification.aiSuitability * 0.3;

    // Historical success rate for this type
    pragmaticValue += typeSuccessRate * 0.2;

    // Competition penalty
    pragmaticValue -= competition.competitionRisk * 0.15;

    // Issue clarity bonus
    if (issueAnalysis) {
      pragmaticValue += issueAnalysis.clarity * 0.15;
    }

    // === Component 3: Risk Adjustment ===
    let riskPenalty = 0;

    // Difficulty penalty
    riskPenalty += classification.estimatedDifficulty * 0.1;

    // Competition risk
    if (competition.advantage === 'late') riskPenalty += 0.1;
    if (competition.advantage === 'too-late') riskPenalty += 0.3;

    // Breaking change risk
    if (issueAnalysis?.breakingChangeLikelihood && issueAnalysis.breakingChangeLikelihood > 0.5) {
      riskPenalty += 0.15;
    }

    // === Component 4: Exploration Bonus ===
    let explorationBonus = 0;
    if (Math.random() < this.config.explorationRate) {
      explorationBonus = 0.2;  // Random exploration
    }

    // === Final EFE Score ===
    const efeScore = Math.max(0, Math.min(1,
      epistemicValue * 0.2 +
      pragmaticValue * 0.5 +
      (1 - riskPenalty) * 0.2 +
      explorationBonus * 0.1
    ));

    return efeScore;
  }

  /**
   * Select bounties to pursue based on constraints
   */
  private selectBountiesToPursue(ranked: Array<{
    bounty: Bounty;
    classification: BountyClassification;
    issueAnalysis?: IssueAnalysis;
    competition?: CompetitionAnalysis;
    efeScore: number;
    reasoning: string[];
  }>): typeof ranked {
    const selected: typeof ranked = [];

    // Check daily limits
    const remaining = this.config.dailyBountyLimit - this.state.todayStats.bountiesAttempted;
    if (remaining <= 0) {
      console.log('[Orchestrator] Daily bounty limit reached');
      return [];
    }

    // Check concurrent limit
    const activeCount = this.state.activeBounties.size;
    const slots = this.config.maxConcurrentBounties - activeCount;
    if (slots <= 0) {
      console.log('[Orchestrator] Max concurrent bounties reached');
      return [];
    }

    // Select top bounties up to limit
    for (const candidate of ranked.slice(0, Math.min(remaining, slots))) {
      // Check success probability
      if (candidate.classification.aiSuitability >= this.config.minSuccessProbability) {
        selected.push(candidate);

        this.emitEvent('bounty.selected', candidate.bounty.id, {
          title: candidate.bounty.title,
          efeScore: candidate.efeScore,
          reward: candidate.bounty.reward,
        });
      }
    }

    return selected;
  }

  // ===========================================================================
  // Bounty Execution
  // ===========================================================================

  /**
   * Execute a single bounty with full orchestration
   */
  private async executeBounty(candidate: {
    bounty: Bounty;
    classification: BountyClassification;
    issueAnalysis?: IssueAnalysis;
    competition?: CompetitionAnalysis;
    efeScore: number;
  }): Promise<ExecutionResult> {
    const { bounty, classification, issueAnalysis, efeScore } = candidate;

    // Create active bounty record
    const activeBounty: ActiveBounty = {
      bounty,
      classification,
      issueAnalysis,
      competitionAnalysis: candidate.competition,
      efeScore,
      startedAt: new Date(),
      phase: 'analyzing',
      attempts: 0,
    };

    this.state.activeBounties.set(bounty.id, activeBounty);
    this.state.todayStats.bountiesAttempted++;

    this.emitEvent('bounty.started', bounty.id, {
      title: bounty.title,
      classification: classification.type,
      efeScore,
    });

    console.log(`\n[Orchestrator] ▶ Executing: ${bounty.title}`);
    console.log(`[Orchestrator]   Type: ${classification.type}, EFE: ${(efeScore * 100).toFixed(0)}%`);

    // Determine if this bounty requires multi-agent swarm solving
    const complexTypes = ['feature', 'refactor', 'architecture', 'integration', 'security', 'performance'];
    const isComplex = complexTypes.includes(classification.type) ||
                      classification.estimatedDifficulty > 0.7 ||
                      (issueAnalysis?.estimatedComplexity && issueAnalysis.estimatedComplexity > 6);

    try {
      activeBounty.phase = 'generating';
      let result: ExecutionResult;

      if (isComplex) {
        // Route complex bounties through the multi-agent swarm
        console.log(`[Orchestrator]   Using Swarm (complex: ${classification.type}, difficulty: ${classification.estimatedDifficulty.toFixed(2)})`);

        const swarmResult = await this.swarm.solve(bounty, classification, issueAnalysis);

        // Convert SwarmResult to ExecutionResult
        result = {
          bountyId: bounty.id,
          status: swarmResult.success ? 'success' : 'failed',
          solution: swarmResult.solution ? {
            success: swarmResult.success,
            changes: swarmResult.solution.changes,
            description: swarmResult.solution.prDescription,
            confidence: swarmResult.solution.confidence,
          } : undefined,
          error: swarmResult.success ? undefined : (swarmResult.error || 'Swarm solving failed'),
          duration: swarmResult.totalTime,
        };
      } else {
        // Route simple bounties through the standard executor
        console.log(`[Orchestrator]   Using Executor (simple: ${classification.type})`);
        result = await this.executor.executeBounty(bounty);
      }

      if (result.status === 'success' && result.submission) {
        activeBounty.phase = 'awaiting-feedback';
        this.state.pendingFeedback.push(bounty.id);

        this.emitEvent('bounty.submitted', bounty.id, {
          prUrl: result.submission.prUrl,
          confidence: result.solution?.confidence,
        });

        console.log(`[Orchestrator] ✓ Submitted: ${result.submission.prUrl}`);

      } else if (result.status === 'failed') {
        this.state.todayStats.bountiesFailed++;
        activeBounty.lastError = result.error;

        this.emitEvent('bounty.failed', bounty.id, {
          error: result.error,
          duration: result.duration,
        });

        console.log(`[Orchestrator] ✗ Failed: ${result.error}`);

        // Store failure in memory for learning
        await this.storeFailureInMemory(bounty, classification, result.error || 'Unknown');
      }

      return result;

    } catch (error) {
      this.state.todayStats.bountiesFailed++;
      activeBounty.lastError = String(error);

      this.emitEvent('bounty.failed', bounty.id, { error: String(error) });

      return {
        bountyId: bounty.id,
        status: 'failed',
        error: String(error),
        duration: Date.now() - activeBounty.startedAt.getTime(),
      };

    } finally {
      // Remove from active if not awaiting feedback
      if (activeBounty.phase !== 'awaiting-feedback') {
        this.state.activeBounties.delete(bounty.id);
      }
      this.save();
    }
  }

  // ===========================================================================
  // Email Integration
  // ===========================================================================

  /**
   * Check email for PR feedback notifications
   */
  private async checkEmailFeedback(): Promise<void> {
    console.log('[Orchestrator] Checking email for PR updates...');

    try {
      // Get recent emails
      const emails = await this.mcp.call('gmail' as MCPServerName, 'list_emails_metadata', {
        query: 'from:notifications@github.com subject:(pull request OR PR) newer_than:1d',
        max_results: 20,
      });

      if (!emails?.data || emails.data.length === 0) {
        return;
      }

      // Filter for new emails since last check
      const newEmails = emails.data.filter((e: any) => {
        const emailDate = new Date(e.date);
        return emailDate > this.lastEmailCheck;
      });

      if (newEmails.length === 0) {
        return;
      }

      console.log(`[Orchestrator] Found ${newEmails.length} new PR-related emails`);

      // Get content for new emails
      const emailIds = newEmails.map((e: any) => e.id);
      const contents = await this.mcp.call('gmail' as MCPServerName, 'get_emails_content', {
        email_ids: emailIds,
      });

      if (!contents?.data) return;

      // Process each email
      for (const email of contents.data) {
        await this.processEmailFeedback(email);
      }

      this.lastEmailCheck = new Date();

    } catch (error) {
      console.warn('[Orchestrator] Email check failed:', error);
    }
  }

  /**
   * Process a single email for PR feedback
   */
  private async processEmailFeedback(email: any): Promise<void> {
    const subject = email.subject || '';
    const body = email.body || '';

    // Extract PR number and repo
    const prMatch = subject.match(/\[([^\]]+)\] (?:Re: )?(?:PR|Pull request) #(\d+)/i);
    if (!prMatch) return;

    const repo = prMatch[1];
    const prNumber = parseInt(prMatch[2], 10);

    // Find matching pending bounty
    for (const bountyId of this.state.pendingFeedback) {
      const active = this.state.activeBounties.get(bountyId);
      if (!active) continue;

      const bountyRepo = `${active.bounty.sourceMetadata?.org}/${active.bounty.sourceMetadata?.repo}`;
      if (bountyRepo === repo) {
        // This email is about our PR
        console.log(`[Orchestrator] Email feedback for ${repo} PR #${prNumber}`);

        // Determine feedback type
        if (body.includes('approved') || body.includes('merged')) {
          await this.handlePRMerged({ bountyId, prNumber, repo });
        } else if (body.includes('requested changes') || body.includes('changes requested')) {
          await this.handlePRFeedback({
            bountyId,
            prNumber,
            repo,
            feedback: body.slice(0, 1000),
          });
        } else if (body.includes('closed')) {
          await this.handlePRClosed({ bountyId, prNumber, repo });
        }

        break;
      }
    }
  }

  // ===========================================================================
  // Feedback Handlers
  // ===========================================================================

  private async handlePRFeedback(event: any): Promise<void> {
    const { bountyId, feedback } = event;

    console.log(`[Orchestrator] PR feedback received for ${bountyId}`);

    this.emitEvent('bounty.feedback.received', bountyId, {
      type: 'changes_requested',
      feedback: feedback?.slice(0, 200),
    });

    // Trigger auto-revision if configured
    if (this.config.mode === 'autonomous') {
      const active = this.state.activeBounties.get(bountyId);
      if (active && active.attempts < 3) {
        console.log('[Orchestrator] Triggering auto-revision...');
        active.attempts++;
        // Auto-revision logic would go here
      }
    }
  }

  private async handlePRMerged(event: any): Promise<void> {
    const { bountyId } = event;

    console.log(`[Orchestrator] 🎉 PR merged for ${bountyId}`);

    this.state.todayStats.bountiesCompleted++;
    this.state.pendingFeedback = this.state.pendingFeedback.filter(id => id !== bountyId);

    const active = this.state.activeBounties.get(bountyId);
    if (active) {
      this.emitEvent('bounty.completed', bountyId, {
        reward: active.bounty.reward,
        duration: Date.now() - active.startedAt.getTime(),
      });

      // Store success in memory
      await this.storeSuccessInMemory(active.bounty, active.classification);

      // Update portfolio
      this.portfolioTracker.recordOutcomeByBountyId(bountyId, 'accepted', active.bounty.reward);
    }

    this.state.activeBounties.delete(bountyId);
    this.save();
  }

  private async handlePRClosed(event: any): Promise<void> {
    const { bountyId } = event;

    console.log(`[Orchestrator] ✗ PR closed/rejected for ${bountyId}`);

    this.state.todayStats.bountiesFailed++;
    this.state.pendingFeedback = this.state.pendingFeedback.filter(id => id !== bountyId);

    const active = this.state.activeBounties.get(bountyId);
    if (active) {
      this.emitEvent('bounty.failed', bountyId, {
        reason: 'PR closed',
        duration: Date.now() - active.startedAt.getTime(),
      });

      // Store failure for learning
      await this.storeFailureInMemory(active.bounty, active.classification, 'PR rejected');

      // Update portfolio
      this.portfolioTracker.recordOutcomeByBountyId(bountyId, 'rejected', 0);
    }

    this.state.activeBounties.delete(bountyId);
    this.save();
  }

  private async handlePaymentReceived(event: any): Promise<void> {
    const { bountyId, amount } = event;

    console.log(`[Orchestrator] 💰 Payment received: $${amount} for ${bountyId}`);

    this.state.todayStats.revenue += amount;

    this.emitEvent('bounty.payment.received', bountyId, { amount });

    // Update portfolio
    this.portfolioTracker.recordOutcomeByBountyId(bountyId, 'paid', amount);

    this.save();
  }

  // ===========================================================================
  // Memory Integration
  // ===========================================================================

  /**
   * Store successful bounty pattern in memory
   */
  private async storeSuccessInMemory(bounty: Bounty, classification: BountyClassification): Promise<void> {
    if (!this.config.enableMemoryPersistence) return;

    try {
      const memory = getMemorySystem();

      // Store as semantic fact using MemorySystem.learn()
      memory.learn({
        concept: `bounty-success-${bounty.id}`,
        definition: `Successfully completed ${classification.type} bounty: "${bounty.title}" for $${bounty.reward}`,
        category: 'bounty-outcomes',
        confidence: 0.9,
      });

      // Store as procedural skill using MemorySystem.learnSkill()
      memory.learnSkill({
        name: `${classification.type}-bounty-pattern`,
        description: `Pattern for solving ${classification.type} bounties like "${bounty.title}"`,
        steps: [
          { action: 'Analyze issue requirements' },
          { action: 'Generate solution matching repo style' },
          { action: 'Validate with multi-model consensus' },
          { action: 'Submit with compliant PR description' },
        ],
      });

      console.log('[Orchestrator] Success pattern stored in memory');

    } catch (error) {
      console.warn('[Orchestrator] Failed to store in memory:', error);
    }
  }

  /**
   * Store failure for learning
   */
  private async storeFailureInMemory(bounty: Bounty, classification: BountyClassification, errorMsg: string): Promise<void> {
    if (!this.config.enableMemoryPersistence) return;

    try {
      const memory = getMemorySystem();

      // Store as episodic memory using MemorySystem.remember()
      memory.remember({
        what: `Failed ${classification.type} bounty: ${errorMsg}`,
        when: new Date(),
        where: { location: bounty.platform, context: 'bounty-hunting' },
        who: { agents: ['genesis-ai'] },
        tags: ['bounty', 'failure', classification.type],
        details: {
          bountyId: bounty.id,
          bountyType: classification.type,
          difficulty: classification.estimatedDifficulty,
          error: errorMsg,
        },
        importance: 0.7,
      });

      console.log('[Orchestrator] Failure stored in memory for learning');

    } catch (err) {
      console.warn('[Orchestrator] Failed to store failure:', err);
    }
  }

  /**
   * Consolidate daily learnings into long-term memory
   */
  private async consolidateLearnings(): Promise<void> {
    if (!this.config.enableMemoryPersistence) return;

    console.log('[Orchestrator] Consolidating learnings to memory...');

    try {
      const memory = getMemorySystem();
      const stats = this.portfolioTracker.getStats();

      // Store daily summary using MemorySystem.learn()
      memory.learn({
        concept: `daily-summary-${new Date().toISOString().split('T')[0]}`,
        definition: `Daily bounty summary: ${stats.completedBounties} completed, ${stats.failedBounties} failed, $${stats.totalRevenue} revenue, ${(stats.successRate * 100).toFixed(0)}% success rate`,
        category: 'bounty-daily-summary',
        confidence: 1,
      });

      // Trigger memory consolidation (sleep-like process)
      await memory.sleep();
      console.log('[Orchestrator] Memory consolidation complete');

    } catch (error) {
      console.warn('[Orchestrator] Memory consolidation failed:', error);
    }
  }

  // ===========================================================================
  // Pending Feedback Check
  // ===========================================================================

  private async checkPendingFeedback(): Promise<void> {
    if (this.state.pendingFeedback.length === 0) return;

    console.log(`[Orchestrator] Checking ${this.state.pendingFeedback.length} pending PRs...`);

    const result = await this.executor.checkAndRecordRevenue();
    if (result.merged > 0) {
      console.log(`[Orchestrator] ${result.merged} PRs merged, $${result.revenue} revenue`);
      this.state.todayStats.revenue += result.revenue;
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Start autonomous bounty hunting
   */
  startAutonomous(intervalMs: number = 30 * 60 * 1000): void {
    console.log(`[Orchestrator] Starting autonomous mode (interval: ${intervalMs / 60000}min)`);

    this.config.mode = 'autonomous';

    // Run immediately
    this.runCycle();

    // Then on interval
    setInterval(() => this.runCycle(), intervalMs);

    // Start email monitoring if enabled
    if (this.config.enableEmailMonitoring) {
      this.emailCheckInterval = setInterval(() => this.checkEmailFeedback(), 5 * 60 * 1000);
    }
  }

  /**
   * Stop autonomous mode
   */
  stop(): void {
    if (this.emailCheckInterval) {
      clearInterval(this.emailCheckInterval);
      this.emailCheckInterval = null;
    }
    this.config.mode = 'learning-only';
    console.log('[Orchestrator] Stopped');
  }

  /**
   * Get current state
   */
  getState(): OrchestratorState {
    return { ...this.state };
  }

  /**
   * Get stats summary
   */
  getStats(): {
    today: OrchestratorState['todayStats'];
    portfolio: PortfolioStats;
    config: OrchestratorConfig;
  } {
    return {
      today: this.state.todayStats,
      portfolio: this.portfolioTracker.getStats(),
      config: this.config,
    };
  }

  /**
   * Generate comprehensive report
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              BOUNTY ORCHESTRATOR REPORT v20                  ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝\n');

    lines.push('📊 TODAY\'S ACTIVITY');
    lines.push('─'.repeat(50));
    lines.push(`Bounties Attempted:  ${stats.today.bountiesAttempted}`);
    lines.push(`Bounties Completed:  ${stats.today.bountiesCompleted}`);
    lines.push(`Bounties Failed:     ${stats.today.bountiesFailed}`);
    lines.push(`Revenue:             $${stats.today.revenue.toFixed(2)}`);
    lines.push(`Spent:               $${stats.today.spent.toFixed(2)}`);
    lines.push('');

    lines.push('📈 OVERALL PORTFOLIO');
    lines.push('─'.repeat(50));
    lines.push(`Total Bounties:      ${stats.portfolio.totalBounties}`);
    lines.push(`Success Rate:        ${(stats.portfolio.successRate * 100).toFixed(0)}%`);
    lines.push(`Total Revenue:       $${stats.portfolio.totalRevenue.toFixed(2)}`);
    lines.push(`Reputation:          ${stats.portfolio.reputationScore}/100`);
    lines.push(`Current Streak:      ${stats.portfolio.streak}`);
    lines.push('');

    lines.push('⚙️ CONFIGURATION');
    lines.push('─'.repeat(50));
    lines.push(`Mode:                ${stats.config.mode}`);
    lines.push(`Min EFE Score:       ${(stats.config.minEFEScore * 100).toFixed(0)}%`);
    lines.push(`Exploration Rate:    ${(stats.config.explorationRate * 100).toFixed(0)}%`);
    lines.push(`Daily Limit:         ${stats.config.dailyBountyLimit}`);
    lines.push(`Email Monitoring:    ${stats.config.enableEmailMonitoring ? 'ON' : 'OFF'}`);
    lines.push(`Memory Persistence:  ${stats.config.enableMemoryPersistence ? 'ON' : 'OFF'}`);
    lines.push('');

    if (this.state.activeBounties.size > 0) {
      lines.push('🔄 ACTIVE BOUNTIES');
      lines.push('─'.repeat(50));
      for (const [id, active] of this.state.activeBounties) {
        lines.push(`• ${active.bounty.title.slice(0, 40)} (${active.phase})`);
      }
      lines.push('');
    }

    lines.push(`Generated: ${new Date().toISOString()}`);

    return lines.join('\n');
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        todayStats: this.state.todayStats,
        pendingFeedback: this.state.pendingFeedback,
        cycleCount: this.state.cycleCount,
        lastCycleTime: this.state.lastCycleTime.toISOString(),
        lastEmailCheck: this.lastEmailCheck.toISOString(),
      };

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Orchestrator] Save failed:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      // Reset daily stats if new day
      const today = new Date().toISOString().split('T')[0];
      const lastCycleDate = data.lastCycleTime?.split('T')[0];

      if (lastCycleDate === today) {
        this.state.todayStats = data.todayStats || this.state.todayStats;
      }

      this.state.pendingFeedback = data.pendingFeedback || [];
      this.state.cycleCount = data.cycleCount || 0;
      this.lastEmailCheck = data.lastEmailCheck ? new Date(data.lastEmailCheck) : new Date(0);

      console.log(`[Orchestrator] Loaded: ${this.state.pendingFeedback.length} pending, cycle #${this.state.cycleCount}`);
    } catch (error) {
      console.error('[Orchestrator] Load failed:', error);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let orchestrator: BountyOrchestrator | null = null;

export function getBountyOrchestrator(config?: Partial<OrchestratorConfig>): BountyOrchestrator {
  if (!orchestrator) {
    orchestrator = new BountyOrchestrator(config);
  }
  return orchestrator;
}

export function resetBountyOrchestrator(): void {
  if (orchestrator) {
    orchestrator.stop();
  }
  orchestrator = null;
}
