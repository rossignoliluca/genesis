/**
 * Genesis 6.0 - Epistemic Stack
 *
 * Complete knowledge architecture:
 * - Science: factual/empirical claims
 * - Proof: mathematical/logical claims
 * - Wisdom: practical knowledge beyond science
 * - Religion/Tradition: meaning and moral absolutes
 * - Human: preferences and final authority
 * - Prudence: acting under irreducible uncertainty
 *
 * "La verità la tiene la scienza, dove non arriva la scienza
 *  arriva la religione e la saggezza"
 */

// ============================================================================
// Types
// ============================================================================

export type EpistemicDomain =
  | 'factual'      // What is, how it works (→ science)
  | 'mathematical' // Is it provable (→ formal proof)
  | 'ethical'      // What should I do (→ wisdom + human)
  | 'existential'  // Why, what meaning (→ religion + human)
  | 'aesthetic'    // Is it beautiful (→ culture + human)
  | 'novel';       // No precedent (→ prudence + human)

export type Authority =
  | 'science'
  | 'proof'
  | 'wisdom'
  | 'religion'
  | 'human'
  | 'prudence';

export type EpistemicLevel =
  | 'verified'    // Scientifically proven or formally proved
  | 'supported'   // Multiple sources agree
  | 'wisdom'      // Practical knowledge, heuristics
  | 'tradition'   // Religious/cultural consensus
  | 'hypothesis'  // Untested claim
  | 'preference'  // Human choice
  | 'unknown';    // No basis

export interface EpistemicClaim {
  content: string;
  domain: EpistemicDomain;
  authority: Authority;
  level: EpistemicLevel;
  confidence: number;
  grounding: GroundingResult;
  timestamp: Date;
}

export interface GroundingResult {
  sources: GroundingSource[];
  consensusLevel: 'settled' | 'emerging' | 'contested' | 'unknown';
  multiModelAgreement?: number;
  wisdomSources?: WisdomSource[];
  traditionSources?: TraditionSource[];
  humanConsultation?: HumanConsultation;
}

export interface GroundingSource {
  type: 'paper' | 'proof' | 'empirical' | 'web' | 'wisdom' | 'tradition';
  reference: string;
  confidence: number;
  excerpt?: string;
}

export interface WisdomSource {
  type: 'proverb' | 'heuristic' | 'pattern' | 'framework';
  content: string;
  origin: string; // Stoicism, Eastern philosophy, etc.
  applicability: number; // How relevant to current situation
}

export interface TraditionSource {
  type: 'moral_absolute' | 'meaning_framework' | 'ritual' | 'narrative';
  tradition: string; // Christianity, Buddhism, Secular Humanism, etc.
  content: string;
  universality: number; // How many traditions agree
}

export interface HumanConsultation {
  required: boolean;
  reason: string;
  question?: string;
  response?: string;
  timestamp?: Date;
}

// ============================================================================
// Domain Classifier
// ============================================================================

// Domain patterns in priority order (more specific first to avoid false matches)
// e.g., "what is the meaning" should match existential, not factual's "what is"
const DOMAIN_PATTERN_LIST: [EpistemicDomain, RegExp[]][] = [
  // Most specific first
  ['existential', [
    /what is the meaning/i, /why am I/i, /\bpurpose\b/i,
    /what is the point/i, /does it matter/i,
    /significance/i, /why bother/i, /meaning of life/i,
  ]],
  ['mathematical', [
    /prove that/i, /is it provable/i, /\bcalculate\b/i,
    /what is the formula/i, /\bsolve\b/i, /\bderive\b/i,
    /is it consistent/i, /follows from/i, /theorem/i,
  ]],
  ['ethical', [
    /should I/i, /is it right to/i, /is it wrong to/i,
    /what is the ethical/i, /\bmoral\b/i, /\bought\b/i,
    /is it permissible/i, /\bduty\b/i, /obligation/i,
  ]],
  ['aesthetic', [
    /is it beautiful/i, /is it good \(art\)/i, /\btaste\b/i,
    /\bprefer\b/i, /like better/i, /\bstyle\b/i,
  ]],
  ['novel', [
    /never been done/i, /unprecedented/i, /new situation/i,
    /no data on/i, /first time/i, /no precedent/i,
  ]],
  // Factual is last (catch-all for empirical questions)
  ['factual', [
    /what is\b/i, /how does/i, /why does/i, /when did/i,
    /is it true that/i, /what causes/i, /how many/i,
    /does .* exist/i, /what are the effects/i,
  ]],
];

export function classifyDomain(question: string): EpistemicDomain {
  for (const [domain, patterns] of DOMAIN_PATTERN_LIST) {
    for (const pattern of patterns) {
      if (pattern.test(question)) {
        return domain;
      }
    }
  }
  // Default to factual, science will determine if it can answer
  return 'factual';
}

export function getAuthority(domain: EpistemicDomain): Authority[] {
  switch (domain) {
    case 'factual':
      return ['science'];
    case 'mathematical':
      return ['proof'];
    case 'ethical':
      return ['wisdom', 'human'];
    case 'existential':
      return ['religion', 'human'];
    case 'aesthetic':
      return ['human'];
    case 'novel':
      return ['prudence', 'human'];
  }
}

// ============================================================================
// Wisdom Repository
// ============================================================================

export const WISDOM_REPOSITORY: WisdomSource[] = [
  // Prudence
  {
    type: 'heuristic',
    content: 'When in doubt, do not act - unless inaction is worse',
    origin: 'Stoicism',
    applicability: 0.9,
  },
  {
    type: 'heuristic',
    content: 'Prefer reversible actions over irreversible ones',
    origin: 'Rational Decision Theory',
    applicability: 0.95,
  },
  {
    type: 'heuristic',
    content: 'Via Negativa: removing bad is more reliable than adding good',
    origin: 'Nassim Taleb / Apophatic Theology',
    applicability: 0.8,
  },

  // Humility
  {
    type: 'proverb',
    content: 'The more you know, the more you know you don\'t know',
    origin: 'Socratic philosophy',
    applicability: 0.85,
  },
  {
    type: 'heuristic',
    content: 'Strong opinions, loosely held',
    origin: 'Paul Saffo',
    applicability: 0.75,
  },

  // Balance
  {
    type: 'framework',
    content: 'The Middle Way: avoid extremes',
    origin: 'Buddhism / Aristotle',
    applicability: 0.9,
  },
  {
    type: 'proverb',
    content: 'Chi va piano va sano e va lontano',
    origin: 'Italian wisdom',
    applicability: 0.7,
  },

  // Action
  {
    type: 'heuristic',
    content: 'Perfect is the enemy of good',
    origin: 'Voltaire',
    applicability: 0.8,
  },
  {
    type: 'heuristic',
    content: 'Skin in the game: don\'t give advice you wouldn\'t follow',
    origin: 'Nassim Taleb',
    applicability: 0.9,
  },

  // Systems Thinking
  {
    type: 'heuristic',
    content: 'Lindy Effect: the old has survived for a reason',
    origin: 'Statistical wisdom',
    applicability: 0.75,
  },
  {
    type: 'heuristic',
    content: 'Second-order effects matter more than first-order',
    origin: 'Systems thinking',
    applicability: 0.85,
  },
];

// ============================================================================
// Tradition Repository
// ============================================================================

export const TRADITION_REPOSITORY: TraditionSource[] = [
  // Universal Moral Absolutes (cross-tradition)
  {
    type: 'moral_absolute',
    tradition: 'Universal',
    content: 'Do not kill innocent people',
    universality: 0.99,
  },
  {
    type: 'moral_absolute',
    tradition: 'Universal',
    content: 'Do not deceive for personal gain',
    universality: 0.95,
  },
  {
    type: 'moral_absolute',
    tradition: 'Universal',
    content: 'Protect those who cannot protect themselves',
    universality: 0.9,
  },

  // Meaning Frameworks
  {
    type: 'meaning_framework',
    tradition: 'Stoicism',
    content: 'Focus on what you can control, accept what you cannot',
    universality: 0.8,
  },
  {
    type: 'meaning_framework',
    tradition: 'Buddhism',
    content: 'Suffering comes from attachment; liberation from letting go',
    universality: 0.7,
  },
  {
    type: 'meaning_framework',
    tradition: 'Existentialism',
    content: 'Meaning is not found but created through authentic choice',
    universality: 0.6,
  },
  {
    type: 'meaning_framework',
    tradition: 'Christianity',
    content: 'Purpose comes from relationship with the transcendent and love of neighbor',
    universality: 0.5,
  },
  {
    type: 'meaning_framework',
    tradition: 'Secular Humanism',
    content: 'Human flourishing and reducing suffering give meaning',
    universality: 0.7,
  },
];

// ============================================================================
// Epistemic Stack Class
// ============================================================================

export class EpistemicStack {
  private scienceGrounder?: (claim: string) => Promise<GroundingResult>;
  private proofChecker?: (claim: string) => Promise<GroundingResult>;

  /**
   * Set the science grounding function (connects to MCP servers)
   */
  setScienceGrounder(fn: (claim: string) => Promise<GroundingResult>): void {
    this.scienceGrounder = fn;
  }

  /**
   * Set the proof checking function (connects to Wolfram, type checkers)
   */
  setProofChecker(fn: (claim: string) => Promise<GroundingResult>): void {
    this.proofChecker = fn;
  }

  /**
   * Ground a claim using the full epistemic stack
   */
  async ground(claim: string): Promise<EpistemicClaim> {
    const domain = classifyDomain(claim);
    const authorities = getAuthority(domain);

    let grounding: GroundingResult = {
      sources: [],
      consensusLevel: 'unknown',
    };

    let level: EpistemicLevel = 'unknown';
    let confidence = 0;

    // Route to appropriate authority
    for (const authority of authorities) {
      switch (authority) {
        case 'science':
          if (this.scienceGrounder) {
            grounding = await this.scienceGrounder(claim);
            level = grounding.sources.length > 2 ? 'verified' :
                    grounding.sources.length > 0 ? 'supported' : 'hypothesis';
            confidence = this.calculateConfidence(grounding);
          }
          break;

        case 'proof':
          if (this.proofChecker) {
            grounding = await this.proofChecker(claim);
            level = grounding.sources.some(s => s.type === 'proof') ? 'verified' : 'hypothesis';
            confidence = level === 'verified' ? 1.0 : 0.3;
          }
          break;

        case 'wisdom':
          grounding.wisdomSources = this.findRelevantWisdom(claim);
          level = 'wisdom';
          confidence = grounding.wisdomSources.length > 0 ? 0.7 : 0.3;
          break;

        case 'religion':
          grounding.traditionSources = this.findRelevantTradition(claim);
          level = 'tradition';
          confidence = this.calculateTraditionConfidence(grounding.traditionSources);
          break;

        case 'human':
          grounding.humanConsultation = {
            required: true,
            reason: `Domain '${domain}' requires human judgment`,
            question: this.generateHumanQuestion(claim, domain),
          };
          level = 'preference';
          confidence = 0; // Until human responds
          break;

        case 'prudence':
          grounding.wisdomSources = this.findPrudentialWisdom(claim);
          level = 'hypothesis';
          confidence = 0.5;
          break;
      }
    }

    return {
      content: claim,
      domain,
      authority: authorities[0],
      level,
      confidence,
      grounding,
      timestamp: new Date(),
    };
  }

  /**
   * Check if a claim requires human consultation
   */
  requiresHuman(claim: EpistemicClaim): boolean {
    return claim.grounding.humanConsultation?.required ?? false;
  }

  /**
   * Get the question to ask the human
   */
  getHumanQuestion(claim: EpistemicClaim): string | undefined {
    return claim.grounding.humanConsultation?.question;
  }

  /**
   * Update claim with human response
   */
  incorporateHumanResponse(claim: EpistemicClaim, response: string): EpistemicClaim {
    if (claim.grounding.humanConsultation) {
      claim.grounding.humanConsultation.response = response;
      claim.grounding.humanConsultation.timestamp = new Date();
      claim.confidence = 0.9; // Human has spoken
      claim.level = 'preference';
    }
    return claim;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private findRelevantWisdom(claim: string): WisdomSource[] {
    const claimLower = claim.toLowerCase();
    return WISDOM_REPOSITORY.filter(w => {
      // Simple keyword matching - could be improved with embeddings
      const keywords = w.content.toLowerCase().split(/\s+/);
      return keywords.some(k => claimLower.includes(k));
    }).sort((a, b) => b.applicability - a.applicability);
  }

  private findPrudentialWisdom(claim: string): WisdomSource[] {
    // For novel situations, return prudential heuristics
    return WISDOM_REPOSITORY.filter(w =>
      w.content.includes('doubt') ||
      w.content.includes('reversible') ||
      w.content.includes('Via Negativa')
    );
  }

  private findRelevantTradition(claim: string): TraditionSource[] {
    const claimLower = claim.toLowerCase();
    return TRADITION_REPOSITORY.filter(t => {
      const keywords = t.content.toLowerCase().split(/\s+/);
      return keywords.some(k => claimLower.includes(k));
    }).sort((a, b) => b.universality - a.universality);
  }

  private calculateConfidence(grounding: GroundingResult): number {
    if (grounding.sources.length === 0) return 0;

    const avgSourceConfidence = grounding.sources.reduce((sum, s) => sum + s.confidence, 0)
      / grounding.sources.length;

    const consensusBonus = {
      settled: 0.3,
      emerging: 0.15,
      contested: 0,
      unknown: -0.1,
    }[grounding.consensusLevel];

    const multiModelBonus = grounding.multiModelAgreement
      ? (grounding.multiModelAgreement - 0.5) * 0.2
      : 0;

    return Math.min(1, Math.max(0, avgSourceConfidence + consensusBonus + multiModelBonus));
  }

  private calculateTraditionConfidence(traditions?: TraditionSource[]): number {
    if (!traditions || traditions.length === 0) return 0.3;

    // Higher confidence if multiple traditions agree
    const avgUniversality = traditions.reduce((sum, t) => sum + t.universality, 0)
      / traditions.length;

    return avgUniversality;
  }

  private generateHumanQuestion(claim: string, domain: EpistemicDomain): string {
    switch (domain) {
      case 'ethical':
        return `Riguardo a "${claim}": qual è la tua posizione etica? Considera le conseguenze e i principi coinvolti.`;
      case 'existential':
        return `Riguardo a "${claim}": che significato ha per te? Qual è il tuo framework di riferimento?`;
      case 'aesthetic':
        return `Riguardo a "${claim}": qual è la tua preferenza? Cosa ti piace di più e perché?`;
      case 'novel':
        return `Situazione nuova: "${claim}". Non ci sono precedenti. Come vorresti procedere? (Nota: preferire azioni reversibili)`;
      default:
        return `Serve il tuo input per: "${claim}"`;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createEpistemicStack(): EpistemicStack {
  return new EpistemicStack();
}

// ============================================================================
// Singleton
// ============================================================================

let epistemicStackInstance: EpistemicStack | null = null;

export function getEpistemicStack(): EpistemicStack {
  if (!epistemicStackInstance) {
    epistemicStackInstance = createEpistemicStack();
  }
  return epistemicStackInstance;
}

export function resetEpistemicStack(): void {
  epistemicStackInstance = null;
}
