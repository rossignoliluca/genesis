/**
 * Protocol Grants — RPGF / Gitcoin / Ecosystem Funds
 *
 * Discovers and applies for protocol grants and retroactive public goods funding.
 * Revenue model: One-time grant payouts ($1,000-$50,000+).
 *
 * Requirements:
 *   - Capital: $0
 *   - Identity: Wallet (for receiving funds)
 *   - Revenue: $2,000-$20,000/quarter (highly variable)
 *
 * Grant sources:
 *   - Optimism RPGF (Retroactive Public Goods Funding)
 *   - Gitcoin Grants (quadratic funding rounds)
 *   - Arbitrum DAO grants
 *   - Base ecosystem fund
 *   - Protocol-specific grants (Uniswap, Aave, Compound, etc.)
 *
 * Strategy:
 *   1. Monitor grant programs and deadlines
 *   2. Evaluate fit (Genesis capabilities vs grant requirements)
 *   3. Generate applications using Brain + content engine
 *   4. Submit and track outcomes
 *   5. Build reputation for future rounds
 *
 * Genesis qualifies as:
 *   - Public good (open-source AI infrastructure)
 *   - Developer tooling (MCP servers, agent framework)
 *   - Research contribution (Active Inference, FEK, NESS)
 */

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

export interface GrantProgram {
  id: string;
  name: string;
  organization: string;
  type: 'rpgf' | 'quadratic' | 'direct' | 'bounty' | 'fellowship';
  chain: string;
  fundingRange: { min: number; max: number };
  deadline?: number;
  requirements: string[];
  focus: string[];              // e.g., ['developer-tools', 'public-goods', 'research']
  applicationUrl?: string;
  status: 'open' | 'closed' | 'upcoming';
  discovered: number;
}

export interface GrantApplication {
  id: string;
  programId: string;
  title: string;
  description: string;
  requestedAmount: number;
  status: 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected';
  submittedAt?: number;
  outcome?: {
    funded: boolean;
    amount: number;
    feedback?: string;
  };
  genesisAngle: string;        // How Genesis fits the grant
}

export interface GrantsStats {
  programsDiscovered: number;
  applicationsSubmitted: number;
  applicationsAccepted: number;
  applicationsRejected: number;
  totalFunded: number;          // $ received from grants
  averageGrantSize: number;
  successRate: number;
  pendingApplications: number;
  nextDeadline?: number;
}

export interface GrantsConfig {
  minFundingAmount: number;     // Min $ to apply for
  maxConcurrentApplications: number;
  focusAreas: string[];
  autoApply: boolean;           // Auto-submit when confidence > threshold
  confidenceThreshold: number;  // 0-1 min confidence to auto-submit
  scanIntervalMs: number;
}

// ============================================================================
// Grants Manager
// ============================================================================

export class GrantsManager {
  private config: GrantsConfig;
  private programs: Map<string, GrantProgram> = new Map();
  private applications: Map<string, GrantApplication> = new Map();
  private readonly fiberId = 'grants';
  private lastScan: number = 0;

  constructor(config?: Partial<GrantsConfig>) {
    this.config = {
      minFundingAmount: config?.minFundingAmount ?? 500,
      maxConcurrentApplications: config?.maxConcurrentApplications ?? 5,
      focusAreas: config?.focusAreas ?? [
        'developer-tools', 'public-goods', 'research',
        'ai-infrastructure', 'open-source', 'agent-framework',
      ],
      autoApply: config?.autoApply ?? false,
      confidenceThreshold: config?.confidenceThreshold ?? 0.7,
      scanIntervalMs: config?.scanIntervalMs ?? 86400000, // 24 hours
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Scan for available grant programs.
   */
  async scanPrograms(): Promise<GrantProgram[]> {
    const discovered: GrantProgram[] = [];

    try {
      const client = getMCPClient();
      const result = await client.call('brave-search' as MCPServerName, 'brave_web_search', {
        query: 'crypto AI agent grants 2025 open applications developer tools',
        count: 10,
      });

      if (result.success) {
        // Also check known grant program APIs
        const programResult = await client.call('coinbase' as MCPServerName, 'list_grant_programs', {
          status: 'open',
          focus: this.config.focusAreas,
        });

        if (programResult.success && Array.isArray(programResult.data?.programs)) {
          for (const p of programResult.data.programs) {
            const program: GrantProgram = {
              id: `grant-${p.id ?? Date.now()}`,
              name: p.name ?? 'Unknown Program',
              organization: p.organization ?? 'Unknown',
              type: p.type ?? 'direct',
              chain: p.chain ?? 'ethereum',
              fundingRange: {
                min: p.minFunding ?? 1000,
                max: p.maxFunding ?? 50000,
              },
              deadline: p.deadline,
              requirements: p.requirements ?? [],
              focus: p.focus ?? [],
              applicationUrl: p.url,
              status: 'open',
              discovered: Date.now(),
            };

            if (program.fundingRange.max >= this.config.minFundingAmount) {
              this.programs.set(program.id, program);
              discovered.push(program);
            }
          }
        }
      }
    } catch {
      // Scan failure is non-fatal
    }

    this.lastScan = Date.now();
    return discovered;
  }

  /**
   * Generate a grant application.
   */
  async generateApplication(programId: string): Promise<GrantApplication | null> {
    const program = this.programs.get(programId);
    if (!program || program.status !== 'open') return null;

    const pending = [...this.applications.values()].filter(a =>
      a.status === 'draft' || a.status === 'submitted' || a.status === 'under_review'
    );
    if (pending.length >= this.config.maxConcurrentApplications) return null;

    const fiber = getEconomicFiber();

    try {
      const { getBrainInstance } = await import('../../brain/index.js');
      const brain = getBrainInstance();
      if (!brain) return null;

      // Determine Genesis's angle for this grant
      const angle = this.determineAngle(program);

      const prompt = `Write a grant application for "${program.name}" by ${program.organization}.
        Grant focus: ${program.focus.join(', ')}.
        Requirements: ${program.requirements.join('; ')}.
        Funding range: $${program.fundingRange.min}-$${program.fundingRange.max}.

        Our project (Genesis) is: An autonomous AI system implementing Active Inference,
        free energy minimization, and multi-agent coordination. It provides open-source
        developer tools including MCP servers, agent orchestration, and cognitive memory APIs.

        Angle: ${angle}

        Write a concise, compelling application (500 words max) covering:
        1. Project description and relevance
        2. How it serves the grant's focus areas
        3. Milestones and deliverables
        4. Requested funding amount and breakdown`;

      const content = await brain.process(prompt);

      const application: GrantApplication = {
        id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        programId,
        title: `Genesis: ${angle}`,
        description: content,
        requestedAmount: Math.floor((program.fundingRange.min + program.fundingRange.max) / 2),
        status: 'draft',
        genesisAngle: angle,
      };

      // Record LLM cost for generation
      fiber.recordCost(this.fiberId, 0.05, `generate:${program.name}`);

      this.applications.set(application.id, application);
      return application;
    } catch (error) {
      console.warn('[Grants] Application generation failed:', error);
      return null;
    }
  }

  /**
   * Submit a draft application.
   */
  async submitApplication(applicationId: string): Promise<boolean> {
    const app = this.applications.get(applicationId);
    if (!app || app.status !== 'draft') return false;

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'submit_grant_application', {
        programId: app.programId,
        title: app.title,
        description: app.description,
        amount: app.requestedAmount,
      });

      if (result.success) {
        app.status = 'submitted';
        app.submittedAt = Date.now();
        return true;
      }
    } catch {
      // Submission failure
    }

    return false;
  }

  /**
   * Check outcomes of submitted applications.
   */
  async checkOutcomes(): Promise<GrantApplication[]> {
    const fiber = getEconomicFiber();
    const updated: GrantApplication[] = [];

    const submitted = [...this.applications.values()].filter(a =>
      a.status === 'submitted' || a.status === 'under_review'
    );

    for (const app of submitted) {
      try {
        const client = getMCPClient();
        const result = await client.call('coinbase' as MCPServerName, 'check_grant_status', {
          applicationId: app.id,
          programId: app.programId,
        });

        if (result.success && result.data?.status) {
          if (result.data.status === 'accepted') {
            app.status = 'accepted';
            app.outcome = {
              funded: true,
              amount: result.data.amount ?? app.requestedAmount,
              feedback: result.data.feedback,
            };
            fiber.recordRevenue(this.fiberId, app.outcome.amount, `grant:${app.programId}`);
            updated.push(app);
          } else if (result.data.status === 'rejected') {
            app.status = 'rejected';
            app.outcome = {
              funded: false,
              amount: 0,
              feedback: result.data.feedback,
            };
            updated.push(app);
          } else if (result.data.status === 'under_review') {
            app.status = 'under_review';
          }
        }
      } catch {
        // Will retry next cycle
      }
    }

    return updated;
  }

  /**
   * Check if scan is needed.
   */
  needsScan(): boolean {
    return Date.now() - this.lastScan > this.config.scanIntervalMs;
  }

  /**
   * Get current statistics.
   */
  getStats(): GrantsStats {
    const accepted = [...this.applications.values()].filter(a => a.status === 'accepted');
    const rejected = [...this.applications.values()].filter(a => a.status === 'rejected');
    const pending = [...this.applications.values()].filter(a =>
      a.status === 'submitted' || a.status === 'under_review'
    );

    const totalFunded = accepted.reduce((s, a) => s + (a.outcome?.amount ?? 0), 0);
    const totalDecided = accepted.length + rejected.length;

    // Find next deadline
    const openPrograms = [...this.programs.values()]
      .filter(p => p.status === 'open' && p.deadline)
      .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));

    return {
      programsDiscovered: this.programs.size,
      applicationsSubmitted: [...this.applications.values()].filter(a => a.status !== 'draft').length,
      applicationsAccepted: accepted.length,
      applicationsRejected: rejected.length,
      totalFunded,
      averageGrantSize: accepted.length > 0 ? totalFunded / accepted.length : 0,
      successRate: totalDecided > 0 ? accepted.length / totalDecided : 0,
      pendingApplications: pending.length,
      nextDeadline: openPrograms[0]?.deadline,
    };
  }

  /**
   * Get ROI.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private determineAngle(program: GrantProgram): string {
    const focus = program.focus.join(' ').toLowerCase();

    if (focus.includes('public-goods') || focus.includes('open-source')) {
      return 'Open-Source AI Infrastructure for Public Good';
    }
    if (focus.includes('developer') || focus.includes('tooling')) {
      return 'Developer Tools: MCP Servers & Agent Framework';
    }
    if (focus.includes('research') || focus.includes('science')) {
      return 'Active Inference Research: FEK & Cognitive Architecture';
    }
    if (focus.includes('defi') || focus.includes('protocol')) {
      return 'Autonomous DeFi Agent with Safety Constraints';
    }
    return 'Autonomous AI System for Web3 Ecosystem';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let grantsInstance: GrantsManager | null = null;

export function getGrantsManager(config?: Partial<GrantsConfig>): GrantsManager {
  if (!grantsInstance) {
    grantsInstance = new GrantsManager(config);
  }
  return grantsInstance;
}

export function resetGrantsManager(): void {
  grantsInstance = null;
}
