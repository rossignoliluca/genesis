/**
 * Genesis Economic Layer - FASE 1
 *
 * Self-funding capabilities for autonomous operation:
 * - Stripe Treasury: Fiat payments, subscriptions, virtual cards
 * - Coinbase AgentKit: Crypto wallet, stablecoins, on-chain actions
 * - x402 Protocol: HTTP 402 micropayments
 *
 * All MCP interactions are mocked until real servers are connected.
 */

import { getMCPClient } from '../mcp/index.js';
import type { MCPServerName } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface TreasuryBalance {
  fiat: number;       // USD balance in Stripe
  crypto: {
    usdc: number;
    eth: number;
    sol: number;
  };
  pending: number;    // Pending transactions
  lastUpdated: string;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  method?: 'stripe' | 'crypto' | 'auto';
  priority?: 'low' | 'normal' | 'high';
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  method?: string;
  error?: string;
}

export interface SubscriptionConfig {
  name: string;
  priceUSD: number;
  interval: 'month' | 'year';
  features: string[];
}

export interface VirtualCard {
  id: string;
  last4: string;
  expMonth: number;
  expYear: number;
  spending: { limit: number; current: number };
  status: 'active' | 'frozen' | 'cancelled';
}

export interface BudgetConfig {
  dailyLimit: number;
  perTransactionLimit: number;
  monthlyLimit: number;
  requireApprovalAbove: number;
}

// ============================================================================
// Stripe Treasury (Fiat Operations)
// ============================================================================

export class StripeTreasury {
  private connected = false;

  async connect(): Promise<boolean> {
    if (!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_API_KEY) {
      console.warn('[StripeTreasury] No STRIPE_SECRET_KEY or STRIPE_API_KEY configured');
      return false;
    }
    this.connected = true;
    return true;
  }

  async getBalance(): Promise<{ available: number; pending: number } | null> {
    if (!this.connected) return null;

    try {
      const client = getMCPClient();
      const result = await client.call('stripe' as MCPServerName, 'get_balance', {});
      if (result.success) {
        return {
          available: result.data?.available || 0,
          pending: result.data?.pending || 0,
        };
      }
    } catch (error) {
      console.warn('[StripeTreasury] Balance check failed:', error);
    }
    return { available: 0, pending: 0 };
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Stripe' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('stripe' as MCPServerName, 'create_payment_intent', {
        amount: Math.round(request.amount * 100), // Convert to cents
        currency: request.currency.toLowerCase(),
        description: request.description,
      });

      if (result.success) {
        return {
          success: true,
          transactionId: result.data?.id,
          method: 'stripe',
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createSubscription(config: SubscriptionConfig): Promise<{ priceId?: string; url?: string } | null> {
    if (!this.connected) return null;

    try {
      const client = getMCPClient();

      // Create product
      const productResult = await client.call('stripe' as MCPServerName, 'create_product', {
        name: config.name,
        description: `${config.name} - ${config.features.join(', ')}`,
      });

      if (!productResult.success) return null;

      // Create price
      const priceResult = await client.call('stripe' as MCPServerName, 'create_price', {
        product: productResult.data?.id,
        unit_amount: Math.round(config.priceUSD * 100),
        currency: 'usd',
        recurring: { interval: config.interval },
      });

      return {
        priceId: priceResult.data?.id,
        url: `https://checkout.stripe.com/pay/${priceResult.data?.id}`,
      };
    } catch (error) {
      console.error('[StripeTreasury] Subscription creation failed:', error);
      return null;
    }
  }

  async createVirtualCard(spending_limit: number): Promise<VirtualCard | null> {
    if (!this.connected) return null;

    try {
      const client = getMCPClient();
      const result = await client.call('stripe' as MCPServerName, 'create_issuing_card', {
        type: 'virtual',
        spending_controls: {
          spending_limits: [{ amount: Math.round(spending_limit * 100), interval: 'monthly' }],
        },
      });

      if (result.success && result.data) {
        return {
          id: result.data.id,
          last4: result.data.last4,
          expMonth: result.data.exp_month,
          expYear: result.data.exp_year,
          spending: { limit: spending_limit, current: 0 },
          status: 'active',
        };
      }
    } catch (error) {
      console.error('[StripeTreasury] Card creation failed:', error);
    }
    return null;
  }
}

// ============================================================================
// Crypto Wallet (Coinbase AgentKit)
// ============================================================================

export class CryptoWallet {
  private connected = false;

  async connect(): Promise<boolean> {
    if (!process.env.CDP_API_KEY_NAME || !process.env.CDP_API_KEY_PRIVATE_KEY) {
      console.warn('[CryptoWallet] No Coinbase credentials configured');
      return false;
    }
    this.connected = true;
    return true;
  }

  async getBalance(): Promise<{ usdc: number; eth: number; sol: number } | null> {
    if (!this.connected) return null;

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'get_wallet_balance', {});
      if (result.success) {
        return {
          usdc: result.data?.usdc || 0,
          eth: result.data?.eth || 0,
          sol: result.data?.sol || 0,
        };
      }
    } catch (error) {
      console.warn('[CryptoWallet] Balance check failed:', error);
    }
    return { usdc: 0, eth: 0, sol: 0 };
  }

  async sendUSDC(recipient: string, amount: number): Promise<PaymentResult> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Coinbase' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'send_usdc', {
        to: recipient,
        amount: amount.toString(),
      });

      if (result.success) {
        return {
          success: true,
          transactionId: result.data?.hash,
          method: 'crypto-usdc',
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getWalletAddress(): Promise<string | null> {
    if (!this.connected) return null;

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'get_wallet_address', {});
      return result.data?.address || null;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// x402 Micropayments Protocol
// ============================================================================

export class X402Protocol {
  private rates: Map<string, number> = new Map();

  setRate(endpoint: string, pricePerRequest: number): void {
    this.rates.set(endpoint, pricePerRequest);
    if (this.rates.size > 500) {
      // Delete oldest entries
      const keys = Array.from(this.rates.keys());
      for (let i = 0; i < 100; i++) this.rates.delete(keys[i]);
    }
  }

  getRate(endpoint: string): number {
    return this.rates.get(endpoint) || 0;
  }

  generatePaymentHeader(endpoint: string): string | null {
    const rate = this.rates.get(endpoint);
    if (!rate) return null;

    return `x402-price: ${rate}; x402-currency: USD; x402-payment-methods: stripe,usdc`;
  }

  async verifyPayment(header: string): Promise<boolean> {
    // Verify x402 payment proof
    if (!header.startsWith('x402-proof:')) return false;
    // In production, verify the cryptographic proof
    return true;
  }
}

// ============================================================================
// Budget Manager
// ============================================================================

export class BudgetManager {
  private config: BudgetConfig;
  private spending: { daily: number; monthly: number } = { daily: 0, monthly: 0 };
  private lastReset: { daily: Date; monthly: Date };

  constructor(config?: Partial<BudgetConfig>) {
    this.config = {
      dailyLimit: config?.dailyLimit ?? 100,
      perTransactionLimit: config?.perTransactionLimit ?? 50,
      monthlyLimit: config?.monthlyLimit ?? 1000,
      requireApprovalAbove: config?.requireApprovalAbove ?? 50,
    };
    this.lastReset = { daily: new Date(), monthly: new Date() };
  }

  checkBudget(amount: number): { allowed: boolean; requiresApproval: boolean; reason?: string } {
    this.resetIfNeeded();

    if (amount > this.config.perTransactionLimit) {
      return { allowed: false, requiresApproval: true, reason: 'Exceeds per-transaction limit' };
    }

    if (this.spending.daily + amount > this.config.dailyLimit) {
      return { allowed: false, requiresApproval: true, reason: 'Exceeds daily limit' };
    }

    if (this.spending.monthly + amount > this.config.monthlyLimit) {
      return { allowed: false, requiresApproval: true, reason: 'Exceeds monthly limit' };
    }

    const requiresApproval = amount > this.config.requireApprovalAbove;
    return { allowed: true, requiresApproval };
  }

  recordSpending(amount: number): void {
    this.resetIfNeeded();
    this.spending.daily += amount;
    this.spending.monthly += amount;
  }

  getSpending(): { daily: number; monthly: number; limits: BudgetConfig } {
    this.resetIfNeeded();
    return { ...this.spending, limits: this.config };
  }

  private resetIfNeeded(): void {
    const now = new Date();

    if (now.getDate() !== this.lastReset.daily.getDate()) {
      this.spending.daily = 0;
      this.lastReset.daily = now;
    }

    if (now.getMonth() !== this.lastReset.monthly.getMonth()) {
      this.spending.monthly = 0;
      this.lastReset.monthly = now;
    }
  }
}

// ============================================================================
// Unified Economic System
// ============================================================================

export class EconomicSystem {
  public stripe: StripeTreasury;
  public crypto: CryptoWallet;
  public x402: X402Protocol;
  public budget: BudgetManager;

  constructor(budgetConfig?: Partial<BudgetConfig>) {
    this.stripe = new StripeTreasury();
    this.crypto = new CryptoWallet();
    this.x402 = new X402Protocol();
    this.budget = new BudgetManager(budgetConfig);
  }

  async initialize(): Promise<{ stripe: boolean; crypto: boolean }> {
    try {
      const [stripe, crypto] = await Promise.all([
        this.stripe.connect(),
        this.crypto.connect(),
      ]);
      return { stripe, crypto };
    } catch (err) {
      console.error('[economy] initialize failed:', err);
      return { stripe: false, crypto: false };
    }
  }

  async getUnifiedBalance(): Promise<TreasuryBalance> {
    try {
      const [fiatBalance, cryptoBalance] = await Promise.all([
        this.stripe.getBalance(),
        this.crypto.getBalance(),
      ]);

      return {
        fiat: fiatBalance?.available || 0,
        crypto: cryptoBalance || { usdc: 0, eth: 0, sol: 0 },
        pending: fiatBalance?.pending || 0,
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[economy] getUnifiedBalance failed:', err);
      return {
        fiat: 0,
        crypto: { usdc: 0, eth: 0, sol: 0 },
        pending: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Check budget
      const budgetCheck = this.budget.checkBudget(request.amount);
      if (!budgetCheck.allowed && !budgetCheck.requiresApproval) {
        return { success: false, error: budgetCheck.reason };
      }

      // Auto-select payment method if not specified
      let method = request.method || 'auto';
      if (method === 'auto') {
        const balance = await this.getUnifiedBalance();
        method = balance.crypto.usdc >= request.amount ? 'crypto' : 'stripe';
      }

      let result: PaymentResult;
      if (method === 'crypto') {
        result = await this.crypto.sendUSDC(request.recipient, request.amount);
      } else {
        result = await this.stripe.createPayment(request);
      }

      if (result.success) {
        this.budget.recordSpending(request.amount);
      }

      return result;
    } catch (err) {
      console.error('[economy] pay failed:', err);
      return { success: false, error: 'Payment processing failed' };
    }
  }

  async createRevenueStream(
    name: string,
    priceUSD: number,
    type: 'subscription' | 'one-time' = 'subscription'
  ): Promise<{ url?: string; priceId?: string } | null> {
    try {
      if (type === 'subscription') {
        return this.stripe.createSubscription({
          name,
          priceUSD,
          interval: 'month',
          features: ['API access', 'Priority support'],
        });
      }

      // One-time payment link
      const result = await this.stripe.createPayment({
        amount: priceUSD,
        currency: 'USD',
        recipient: 'genesis',
        description: name,
      });

      return result.success ? { url: `https://checkout.stripe.com/pay/${result.transactionId}` } : null;
    } catch (err) {
      console.error('[economy] createRevenueStream failed:', err);
      return null;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let economicSystemInstance: EconomicSystem | null = null;

export function getEconomicSystem(budgetConfig?: Partial<BudgetConfig>): EconomicSystem {
  if (!economicSystemInstance) {
    economicSystemInstance = new EconomicSystem(budgetConfig);
  }
  return economicSystemInstance;
}

export default EconomicSystem;

// ============================================================================
// Re-export Economic Fiber + NESS (v13.0)
// ============================================================================

export {
  EconomicFiber,
  getEconomicFiber,
  resetEconomicFiber,
  type ModuleFiber,
  type CostRecord,
  type RevenueRecord,
  type GlobalSection,
} from './fiber.js';

export {
  NESSMonitor,
  getNESSMonitor,
  resetNESSMonitor,
  type NESSConfig,
  type NESSState,
  type NESSObservation,
} from './ness.js';

// ============================================================================
// Autonomous Economy (v13.1)
// ============================================================================

export {
  AutonomousController,
  getAutonomousController,
  resetAutonomousController,
  type AutonomousConfig,
  type ControllerState,
  type ActivityStatus,
  type CycleResult,
  type PhaseConfig,
} from './autonomous.js';

export {
  CapitalAllocator,
  getCapitalAllocator,
  resetCapitalAllocator,
  type ActivityProfile,
  type AllocationState,
  type AllocatorConfig,
} from './capital-allocator.js';

// Economic Intelligence (Active Inference, v15.0)
export {
  AutonomousNESS,
  getAutonomousNESS,
  EconomicEFE,
  getEconomicEFE,
  EconomicContraction,
  getEconomicContraction,
  resetEconomicIntelligence,
  type AutonomousNESSConfig,
  type AutonomousNESSState,
  type EFEScore,
  type EFEConfig,
  type EconomicContractionState,
} from './economic-intelligence.js';

// Generative Model (Bayesian World Model, v16.0)
export {
  GenerativeEconomicModel,
  getGenerativeModel,
  resetGenerativeModel,
  ActivityBeliefs,
  MarketRegime,
  AdaptiveTemperature,
  TemporalPlanner,
  type ActivityBelief,
  type BeliefConfig,
  type RegimeState,
  type RegimeConfig,
  type RegimeInference,
  type TemperatureConfig,
  type TemperatureState,
  type TemporalPlan,
  type PlannerConfig,
  type GenerativeModelState,
} from './generative-model.js';

// Variational Engine (Precision-Weighted EFE + Risk, v17.0)
export {
  VariationalEngine,
  getVariationalEngine,
  resetVariationalEngine,
  VariationalFreeEnergy,
  PrecisionWeightedEFE,
  CovarianceStructure,
  RiskManager,
  type VFEState,
  type VFEConfig,
  type PrecisionEFEScore,
  type PrecisionEFEConfig,
  type ClusterId,
  type CovarianceConfig,
  type RiskState,
  type RiskConfig,
  type VariationalEngineState,
} from './variational-engine.js';

// Generators
export {
  KeeperExecutor,
  getKeeperExecutor,
  resetKeeperExecutor,
  BountyHunter,
  getBountyHunter,
  resetBountyHunter,
  ContentEngine,
  getContentEngine,
  resetContentEngine,
  SmartContractAuditor,
  getSmartContractAuditor,
  resetSmartContractAuditor,
} from './generators/index.js';

// Infrastructure
export {
  MCPMarketplace,
  getMCPMarketplace,
  resetMCPMarketplace,
  X402Facilitator,
  getX402Facilitator,
  resetX402Facilitator,
  MemoryService,
  getMemoryService,
  resetMemoryService,
  MetaOrchestrator,
  getMetaOrchestrator,
  resetMetaOrchestrator,
} from './infrastructure/index.js';

// Assets (Passive Revenue)
export {
  YieldOptimizer,
  getYieldOptimizer,
  resetYieldOptimizer,
  ComputeProvider,
  getComputeProvider,
  resetComputeProvider,
} from './assets/index.js';

// Multipliers (Non-Linear Revenue)
export {
  GrantsManager,
  getGrantsManager,
  resetGrantsManager,
  CrossL2Arbitrageur,
  getCrossL2Arbitrageur,
  resetCrossL2Arbitrageur,
} from './multipliers/index.js';

// Live Economy Layer (v18 — Real Infrastructure)
export {
  bootLiveEconomy,
  boot,
  isLive,
  getBootResult,
  getLiveWallet,
  resetWallet,
  getStatePersistence,
  resetStatePersistence,
  getDeworkConnector,
  getCloudflareConnector,
  getDefiConnector,
} from './live/index.js';
export type {
  BootResult,
  LiveConfig,
  LiveWallet,
  PersistedState,
  DeworkConnector,
  Bounty as LiveBounty,
  CloudflareConnector,
  WorkerDeployment,
  WorkerStats,
  DefiConnector,
  YieldPool,
} from './live/index.js';

// v16: Bounty Executor (autonomous revenue generation)
export {
  BountyExecutor,
  BountyCodeGenerator,
  getBountyExecutor,
  resetBountyExecutor,
} from './bounty-executor.js';
export type {
  BountyExecutorConfig,
  GeneratedSolution,
  ExecutionResult,
} from './bounty-executor.js';

// v19.1: Revenue Executor (closes revenue loops)
export {
  RevenueExecutor,
  getRevenueExecutor,
  resetRevenueExecutor,
} from './revenue-executor.js';
export type {
  RevenueSource,
  RevenueExecution,
  ExecutionResult as RevenueExecutionResult,
} from './revenue-executor.js';

// v19.1: GitHub Executor (real PR submission)
export {
  GitHubExecutor,
  getGitHubExecutor,
  resetGitHubExecutor,
} from './live/github-executor.js';
export type {
  GitHubConfig,
  PRSubmission,
  PRResult,
} from './live/github-executor.js';

// v19.1: Economic Health Monitor
export {
  getEconomicHealth,
  formatHealthReport,
  startHealthMonitor,
  stopHealthMonitor,
  getLastHealthStatus,
  isHealthMonitorRunning,
} from './health.js';
export type {
  EconomicHealth,
  StreamHealth,
  HealthMonitorConfig,
} from './health.js';

// v19.2: Bounty Intelligence (AI Capability Matching)
export {
  BountyIntelligence,
  AI_CAPABILITY_PROFILE,
  PLATFORM_STRATEGIES,
  classifyBounty,
  getPlatformStrategy,
  scoreBountyIntelligently,
  rankBountiesIntelligently,
} from './bounty-intelligence.js';
export type {
  AICapabilityProfile,
  BountyType,
  BountyClassification,
  PlatformStrategy,
  IntelligentBountyScore,
} from './bounty-intelligence.js';

// v19.2: Bounty Learning (Causal Analysis + RSI)
export {
  BountyLearningEngine,
  getBountyLearning,
  resetBountyLearning,
} from './bounty-learning.js';
export type {
  BountyOutcome,
  CausalFactor,
  LearningInsight,
  AdaptiveParameters,
} from './bounty-learning.js';

// v19.3: Feedback Analyzer (Deep PR Feedback + Email Integration)
export {
  FeedbackAnalyzer,
  getFeedbackAnalyzer,
  resetFeedbackAnalyzer,
} from './feedback-analyzer.js';
export type {
  PRReviewComment,
  FeedbackIssue,
  FeedbackAnalysis,
  ReviewerPattern,
  SkillProfile,
  PreSubmissionCheck,
  PreSubmissionReport,
} from './feedback-analyzer.js';

// v19.3: Feedback Loop (Unified Feedback Integration)
export {
  FeedbackLoop,
  getFeedbackLoop,
  resetFeedbackLoop,
} from './feedback-loop.js';
export type {
  FeedbackLoopConfig,
  FeedbackEvent,
  ImprovementPlan,
  ImprovementAction,
} from './feedback-loop.js';

// v19.4: Auto-Revision (Automatic Code Revision on Feedback)
export {
  AutoRevisionEngine,
  getAutoRevision,
  resetAutoRevision,
} from './auto-revision.js';
export type {
  RevisionRequest,
  RevisionResult,
  RevisionConfig,
} from './auto-revision.js';

// v19.4: Multi-Model Validator (Consensus-Based Validation)
export {
  MultiModelValidator,
  getMultiValidator,
  resetMultiValidator,
} from './multi-validator.js';
export type {
  ValidationCheck,
  ModelValidation,
  ConsensusResult,
  MultiValidatorConfig,
} from './multi-validator.js';

// v19.5: Repository Style Learner (Adaptive Code Style)
export {
  RepoStyleLearner,
  getRepoStyleLearner,
  resetRepoStyleLearner,
} from './repo-style-learner.js';
export type {
  CodeStyle,
  RepoStyleProfile,
} from './repo-style-learner.js';

// v19.5: Test Generator (Automatic Test Generation)
export {
  TestGenerator,
  getTestGenerator,
  resetTestGenerator,
} from './test-generator.js';
export type {
  TestFramework,
  GeneratedTest,
  TestGeneratorConfig,
} from './test-generator.js';

// v19.5: Smart Retry (Intelligent Retry Strategies)
export {
  SmartRetryEngine,
  getSmartRetry,
  resetSmartRetry,
} from './smart-retry.js';
export type {
  RetryStrategy,
  RetryAttempt,
  RetryState,
  SmartRetryConfig,
} from './smart-retry.js';

// v19.5: Success Pattern Miner (Learning from Successes)
export {
  SuccessPatternMiner,
  getSuccessPatterns,
  resetSuccessPatterns,
} from './success-patterns.js';
export type {
  SuccessPattern,
  PatternExample,
  PatternCondition,
  PatternMatch,
  SuccessAnalysis,
} from './success-patterns.js';

// v19.6: Maintainer Profiler (Personalized Submissions)
export {
  MaintainerProfiler,
  getMaintainerProfiler,
  resetMaintainerProfiler,
} from './maintainer-profiler.js';
export type {
  MaintainerProfile,
  MaintainerInteraction,
} from './maintainer-profiler.js';

// v19.6: PR Template Matcher (Template Compliance)
export {
  PRTemplateMatcher,
  getPRTemplateMatcher,
  resetPRTemplateMatcher,
} from './pr-template-matcher.js';
export type {
  PRTemplate,
  TemplateSection,
  TemplateCheckbox,
  FilledPRDescription,
} from './pr-template-matcher.js';

// v19.6: Portfolio Tracker (Performance Analytics)
export {
  PortfolioTracker,
  getPortfolioTracker,
  resetPortfolioTracker,
} from './portfolio-tracker.js';
export type {
  PortfolioStats,
  BountyRecord,
  DailySnapshot,
  Goal,
  PerformanceTrend,
} from './portfolio-tracker.js';

// v19.6: Commit Optimizer (Commit Message Compliance)
export {
  CommitOptimizer,
  getCommitOptimizer,
  resetCommitOptimizer,
} from './commit-optimizer.js';
export type {
  CommitStyle,
  OptimizedCommit,
} from './commit-optimizer.js';

// v19.7: Issue Analyzer (Deep Requirement Extraction)
export {
  IssueAnalyzer,
  getIssueAnalyzer,
  resetIssueAnalyzer,
} from './issue-analyzer.js';
export type {
  IssueAnalysis,
  Requirement,
  SolutionValidation,
} from './issue-analyzer.js';

// v19.7: Competition Detector (Avoid Contested Bounties)
export {
  CompetitionDetector,
  getCompetitionDetector,
  resetCompetitionDetector,
} from './competition-detector.js';
export type {
  CompetitionAnalysis,
  Competitor,
} from './competition-detector.js';

// v19.7: Solution Comparator (Learn from Merged PRs)
export {
  SolutionComparator,
  getSolutionComparator,
  resetSolutionComparator,
} from './solution-comparator.js';
export type {
  SolutionComparison,
  SimilarPR,
  PatternMatch as SolutionPatternMatch,
} from './solution-comparator.js';

// v19.7: Model Selector (Optimal LLM Selection)
export {
  ModelSelector,
  getModelSelector,
  resetModelSelector,
} from './model-selector.js';
export type {
  ModelId,
  ModelProfile,
  ModelPerformance,
  ModelSelection,
} from './model-selector.js';

// v20.0: Bounty Orchestrator (Ultimate Integrated System)
export {
  BountyOrchestrator,
  getBountyOrchestrator,
  resetBountyOrchestrator,
} from './bounty-orchestrator.js';
export type {
  OrchestratorConfig,
  OrchestratorState,
  ActiveBounty,
  BountyEvent,
  BountyEventType,
} from './bounty-orchestrator.js';

// v22.0: Bounty Swarm (Multi-Agent Collaborative Solving)
export {
  BountySwarm,
  getBountySwarm,
  resetBountySwarm,
} from './bounty-swarm.js';
export type {
  SwarmAgentRole,
  SwarmAgent,
  SwarmMessage,
  SwarmTask,
  SwarmResult,
  SwarmConfig,
} from './bounty-swarm.js';
