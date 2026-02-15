/**
 * Bounty Intelligence System v19.2
 *
 * Advanced bounty analysis using cognitive modules:
 * - AI Capability Matching: What bounties suit AI vs humans
 * - Difficulty Estimation: Multi-factor complexity analysis
 * - Platform Strategy: Site-specific approaches
 * - Causal Learning: Why bounties fail/succeed
 * - Metacognitive Selection: Strategy based on uncertainty
 *
 * @module economy/bounty-intelligence
 * @version 19.2.0
 */

import type { Bounty } from './generators/bounty-hunter.js';

// ============================================================================
// AI Capability Model
// ============================================================================

/**
 * AI strengths and weaknesses for bounty matching.
 * Based on empirical analysis of AI code generation capabilities.
 */
export interface AICapabilityProfile {
  // Strengths (high success probability)
  strengths: {
    boilerplate: 0.95;           // Generating standard patterns
    documentation: 0.90;          // Writing docs, README, comments
    testGeneration: 0.85;         // Unit test creation
    refactoring: 0.85;            // Code cleanup, optimization
    translation: 0.90;            // i18n, localization
    bugFixSimple: 0.80;           // Clear, isolated bugs
    apiIntegration: 0.75;         // Standard API usage
    dataTransformation: 0.85;     // JSON, CSV, format conversion
  };
  // Weaknesses (low success probability)
  weaknesses: {
    securityAudit: 0.25;          // Finding vulnerabilities (high FP/FN)
    architectureDesign: 0.30;     // Novel system design
    legacyCodeUnderstanding: 0.35; // Undocumented old code
    realTimeDebugging: 0.20;      // Interactive debugging
    domainExpertise: 0.30;        // Finance, medical, legal specifics
    creativeAlgorithms: 0.35;     // Novel algorithmic solutions
    crossSystemIntegration: 0.40; // Many external dependencies
    performanceOptimization: 0.45; // Deep profiling required
  };
}

export const AI_CAPABILITY_PROFILE: AICapabilityProfile = {
  strengths: {
    boilerplate: 0.95,
    documentation: 0.90,
    testGeneration: 0.85,
    refactoring: 0.85,
    translation: 0.90,
    bugFixSimple: 0.80,
    apiIntegration: 0.75,
    dataTransformation: 0.85,
  },
  weaknesses: {
    securityAudit: 0.25,
    architectureDesign: 0.30,
    legacyCodeUnderstanding: 0.35,
    realTimeDebugging: 0.20,
    domainExpertise: 0.30,
    creativeAlgorithms: 0.35,
    crossSystemIntegration: 0.40,
    performanceOptimization: 0.45,
  },
};

// ============================================================================
// Bounty Classification
// ============================================================================

export type BountyType =
  | 'documentation'
  | 'test-writing'
  | 'bug-fix-simple'
  | 'bug-fix-complex'
  | 'feature-small'
  | 'feature-large'
  | 'refactoring'
  | 'security-audit'
  | 'translation'
  | 'api-integration'
  | 'architecture'
  | 'performance'
  | 'unknown';

export interface BountyClassification {
  type: BountyType;
  confidence: number;
  aiSuitability: number;         // 0-1: How suitable for AI
  estimatedDifficulty: number;   // 0-1: Normalized difficulty
  estimatedHours: number;        // Expected work hours
  requiredSkills: string[];
  riskFactors: string[];
  recommendation: 'pursue' | 'consider' | 'avoid' | 'escalate';
}

/**
 * Classify a bounty using NLP analysis of title and description.
 */
export function classifyBounty(bounty: Bounty): BountyClassification {
  const text = `${bounty.title} ${bounty.description}`.toLowerCase();
  const tags = bounty.tags.map(t => t.toLowerCase());

  // Type detection with confidence
  const typeScores = detectBountyType(text, tags);
  const primaryType = typeScores[0];

  // AI suitability based on type
  const aiSuitability = calculateAISuitability(primaryType.type, text, bounty);

  // Multi-factor difficulty estimation
  const difficulty = estimateDifficulty(bounty, primaryType.type, text);

  // Risk factor identification
  const riskFactors = identifyRiskFactors(bounty, text);

  // Required skills extraction
  const requiredSkills = extractRequiredSkills(text, tags);

  // Recommendation based on all factors
  const recommendation = generateRecommendation(
    aiSuitability,
    difficulty,
    riskFactors.length,
    bounty.reward
  );

  // Hours estimation based on difficulty and type
  const estimatedHours = estimateHours(difficulty, primaryType.type, bounty.reward);

  return {
    type: primaryType.type,
    confidence: primaryType.confidence,
    aiSuitability,
    estimatedDifficulty: difficulty,
    estimatedHours,
    requiredSkills,
    riskFactors,
    recommendation,
  };
}

function detectBountyType(text: string, tags: string[]): Array<{ type: BountyType; confidence: number }> {
  const patterns: Array<{ type: BountyType; patterns: RegExp[]; tagPatterns: string[] }> = [
    {
      type: 'documentation',
      patterns: [/\b(document|readme|docs?|comment|jsdoc|typedoc|api doc)\b/i],
      tagPatterns: ['documentation', 'docs', 'readme', 'wiki'],
    },
    {
      type: 'test-writing',
      patterns: [/\b(test|spec|unit test|integration test|e2e|coverage|jest|mocha|pytest)\b/i],
      tagPatterns: ['testing', 'tests', 'unit-test', 'coverage'],
    },
    {
      type: 'bug-fix-simple',
      patterns: [/\b(fix|bug|error|crash|typo|broken|issue)\b/i, /\b(simple|minor|small|quick)\b/i],
      tagPatterns: ['bug', 'bugfix', 'fix', 'good-first-issue'],
    },
    {
      type: 'bug-fix-complex',
      patterns: [/\b(fix|bug|error)\b/i, /\b(complex|major|critical|intermittent|race condition)\b/i],
      tagPatterns: ['bug', 'critical', 'blocker'],
    },
    {
      type: 'feature-small',
      patterns: [/\b(add|implement|create|feature)\b/i, /\b(button|field|option|toggle|simple)\b/i],
      tagPatterns: ['enhancement', 'feature', 'improvement'],
    },
    {
      type: 'feature-large',
      patterns: [/\b(implement|build|develop|feature)\b/i, /\b(system|module|integration|full|complete)\b/i],
      tagPatterns: ['epic', 'major', 'feature'],
    },
    {
      type: 'refactoring',
      patterns: [/\b(refactor|cleanup|reorganize|restructure|modernize|migrate)\b/i],
      tagPatterns: ['refactoring', 'tech-debt', 'cleanup'],
    },
    {
      type: 'security-audit',
      patterns: [/\b(security|audit|vulnerability|exploit|penetration|cve|owasp)\b/i],
      tagPatterns: ['security', 'audit', 'vulnerability'],
    },
    {
      type: 'translation',
      patterns: [/\b(translate|i18n|l10n|localization|language|internationalization)\b/i],
      tagPatterns: ['translation', 'i18n', 'localization'],
    },
    {
      type: 'api-integration',
      patterns: [/\b(integrate|api|sdk|third[- ]party|connector|webhook)\b/i],
      tagPatterns: ['api', 'integration', 'sdk'],
    },
    {
      type: 'architecture',
      patterns: [/\b(architect|design|rfc|proposal|system design|scalability)\b/i],
      tagPatterns: ['architecture', 'design', 'rfc'],
    },
    {
      type: 'performance',
      patterns: [/\b(performance|optimize|speed|latency|memory|profil|benchmark)\b/i],
      tagPatterns: ['performance', 'optimization', 'speed'],
    },
  ];

  const scores: Array<{ type: BountyType; confidence: number }> = [];

  for (const { type, patterns: patternList, tagPatterns } of patterns) {
    let score = 0;

    // Pattern matching in text
    for (const pattern of patternList) {
      if (pattern.test(text)) {
        score += 0.4;
      }
    }

    // Tag matching
    for (const tagPattern of tagPatterns) {
      if (tags.some(t => t.includes(tagPattern))) {
        score += 0.3;
      }
    }

    if (score > 0) {
      scores.push({ type, confidence: Math.min(score, 1.0) });
    }
  }

  // Sort by confidence
  scores.sort((a, b) => b.confidence - a.confidence);

  // Default if no match
  if (scores.length === 0) {
    scores.push({ type: 'unknown', confidence: 0.3 });
  }

  return scores;
}

function calculateAISuitability(type: BountyType, text: string, bounty: Bounty): number {
  // v21.0: Recalibrated based on real-world data:
  // - Documentation bounties: 84% merge rate (HIGHEST)
  // - Test-writing: ~60% merge rate
  // - Bug-fix-simple: ~30% merge rate (requires reading codebase)
  // - Feature code: ~10% merge rate for AI (very low)
  // - Security: near 0% (too many false positives)
  const typeSuitability: Record<BountyType, number> = {
    'documentation': 0.95,         // 84% merge rate — our best bet
    'translation': 0.90,           // High acceptance, mechanical task
    'test-writing': 0.80,          // Good if we match test framework
    'bug-fix-simple': 0.65,        // v21.0: Lowered — still needs codebase reading
    'refactoring': 0.55,           // v21.0: Lowered — requires deep understanding
    'api-integration': 0.50,       // v21.0: Lowered — needs external API knowledge
    'feature-small': 0.50,         // v21.0: Lowered — ~10% merge rate for AI
    'bug-fix-complex': 0.30,       // v21.0: Lowered significantly
    'feature-large': 0.20,         // v21.0: Very low — scope creep risk
    'performance': 0.20,           // v21.0: Needs profiling, not guessing
    'architecture': 0.15,          // v21.0: Novel design is AI's weakness
    'security-audit': 0.10,        // v21.0: Near 0% — high false positive risk
    'unknown': 0.30,               // v21.0: Unknown = risky, lower default
  };

  let suitability = typeSuitability[type] ?? 0.30;

  // Modifiers based on text analysis

  // Negative modifiers (reduce suitability)
  if (/\b(legacy|old|undocumented)\b/i.test(text)) suitability *= 0.6;
  if (/\b(complex|complicated|tricky)\b/i.test(text)) suitability *= 0.7;
  if (/\b(urgent|asap|immediately)\b/i.test(text)) suitability *= 0.8;
  if (/\b(interactive|real[- ]time|live)\b/i.test(text)) suitability *= 0.6;
  if (/\b(domain|business logic|proprietary)\b/i.test(text)) suitability *= 0.7;
  if (bounty.description.length < 100) suitability *= 0.7; // Vague = dangerous
  // v21.0: Multiple-file changes are much harder
  if (/\b(multiple files|many files|across|several)\b/i.test(text)) suitability *= 0.7;
  // v21.0: Cross-module or system-wide changes
  if (/\b(system[- ]wide|cross[- ]module|end[- ]to[- ]end)\b/i.test(text)) suitability *= 0.5;

  // Positive modifiers (increase suitability)
  if (/\b(well[- ]documented|clear|straightforward)\b/i.test(text)) suitability *= 1.2;
  if (/\b(template|boilerplate|standard)\b/i.test(text)) suitability *= 1.2;
  if (/\b(crud|rest api|simple)\b/i.test(text)) suitability *= 1.1;
  if (bounty.description.length > 500) suitability *= 1.1; // Detailed = better
  // v21.0: Single-file changes are much more likely to succeed
  if (/\b(single file|one file|in .+\.\w{1,4})\b/i.test(text)) suitability *= 1.3;
  // v21.0: Good first issues tend to be well-scoped
  if (/good.?first.?issue/i.test(text) || bounty.tags.some(t => t.includes('good-first'))) suitability *= 1.2;

  return Math.min(Math.max(suitability, 0.05), 0.95);
}

function estimateDifficulty(bounty: Bounty, type: BountyType, text: string): number {
  // Start with type-based baseline
  const typeDifficulty: Record<BountyType, number> = {
    'documentation': 0.2,
    'translation': 0.2,
    'bug-fix-simple': 0.3,
    'test-writing': 0.3,
    'refactoring': 0.4,
    'feature-small': 0.4,
    'api-integration': 0.5,
    'bug-fix-complex': 0.6,
    'feature-large': 0.7,
    'performance': 0.7,
    'architecture': 0.8,
    'security-audit': 0.9,
    'unknown': 0.5,
  };

  let difficulty = typeDifficulty[type] ?? 0.5;

  // Reward-based adjustment (higher reward often = harder)
  if (bounty.reward > 2000) difficulty += 0.15;
  else if (bounty.reward > 1000) difficulty += 0.10;
  else if (bounty.reward > 500) difficulty += 0.05;
  else if (bounty.reward < 100) difficulty -= 0.10;

  // Text-based modifiers
  if (/\b(complex|advanced|expert)\b/i.test(text)) difficulty += 0.15;
  if (/\b(simple|basic|beginner|good first issue)\b/i.test(text)) difficulty -= 0.15;
  if (/\b(multiple|several|many files)\b/i.test(text)) difficulty += 0.10;
  if (/\b(single file|one file)\b/i.test(text)) difficulty -= 0.10;

  // Platform-specific adjustments
  if (bounty.platform === 'immunefi' || bounty.platform === 'code4rena') {
    difficulty += 0.20; // Security platforms are inherently harder
  }

  return Math.min(Math.max(difficulty, 0.1), 1.0);
}

function identifyRiskFactors(bounty: Bounty, text: string): string[] {
  const risks: string[] = [];

  // Text-based risks
  if (/\b(legacy|old|deprecated)\b/i.test(text)) {
    risks.push('legacy_codebase');
  }
  if (/\b(undocumented|no docs?)\b/i.test(text)) {
    risks.push('undocumented');
  }
  if (/\b(urgent|asap|deadline)\b/i.test(text)) {
    risks.push('time_pressure');
  }
  if (/\b(breaking change|migration)\b/i.test(text)) {
    risks.push('breaking_changes');
  }
  if (/\b(proprietary|internal|custom)\b/i.test(text)) {
    risks.push('domain_knowledge_required');
  }
  if (/\b(security|auth|crypto|wallet)\b/i.test(text)) {
    risks.push('security_critical');
  }
  if (/\b(performance|latency|scale)\b/i.test(text)) {
    risks.push('performance_critical');
  }

  // Bounty-based risks
  if (bounty.description.length < 100) {
    risks.push('vague_requirements');
  }
  if (bounty.deadline && bounty.deadline < Date.now() + 24 * 60 * 60 * 1000) {
    risks.push('tight_deadline');
  }
  if (bounty.reward > 5000) {
    risks.push('high_expectations');
  }
  if (bounty.tags.length === 0) {
    risks.push('missing_tags');
  }

  return risks;
}

function extractRequiredSkills(text: string, tags: string[]): string[] {
  const skillPatterns: Record<string, RegExp> = {
    'typescript': /\b(typescript|ts)\b/i,
    'javascript': /\b(javascript|js|node\.?js)\b/i,
    'python': /\b(python|py|django|flask|fastapi)\b/i,
    'rust': /\b(rust|cargo)\b/i,
    'go': /\b(golang|go)\b/i,
    'solidity': /\b(solidity|smart contract|ethereum|web3)\b/i,
    'react': /\b(react|jsx|next\.?js)\b/i,
    'vue': /\b(vue|nuxt)\b/i,
    'docker': /\b(docker|container|k8s|kubernetes)\b/i,
    'sql': /\b(sql|postgres|mysql|database|orm)\b/i,
    'graphql': /\b(graphql|apollo)\b/i,
    'aws': /\b(aws|amazon|s3|lambda|ec2)\b/i,
    'testing': /\b(test|jest|pytest|mocha|cypress)\b/i,
    'ci-cd': /\b(ci\/cd|github actions|jenkins|gitlab)\b/i,
  };

  const skills: Set<string> = new Set();

  // Extract from text
  for (const [skill, pattern] of Object.entries(skillPatterns)) {
    if (pattern.test(text)) {
      skills.add(skill);
    }
  }

  // Add from tags
  for (const tag of tags) {
    const normalizedTag = tag.toLowerCase().replace(/[-_]/g, '');
    if (skillPatterns[normalizedTag]) {
      skills.add(normalizedTag);
    }
    // Direct tag matches
    if (['typescript', 'javascript', 'python', 'rust', 'go', 'solidity', 'react', 'vue'].includes(normalizedTag)) {
      skills.add(normalizedTag);
    }
  }

  return Array.from(skills);
}

function generateRecommendation(
  aiSuitability: number,
  difficulty: number,
  riskCount: number,
  reward: number
): 'pursue' | 'consider' | 'avoid' | 'escalate' {
  // v21.0: More conservative — better to skip than get rejected.
  // 0% success rate taught us: only pursue what we're confident about.

  // Hard avoid: low suitability, high difficulty, or high risk
  if (aiSuitability < 0.45 || difficulty >= 0.7 || riskCount >= 3) {
    return 'avoid';
  }

  // Escalate: high value but uncertain
  if (reward >= 1000 && aiSuitability >= 0.5 && aiSuitability < 0.75) {
    return 'escalate';
  }

  // Pursue: high suitability + low difficulty + low risk
  if (aiSuitability >= 0.70 && difficulty <= 0.4 && riskCount <= 1) {
    return 'pursue';
  }

  // Consider: moderate suitability
  if (aiSuitability >= 0.55 && difficulty <= 0.5) {
    return 'consider';
  }

  // Default to avoid — conservative is better than 0% success
  return 'avoid';
}

function estimateHours(difficulty: number, type: BountyType, reward: number): number {
  // Base hours by type
  const baseHours: Record<BountyType, number> = {
    'documentation': 2,
    'translation': 1,
    'bug-fix-simple': 2,
    'test-writing': 3,
    'refactoring': 4,
    'feature-small': 4,
    'api-integration': 6,
    'bug-fix-complex': 8,
    'feature-large': 16,
    'performance': 12,
    'architecture': 20,
    'security-audit': 24,
    'unknown': 6,
  };

  let hours = baseHours[type] ?? 6;

  // Adjust by difficulty
  hours *= (0.5 + difficulty);

  // Adjust by reward (higher reward = more expected work)
  if (reward > 1000) hours *= 1.5;
  if (reward > 2000) hours *= 1.3;

  return Math.round(hours * 10) / 10;
}

// ============================================================================
// Platform-Specific Strategies
// ============================================================================

export interface PlatformStrategy {
  platform: string;
  preferredTypes: BountyType[];
  avoidTypes: BountyType[];
  minReward: number;
  maxDifficulty: number;
  specialConsiderations: string[];
  prStyle: 'detailed' | 'concise' | 'technical';
  responseTime: 'fast' | 'normal' | 'thorough';
}

export const PLATFORM_STRATEGIES: Record<string, PlatformStrategy> = {
  algora: {
    platform: 'algora',
    preferredTypes: ['bug-fix-simple', 'documentation', 'test-writing', 'feature-small'],
    avoidTypes: ['security-audit', 'architecture'],
    minReward: 50,
    maxDifficulty: 0.6,
    specialConsiderations: [
      'GitHub-native bounties, PRs expected',
      'Often well-documented issues',
      'Community-driven, responsive maintainers',
    ],
    prStyle: 'detailed',
    responseTime: 'normal',
  },
  gitcoin: {
    platform: 'gitcoin',
    preferredTypes: ['feature-small', 'documentation', 'api-integration'],
    avoidTypes: ['security-audit', 'performance'],
    minReward: 100,
    maxDifficulty: 0.5,
    specialConsiderations: [
      'Web3/crypto focused',
      'Platform deprecated, focus on active bounties',
      'Token payments common',
    ],
    prStyle: 'technical',
    responseTime: 'fast',
  },
  dework: {
    platform: 'dework',
    preferredTypes: ['documentation', 'translation', 'feature-small'],
    avoidTypes: ['bug-fix-complex', 'architecture', 'security-audit'],
    minReward: 50,
    maxDifficulty: 0.5,
    specialConsiderations: [
      'DAO bounties, decentralized approval',
      'USDC payments via blockchain',
      'Variable response times',
    ],
    prStyle: 'concise',
    responseTime: 'normal',
  },
  github: {
    platform: 'github',
    preferredTypes: ['bug-fix-simple', 'documentation', 'test-writing', 'refactoring'],
    avoidTypes: ['architecture', 'security-audit'],
    minReward: 25,
    maxDifficulty: 0.6,
    specialConsiderations: [
      'Reward extraction from text is heuristic',
      'Payment method varies by repo',
      'Check for good-first-issue label',
    ],
    prStyle: 'detailed',
    responseTime: 'thorough',
  },
  immunefi: {
    platform: 'immunefi',
    preferredTypes: [], // Don't recommend any for AI
    avoidTypes: ['security-audit'], // All are security audits
    minReward: 1000,
    maxDifficulty: 0.3, // Only pursue easy finds
    specialConsiderations: [
      'HIGH RISK: Security audits require expertise',
      'False positives damage reputation',
      'Only pursue clear, documented vulnerabilities',
      'RECOMMEND: Escalate to human security expert',
    ],
    prStyle: 'technical',
    responseTime: 'thorough',
  },
  code4rena: {
    platform: 'code4rena',
    preferredTypes: [],
    avoidTypes: ['security-audit'],
    minReward: 500,
    maxDifficulty: 0.3,
    specialConsiderations: [
      'Contest-based, competitive',
      'Requires deep Solidity expertise',
      'High false positive risk',
      'RECOMMEND: Escalate to human security expert',
    ],
    prStyle: 'technical',
    responseTime: 'thorough',
  },
};

export function getPlatformStrategy(platform: string): PlatformStrategy {
  return PLATFORM_STRATEGIES[platform] ?? PLATFORM_STRATEGIES.github;
}

// ============================================================================
// Bounty Scoring with Intelligence
// ============================================================================

export interface IntelligentBountyScore {
  bounty: Bounty;
  classification: BountyClassification;
  platformStrategy: PlatformStrategy;
  overallScore: number;
  breakdown: {
    aiSuitabilityScore: number;
    difficultyScore: number;
    rewardScore: number;
    platformFitScore: number;
    riskScore: number;
  };
  reasoning: string[];
}

export function scoreBountyIntelligently(bounty: Bounty): IntelligentBountyScore {
  const classification = classifyBounty(bounty);
  const strategy = getPlatformStrategy(bounty.platform);
  const reasoning: string[] = [];

  // Component scores (0-100)
  const aiSuitabilityScore = classification.aiSuitability * 100;
  const difficultyScore = (1 - classification.estimatedDifficulty) * 100;
  const rewardScore = Math.min(bounty.reward / 10, 100); // Cap at $1000

  // Platform fit
  let platformFitScore = 50;
  if (strategy.preferredTypes.includes(classification.type)) {
    platformFitScore = 90;
    reasoning.push(`Type "${classification.type}" preferred on ${bounty.platform}`);
  } else if (strategy.avoidTypes.includes(classification.type)) {
    platformFitScore = 10;
    reasoning.push(`Type "${classification.type}" should be avoided on ${bounty.platform}`);
  }

  // Risk score (inverse - lower risk = higher score)
  const riskScore = Math.max(0, 100 - classification.riskFactors.length * 20);
  if (classification.riskFactors.length > 0) {
    reasoning.push(`Risk factors: ${classification.riskFactors.join(', ')}`);
  }

  // Check minimums
  if (bounty.reward < strategy.minReward) {
    reasoning.push(`Reward $${bounty.reward} below platform minimum $${strategy.minReward}`);
  }
  if (classification.estimatedDifficulty > strategy.maxDifficulty) {
    reasoning.push(`Difficulty ${(classification.estimatedDifficulty * 100).toFixed(0)}% exceeds platform max ${(strategy.maxDifficulty * 100).toFixed(0)}%`);
  }

  // v21.0: Reweighted — AI suitability is by far the most important factor.
  // We learned: a $20 doc bounty that merges > a $500 code bounty that gets rejected.
  const overallScore = (
    aiSuitabilityScore * 0.40 +  // v21.0: Increased from 0.30 — this is what matters most
    difficultyScore * 0.25 +
    riskScore * 0.20 +           // v21.0: Increased from 0.15 — risk kills us
    platformFitScore * 0.10 +
    rewardScore * 0.05           // v21.0: Decreased from 0.15 — chasing high reward = bad strategy
  );

  reasoning.push(`Recommendation: ${classification.recommendation.toUpperCase()}`);

  return {
    bounty,
    classification,
    platformStrategy: strategy,
    overallScore,
    breakdown: {
      aiSuitabilityScore,
      difficultyScore,
      rewardScore,
      platformFitScore,
      riskScore,
    },
    reasoning,
  };
}

// ============================================================================
// Batch Ranking
// ============================================================================

export function rankBountiesIntelligently(bounties: Bounty[]): IntelligentBountyScore[] {
  const scored = bounties.map(b => scoreBountyIntelligently(b));

  // Sort by overall score descending
  scored.sort((a, b) => b.overallScore - a.overallScore);

  // v21.0: Strictly filter — never pursue 'avoid' bounties.
  // Our 0% success rate means we need to be very selective.
  const viable = scored.filter(s =>
    s.classification.recommendation !== 'avoid' &&
    s.classification.aiSuitability >= 0.45 // v21.0: Hard minimum
  );

  // If nothing viable, return empty — better to skip than submit garbage
  return viable;
}

// ============================================================================
// Export singleton for integration
// ============================================================================

export const BountyIntelligence = {
  classifyBounty,
  getPlatformStrategy,
  scoreBountyIntelligently,
  rankBountiesIntelligently,
  AI_CAPABILITY_PROFILE,
  PLATFORM_STRATEGIES,
};
