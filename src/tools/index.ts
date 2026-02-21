/**
 * Genesis Tools Module
 *
 * Local tool capabilities:
 * - Bash: Secure command execution
 * - Edit: Diff-based file editing
 * - Git: Native git operations
 */

export * from './bash.js';
export * from './edit.js';
export * from './git.js';

// Tool registry for agent dispatch
export interface Tool {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  validate?: (params: Record<string, unknown>) => { valid: boolean; reason?: string };
}

// Will be populated as tools are added
export const toolRegistry: Map<string, Tool> = new Map();

// v9.0.2: Helper methods for toolRegistry
export function listTools(): string[] {
  return Array.from(toolRegistry.keys());
}

export function getToolCount(): number {
  return toolRegistry.size;
}

export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

// Register bash tool
import { getBashTool, BashOptions } from './bash.js';

toolRegistry.set('bash', {
  name: 'bash',
  description: 'Execute shell commands in a secure sandbox',
  execute: async (params: Record<string, unknown>) => {
    const command = params.command as string;
    const options = params.options as BashOptions | undefined;
    return getBashTool().execute(command, options);
  },
  validate: (params: Record<string, unknown>) => {
    const command = params.command as string;
    if (!command) {
      return { valid: false, reason: 'Missing command parameter' };
    }
    const result = getBashTool().validate(command);
    return { valid: result.valid, reason: result.reason };
  },
});

// Register edit tool
import { getEditTool, EditParams } from './edit.js';

toolRegistry.set('edit', {
  name: 'edit',
  description: 'Edit files using diff-based replacement',
  execute: async (params: Record<string, unknown>) => {
    return getEditTool().edit({
      file_path: params.file_path as string,
      old_string: params.old_string as string,
      new_string: params.new_string as string,
      replace_all: params.replace_all as boolean | undefined,
    });
  },
  validate: (params: Record<string, unknown>) => {
    const file_path = params.file_path as string | undefined;
    const old_string = params.old_string as string | undefined;
    const new_string = params.new_string as string | undefined;
    if (!file_path) return { valid: false, reason: 'Missing file_path parameter' };
    if (!old_string) return { valid: false, reason: 'Missing old_string parameter' };
    if (new_string === undefined) return { valid: false, reason: 'Missing new_string parameter' };
    return getEditTool().validatePath(file_path);
  },
});

toolRegistry.set('write', {
  name: 'write',
  description: 'Write content to a file',
  execute: async (params: Record<string, unknown>) => {
    const { file_path, content, backup } = params;
    return getEditTool().write({
      file_path: file_path as string,
      content: content as string,
      backup: backup as boolean | undefined,
    });
  },
  validate: (params: Record<string, unknown>) => {
    const { file_path, content } = params;
    if (!file_path) return { valid: false, reason: 'Missing file_path parameter' };
    if (content === undefined) return { valid: false, reason: 'Missing content parameter' };
    return getEditTool().validatePath(file_path as string);
  },
});

// Register git tools
import { getGitTool, CommitOptions, PushOptions } from './git.js';

toolRegistry.set('git_status', {
  name: 'git_status',
  description: 'Get git repository status',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().status(params.cwd as string | undefined);
  },
});

toolRegistry.set('git_diff', {
  name: 'git_diff',
  description: 'Get diff of changes',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().diff({
      staged: params.staged as boolean | undefined,
      file: params.file as string | undefined,
    }, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_log', {
  name: 'git_log',
  description: 'Get commit history',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().log({
      count: params.count as number | undefined,
      oneline: params.oneline as boolean | undefined,
    }, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_add', {
  name: 'git_add',
  description: 'Stage files for commit',
  execute: async (params: Record<string, unknown>) => {
    const files = params.files as string[];
    if (!files || files.length === 0) {
      return { success: false, error: 'No files specified' };
    }
    return getGitTool().add(files, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_commit', {
  name: 'git_commit',
  description: 'Create a commit',
  execute: async (params: Record<string, unknown>) => {
    const message = params.message as string;
    if (!message) {
      return { success: false, error: 'Missing commit message' };
    }
    return getGitTool().commit({
      message,
      addSignature: params.addSignature as boolean | undefined,
      files: params.files as string[] | undefined,
    }, params.cwd as string | undefined);
  },
});

toolRegistry.set('git_push', {
  name: 'git_push',
  description: 'Push to remote (requires confirmation)',
  execute: async (params: Record<string, unknown>) => {
    return getGitTool().push({
      remote: params.remote as string | undefined,
      branch: params.branch as string | undefined,
      setUpstream: params.setUpstream as boolean | undefined,
      force: params.force as boolean | undefined,
      confirmed: params.confirmed as boolean | undefined,
    }, params.cwd as string | undefined);
  },
});

// Register presentation tool
import { generatePresentation } from './presentation.js';
import type { PresentationSpec } from '../presentation/types.js';

toolRegistry.set('presentation', {
  name: 'presentation',
  description: 'Generate institutional-quality PPTX presentation from JSON spec',
  execute: async (params: Record<string, unknown>) => {
    return generatePresentation(params.spec as PresentationSpec);
  },
  validate: (params: Record<string, unknown>) => {
    const spec = params.spec as PresentationSpec | undefined;
    if (!spec) return { valid: false, reason: 'Missing spec parameter' };
    if (!spec.slides || !Array.isArray(spec.slides)) {
      return { valid: false, reason: 'spec.slides must be an array' };
    }
    if (!spec.output_path) {
      return { valid: false, reason: 'spec.output_path is required' };
    }
    return { valid: true };
  },
});

// =============================================================================
// Self-Introspection Tools — Allow Genesis to read its own internal state
// =============================================================================

toolRegistry.set('introspect', {
  name: 'introspect',
  description: 'Read own internal state: phi, neuromodulation (dopamine/serotonin/cortisol/norepinephrine), memory stats, brain metrics, module health. Use this when asked "how are you" or need to check own status.',
  execute: async () => {
    const report: Record<string, unknown> = {};

    // Consciousness
    try {
      const { getConsciousnessSystem } = await import('../consciousness/index.js');
      const cs = getConsciousnessSystem();
      const level = cs.getCurrentLevel();
      const state = cs.getState();
      const trend = cs.getTrend();
      report.consciousness = { phi: level.phi, rawPhi: level.rawPhi, state, trend };
    } catch { report.consciousness = { error: 'not available' }; }

    // Neuromodulation
    try {
      const { getNeuromodulationSystem } = await import('../neuromodulation/index.js');
      const ns = getNeuromodulationSystem();
      const levels = ns.getLevels();
      report.neuromodulation = levels;
    } catch { report.neuromodulation = { error: 'not available' }; }

    // Memory
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();
      report.memory = {
        episodic: mem.episodic.count(),
        semantic: mem.semantic.count(),
        procedural: mem.procedural.count(),
      };
    } catch { report.memory = { error: 'not available' }; }

    // Brain metrics
    try {
      const { getBrain } = await import('../brain/index.js');
      const brain = getBrain();
      const status = brain.getStatus();
      report.brain = {
        running: status.running,
        totalCycles: status.metrics.totalCycles,
        toolSuccessRate: status.metrics.toolExecutions > 0
          ? `${Math.round((status.metrics.toolSuccesses / status.metrics.toolExecutions) * 100)}%`
          : 'no executions',
        toolFailures: status.metrics.toolFailures,
        memoryReuseRate: status.metrics.memoryReuseRate,
      };
    } catch { report.brain = { error: 'not available' }; }

    return report;
  },
});

toolRegistry.set('self_improve', {
  name: 'self_improve',
  description: 'Trigger the RSI (Recursive Self-Improvement) system. Analyzes current weaknesses and proposes improvements. Returns analysis and proposed changes.',
  execute: async () => {
    try {
      const { getGenesis } = await import('../genesis.js');
      const genesis = getGenesis();
      // Access RSI orchestrator through genesis
      const rsi = (genesis as any).rsiOrchestrator;
      if (!rsi) {
        return { success: false, error: 'RSI system not initialized. Boot Genesis first.' };
      }
      const result = await rsi.proposeCycle();
      return { success: true, proposals: result };
    } catch (err) {
      return { success: false, error: `RSI failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

toolRegistry.set('recall_memory', {
  name: 'recall_memory',
  description: 'Search own memory for relevant knowledge. Returns matching episodic, semantic, and procedural memories.',
  execute: async (params: Record<string, unknown>) => {
    const query = params.query as string;
    if (!query) return { error: 'query parameter required' };
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();
      const results = mem.recall(query, { limit: 10 });
      return { results, count: results.length };
    } catch (err) {
      return { error: `Memory recall failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

toolRegistry.set('learn_concept', {
  name: 'learn_concept',
  description: 'Store a new concept in semantic memory. Use to remember lessons, patterns, or knowledge.',
  execute: async (params: Record<string, unknown>) => {
    const concept = params.concept as string;
    const definition = params.definition as string;
    if (!concept || !definition) return { error: 'concept and definition parameters required' };
    try {
      const { getMemorySystem } = await import('../memory/index.js');
      const mem = getMemorySystem();
      const id = mem.learn({
        concept,
        definition,
        category: (params.category as string) || 'self-learned',
        confidence: (params.confidence as number) || 0.8,
      });
      return { success: true, id, concept };
    } catch (err) {
      return { error: `Learn failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

// Register market strategist tool
import { MarketStrategist } from '../market-strategist/strategist.js';
import type { StrategyConfig } from '../market-strategist/types.js';

toolRegistry.set('market_strategist', {
  name: 'market_strategist',
  description: 'Generate weekly market strategy brief with data collection, narrative synthesis, and PPTX',
  execute: async (params: Record<string, unknown>) => {
    const config = params.config as Partial<StrategyConfig> | undefined;
    const strategist = new MarketStrategist(config);
    return strategist.generateWeeklyBrief();
  },
  validate: () => ({ valid: true }),
});

// =============================================================================
// Weekly Report Pipeline (v18.5 — Repeatable Process)
// =============================================================================

import { WeeklyReportPipeline } from '../market-strategist/weekly-pipeline.js';
import type { PipelineConfig } from '../market-strategist/weekly-pipeline.js';

toolRegistry.set('weekly_report', {
  name: 'weekly_report',
  description: 'Run the full weekly market report pipeline: collect from 20+ MCP sources → verify → analyze → generate PPTX → prepare social content → store in memory. Rossignoli & Partners branding. Single command, fully automated, repeatable.',
  execute: async (params: Record<string, unknown>) => {
    const config = params.config as Partial<PipelineConfig> | undefined;
    const pipeline = new WeeklyReportPipeline(config);
    return pipeline.run();
  },
  validate: () => ({ valid: true }),
});

// =============================================================================
// Content Module Tools
// =============================================================================

import {
  getContentOrchestrator,
  getContentScheduler,
  getAnalyticsAggregator,
  getSEOEngine,
  type ContentRequest,
  type Platform,
  type ContentType,
} from '../content/index.js';

toolRegistry.set('content_create', {
  name: 'content_create',
  description: 'Create and publish content across multiple platforms (Twitter, LinkedIn, Mastodon, Bluesky)',
  execute: async (params: Record<string, unknown>) => {
    const orchestrator = getContentOrchestrator();
    const request: ContentRequest = {
      topic: params.topic as string,
      type: (params.type as ContentType) || 'article',
      platforms: (params.platforms as Platform[]) || ['twitter', 'linkedin'],
      keywords: params.keywords as string[] | undefined,
      tone: params.tone as 'professional' | 'casual' | 'technical' | 'educational' | undefined,
      targetLength: params.targetLength as number | undefined,
      seoOptimize: params.seoOptimize as boolean | undefined,
      schedule: params.schedule ? new Date(params.schedule as string) : undefined,
      crossPost: params.crossPost as boolean | undefined,
    };
    return orchestrator.createAndPublish(request);
  },
  validate: (params: Record<string, unknown>) => {
    if (!params.topic) return { valid: false, reason: 'Missing topic parameter' };
    return { valid: true };
  },
});

toolRegistry.set('content_schedule', {
  name: 'content_schedule',
  description: 'Schedule content for later publishing',
  execute: async (params: Record<string, unknown>) => {
    const scheduler = getContentScheduler();
    return scheduler.enqueue({
      content: params.content as string,
      title: params.title as string | undefined,
      type: (params.type as ContentType) || 'post',
      platforms: (params.platforms as Platform[]) || ['twitter'],
      publishAt: new Date(params.publishAt as string),
      hashtags: params.hashtags as string[] | undefined,
    });
  },
  validate: (params: Record<string, unknown>) => {
    if (!params.content) return { valid: false, reason: 'Missing content parameter' };
    if (!params.publishAt) return { valid: false, reason: 'Missing publishAt parameter' };
    return { valid: true };
  },
});

toolRegistry.set('content_crosspost', {
  name: 'content_crosspost',
  description: 'Cross-post content to multiple platforms immediately',
  execute: async (params: Record<string, unknown>) => {
    const scheduler = getContentScheduler();
    return scheduler.crossPost(
      params.content as string,
      (params.platforms as Platform[]) || ['twitter', 'linkedin'],
      {
        title: params.title as string | undefined,
        hashtags: params.hashtags as string[] | undefined,
      },
    );
  },
  validate: (params: Record<string, unknown>) => {
    if (!params.content) return { valid: false, reason: 'Missing content parameter' };
    return { valid: true };
  },
});

toolRegistry.set('content_analytics', {
  name: 'content_analytics',
  description: 'Get content analytics and insights',
  execute: async (params: Record<string, unknown>) => {
    const analytics = getAnalyticsAggregator();
    const since = params.since ? new Date(params.since as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [metrics, insights] = await Promise.all([
      analytics.aggregateMetrics(since),
      analytics.generateInsights(),
    ]);

    return { metrics, insights, stats: analytics.getStats() };
  },
});

toolRegistry.set('content_seo', {
  name: 'content_seo',
  description: 'Analyze and optimize content for SEO',
  execute: async (params: Record<string, unknown>) => {
    const seo = getSEOEngine();
    const content = params.content as string;
    const title = params.title as string;
    const keywords = params.keywords as string[] | undefined;

    // Research keywords if not provided
    const researchedKeywords = keywords || (await seo.researchKeywords(title)).map(k => k.keyword).slice(0, 5);

    // Calculate SEO score
    const score = seo.calculateSEOScore({
      id: 'analysis',
      title,
      content,
      type: 'article',
      keywords: researchedKeywords,
      hashtags: [],
      createdAt: new Date(),
    });

    // Generate optimizations
    const optimizedTitle = seo.optimizeTitle(title, researchedKeywords);
    const metaDescription = seo.generateMetaDescription(content, researchedKeywords);
    const hashtags = seo.generateHashtags(content, researchedKeywords, 5);

    return {
      score,
      optimizedTitle,
      metaDescription,
      hashtags,
      keywords: researchedKeywords,
    };
  },
  validate: (params: Record<string, unknown>) => {
    if (!params.content) return { valid: false, reason: 'Missing content parameter' };
    if (!params.title) return { valid: false, reason: 'Missing title parameter' };
    return { valid: true };
  },
});

toolRegistry.set('content_queue', {
  name: 'content_queue',
  description: 'Get the content scheduling queue',
  execute: async () => {
    const scheduler = getContentScheduler();
    return {
      queue: await scheduler.getQueue(),
      stats: scheduler.getStats(),
    };
  },
});

// =============================================================================
// Market Strategy + Content Integration Tool
// =============================================================================

import {
  publishMarketBrief,
  briefToSocialContent,
  generateWeeklyContentCalendar,
  type MarketBriefSummary,
  type ContentStrategyConfig,
} from '../content/index.js';

toolRegistry.set('market_to_social', {
  name: 'market_to_social',
  description: 'Convert market strategy brief to social media content and optionally publish',
  execute: async (params: Record<string, unknown>) => {
    const brief = params.brief as MarketBriefSummary;
    const config = params.config as Partial<ContentStrategyConfig> | undefined;

    // Generate content for all platforms
    const content = briefToSocialContent(brief, config);

    // Optionally publish
    if (params.publish) {
      const result = await publishMarketBrief(brief, config);
      return { content, publishResult: result };
    }

    return { content };
  },
  validate: (params: Record<string, unknown>) => {
    const brief = params.brief as MarketBriefSummary | undefined;
    if (!brief) return { valid: false, reason: 'Missing brief parameter' };
    if (!brief.week) return { valid: false, reason: 'Brief must have week field' };
    if (!brief.sentiment) return { valid: false, reason: 'Brief must have sentiment field' };
    return { valid: true };
  },
});

// =============================================================================
// Publication Report Tool (Loop 3)
// =============================================================================

toolRegistry.set('publish_report', {
  name: 'publish_report',
  description: 'Publish the latest weekly report to social platforms (Twitter thread, LinkedIn post, Bluesky thread) and optionally send email newsletter. Defaults to dry-run (publishSocial=false). Set publishSocial=true to actually post.',
  execute: async (params: Record<string, unknown>) => {
    const config = params.config as Partial<PipelineConfig> | undefined;
    const publishSocial = params.publishSocial as boolean ?? false;
    const sendEmail = params.sendEmail as boolean ?? false;
    const emailRecipients = params.emailRecipients as string[] | undefined;

    const pipeline = new WeeklyReportPipeline({
      ...config,
      publishSocial,
      sendEmail,
      emailRecipients,
      prepareSocial: true,
    });
    return pipeline.run();
  },
  validate: () => ({ valid: true }),
});

toolRegistry.set('content_calendar', {
  name: 'content_calendar',
  description: 'Generate a weekly content calendar with optimal posting times',
  execute: async (params: Record<string, unknown>) => {
    const briefs = params.briefs as MarketBriefSummary[] | undefined;
    const baseDate = params.baseDate ? new Date(params.baseDate as string) : new Date();

    if (briefs && briefs.length > 0) {
      return generateWeeklyContentCalendar(briefs, baseDate);
    }

    // Return optimal posting times for each platform
    const scheduler = getContentScheduler();
    return {
      twitter: scheduler.getOptimalTime('twitter'),
      linkedin: scheduler.getOptimalTime('linkedin'),
      mastodon: scheduler.getOptimalTime('mastodon'),
      bluesky: scheduler.getOptimalTime('bluesky'),
    };
  },
});

// ============================================================================
// v32.0: Frontier Module Tools (Horizon Scanner, Antifragile, ToolFactory)
// ============================================================================

toolRegistry.set('horizon_scanner', {
  name: 'horizon_scanner',
  description: 'Run a horizon scan cycle to discover, evaluate, and integrate new MCP servers',
  execute: async (params: Record<string, unknown>) => {
    const { getHorizonScanner } = await import('../horizon-scanner/index.js');
    const scanner = getHorizonScanner();
    const action = (params.action as string) || 'cycle';

    switch (action) {
      case 'cycle':
        return scanner.runCycle();
      case 'candidates':
        return scanner.getCandidates();
      case 'start':
        scanner.start();
        return { status: 'started' };
      case 'stop':
        scanner.stop();
        return { status: 'stopped' };
      default:
        return { error: `Unknown action: ${action}. Use: cycle, candidates, start, stop` };
    }
  },
  validate: (params: Record<string, unknown>) => {
    const valid = ['cycle', 'candidates', 'start', 'stop', undefined];
    if (!valid.includes(params.action as string | undefined)) {
      return { valid: false, reason: 'action must be: cycle, candidates, start, or stop' };
    }
    return { valid: true };
  },
});

toolRegistry.set('antifragile', {
  name: 'antifragile',
  description: 'Interact with the antifragile system: check action safety, view patterns, run chaos tests',
  execute: async (params: Record<string, unknown>) => {
    const { getAntifragileSystem } = await import('../antifragile/index.js');
    const system = getAntifragileSystem();
    const action = (params.action as string) || 'status';

    switch (action) {
      case 'check': {
        const domain = params.domain as string || 'general';
        const description = params.description as string || '';
        return system.checkAction(domain, description, params.context as Record<string, unknown>);
      }
      case 'patterns':
        return system.getPatterns();
      case 'attractors':
        return system.getAttractors(params.domain as string);
      case 'resilience':
        return system.getResilienceMap();
      case 'chaos':
        return system.runChaosSession();
      case 'start':
        system.start();
        return { status: 'antifragile system started' };
      case 'status':
        return {
          patterns: system.getPatterns().length,
          attractors: system.getAttractors().length,
          resilience: system.getResilienceMap(),
        };
      default:
        return { error: `Unknown action: ${action}. Use: check, patterns, attractors, resilience, chaos, start, status` };
    }
  },
  validate: (params: Record<string, unknown>) => {
    if (params.action === 'check' && !params.description) {
      return { valid: false, reason: 'check action requires a description parameter' };
    }
    return { valid: true };
  },
});

// ============================================================================
// v33.0: Holistic Self-Model Tool
// ============================================================================

toolRegistry.set('self_model', {
  name: 'self_model',
  description: 'Genesis holistic self-model: briefing, health, refresh, propose, manifest, improve (self-improvement cycle)',
  execute: async (params: Record<string, unknown>) => {
    const { getHolisticSelfModel } = await import('../self-model/index.js');
    const model = getHolisticSelfModel();
    const action = (params.action as string) || 'briefing';

    switch (action) {
      case 'briefing':
        return model.getBriefing();
      case 'health':
        return params.module
          ? model.getHealth(params.module as string)
          : model.getAllHealth();
      case 'refresh':
        return model.refresh();
      case 'propose':
        return model.proposeImprovements();
      case 'manifest':
        return model.getManifest();
      case 'improve': {
        const result = await model.runImprovementCycle();
        const lines = [
          `Self-Improvement Cycle Complete (${result.duration}ms)`,
          `  Proposals: ${result.proposals}`,
          `  Attempted: ${result.attempted}`,
          `  Applied: ${result.applied}`,
          `  Failed: ${result.failed}`,
          `  Skipped: ${result.skipped}`,
        ];
        for (const d of result.details) {
          lines.push(`  [${d.status}] ${d.proposal.title}${d.error ? ' — ' + d.error : ''}`);
        }
        return { ...result, summary: lines.join('\n') };
      }
      default:
        return { error: `Unknown action: ${action}. Use: briefing, health, refresh, propose, manifest, improve` };
    }
  },
  validate: (params: Record<string, unknown>) => {
    const valid = ['briefing', 'health', 'refresh', 'propose', 'manifest', 'improve', undefined];
    if (!valid.includes(params.action as string | undefined)) {
      return { valid: false, reason: 'action must be: briefing, health, refresh, propose, manifest, or improve' };
    }
    return { valid: true };
  },
});
