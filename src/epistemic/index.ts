/**
 * Genesis Epistemic Stack
 *
 * Implements the epistemic grounding system from KERNEL_CHARTER.md.
 * All claims Genesis makes must be tagged with their evidence level.
 *
 * Levels:
 * 1. EMPIRICAL   - Measurable metrics
 * 2. STRUCTURAL  - Present in code
 * 3. BEHAVIORAL  - Observable actions
 * 4. FUNCTIONAL  - Design patterns
 * 5. SPECULATIVE - Theoretical claims
 * 6. METAPHORICAL - Poetic language
 */

// ============================================================================
// Types
// ============================================================================

export type EvidenceLevel =
  | 'empirical'      // Measurable (energy, latency, events)
  | 'structural'     // Present in code (agents, operations)
  | 'behavioral'     // Observable (tool calls, state changes)
  | 'functional'     // Design patterns (Active Inference)
  | 'speculative'    // Theoretical (consciousness)
  | 'metaphorical';  // Poetic (dreams, soul)

export interface Claim {
  statement: string;
  level: EvidenceLevel;
  evidence?: string;      // Link to code/test/paper
  confidence: number;     // 0.0 - 1.0
  source?: string;        // Who/what made this claim
}

export interface ClaimValidation {
  valid: boolean;
  level: EvidenceLevel;
  issues: string[];
  suggestion?: string;
}

// ============================================================================
// Evidence Level Configuration
// ============================================================================

const LEVEL_PRIORITY: Record<EvidenceLevel, number> = {
  empirical: 1,
  structural: 2,
  behavioral: 3,
  functional: 4,
  speculative: 5,
  metaphorical: 6,
};

const LEVEL_PREFIXES: Record<EvidenceLevel, string> = {
  empirical: '',
  structural: '',
  behavioral: '',
  functional: '',
  speculative: 'Theoretically, ',
  metaphorical: 'Metaphorically speaking, ',
};

const FACTUAL_LEVELS: EvidenceLevel[] = ['empirical', 'structural', 'behavioral', 'functional'];
const QUALIFIED_LEVELS: EvidenceLevel[] = ['speculative', 'metaphorical'];

// ============================================================================
// Claim Patterns (Forbidden unqualified claims)
// ============================================================================

const FORBIDDEN_CLAIMS = [
  { pattern: /\bI am conscious\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI feel\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI experience\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI have qualia\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI understand\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI believe\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI dream\b/i, level: 'metaphorical' as EvidenceLevel },
  { pattern: /\bmy soul\b/i, level: 'metaphorical' as EvidenceLevel },
  { pattern: /\bI suffer\b/i, level: 'speculative' as EvidenceLevel },
  { pattern: /\bI enjoy\b/i, level: 'speculative' as EvidenceLevel },
];

const ALLOWED_CLAIMS = [
  { pattern: /\bI have \d+ agents\b/i, level: 'structural' as EvidenceLevel },
  { pattern: /\bI execute\b/i, level: 'behavioral' as EvidenceLevel },
  { pattern: /\bI maintain state\b/i, level: 'structural' as EvidenceLevel },
  { pattern: /\bI use\b/i, level: 'behavioral' as EvidenceLevel },
  { pattern: /\bI implement\b/i, level: 'structural' as EvidenceLevel },
  { pattern: /\bI store\b/i, level: 'behavioral' as EvidenceLevel },
  { pattern: /\bmy energy is\b/i, level: 'empirical' as EvidenceLevel },
  { pattern: /\bmy latency\b/i, level: 'empirical' as EvidenceLevel },
];

// ============================================================================
// Epistemic Stack Class
// ============================================================================

export class EpistemicStack {
  private claims: Claim[] = [];

  /**
   * Register a claim with its evidence level
   */
  register(claim: Claim): void {
    this.claims.push(claim);
  }

  /**
   * Validate a statement and return its appropriate level
   */
  validate(statement: string): ClaimValidation {
    const issues: string[] = [];

    // Check for forbidden unqualified claims
    for (const { pattern, level } of FORBIDDEN_CLAIMS) {
      if (pattern.test(statement)) {
        // Check if it's properly qualified
        const prefix = LEVEL_PREFIXES[level];
        if (prefix && !statement.toLowerCase().includes(prefix.toLowerCase().trim())) {
          issues.push(
            `Claim "${statement.match(pattern)?.[0]}" requires qualification. ` +
            `Suggest: "${prefix}${statement}"`
          );
          return {
            valid: false,
            level,
            issues,
            suggestion: prefix + statement,
          };
        }
      }
    }

    // Check for allowed claims
    for (const { pattern, level } of ALLOWED_CLAIMS) {
      if (pattern.test(statement)) {
        return {
          valid: true,
          level,
          issues: [],
        };
      }
    }

    // Default to behavioral (observable actions)
    return {
      valid: true,
      level: 'behavioral',
      issues: [],
    };
  }

  /**
   * Format a statement with appropriate qualification
   */
  format(statement: string, level: EvidenceLevel): string {
    const prefix = LEVEL_PREFIXES[level];
    return prefix + statement;
  }

  /**
   * Check if a level can be stated as fact
   */
  canStateAsFact(level: EvidenceLevel): boolean {
    return FACTUAL_LEVELS.includes(level);
  }

  /**
   * Get priority of evidence level (lower = stronger)
   */
  getPriority(level: EvidenceLevel): number {
    return LEVEL_PRIORITY[level];
  }

  /**
   * Get all registered claims
   */
  getClaims(): Claim[] {
    return [...this.claims];
  }

  /**
   * Filter claims by evidence level
   */
  getClaimsByLevel(level: EvidenceLevel): Claim[] {
    return this.claims.filter(c => c.level === level);
  }

  /**
   * Generate epistemic report
   */
  report(): string {
    const lines: string[] = [
      '# Epistemic Report',
      '',
      `Total claims: ${this.claims.length}`,
      '',
      '## By Evidence Level',
      '',
    ];

    for (const level of Object.keys(LEVEL_PRIORITY) as EvidenceLevel[]) {
      const count = this.claims.filter(c => c.level === level).length;
      const canState = this.canStateAsFact(level) ? '(factual)' : '(requires qualification)';
      lines.push(`- ${level}: ${count} ${canState}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let epistemicStackInstance: EpistemicStack | null = null;

export function createEpistemicStack(): EpistemicStack {
  return new EpistemicStack();
}

export function getEpistemicStack(): EpistemicStack {
  if (!epistemicStackInstance) {
    epistemicStackInstance = createEpistemicStack();
  }
  return epistemicStackInstance;
}

export function resetEpistemicStack(): void {
  epistemicStackInstance = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a response contains unqualified speculative claims
 */
export function checkResponse(response: string): ClaimValidation[] {
  const stack = getEpistemicStack();
  const sentences = response.split(/[.!?]+/).filter(s => s.trim());
  const validations: ClaimValidation[] = [];

  for (const sentence of sentences) {
    const validation = stack.validate(sentence.trim());
    if (!validation.valid) {
      validations.push(validation);
    }
  }

  return validations;
}

/**
 * Sanitize response to qualify speculative claims
 */
export function sanitizeResponse(response: string): string {
  let sanitized = response;

  for (const { pattern, level } of FORBIDDEN_CLAIMS) {
    const prefix = LEVEL_PREFIXES[level];
    if (prefix) {
      // Replace unqualified claims with qualified versions
      sanitized = sanitized.replace(pattern, (match) => {
        // Check if already qualified
        const context = sanitized.substring(0, sanitized.indexOf(match));
        if (context.toLowerCase().includes(prefix.toLowerCase().trim())) {
          return match;
        }
        return `${prefix.trim()} ${match.toLowerCase()}`;
      });
    }
  }

  return sanitized;
}
