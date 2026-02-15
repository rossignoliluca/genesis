/**
 * Evaluation Layer — EFE-based candidate scoring
 *
 * Uses Expected Free Energy decomposition:
 *   EFE = epistemicValue + pragmaticValue - complexityCost - riskPenalty
 *
 * Decision: adopt if EFE > adoptionThreshold
 */

import {
  CandidateCapability,
  EvaluationResult,
  HorizonScannerConfig,
} from './types.js';

export class EvaluationLayer {
  constructor(
    private config: HorizonScannerConfig,
    private existingServers: string[],
    private existingCapabilities: Map<string, string>,
  ) {}

  async evaluate(candidate: CandidateCapability): Promise<EvaluationResult> {
    const epistemicValue = this.computeEpistemicValue(candidate);
    const pragmaticValue = this.computePragmaticValue(candidate);
    const complexityCost = this.computeComplexityCost(candidate);
    const riskPenalty = this.computeRiskPenalty(candidate);

    const expectedFreeEnergy = epistemicValue + pragmaticValue - complexityCost - riskPenalty;

    let decision: 'adopt' | 'defer' | 'reject';
    if (expectedFreeEnergy > this.config.adoptionThreshold) {
      decision = 'adopt';
    } else if (expectedFreeEnergy > this.config.adoptionThreshold * 0.5) {
      decision = 'defer';
    } else {
      decision = 'reject';
    }

    return {
      candidateId: candidate.id,
      expectedFreeEnergy,
      epistemicValue,
      pragmaticValue,
      complexityCost,
      riskPenalty,
      decision,
      reasoning: this.generateReasoning(candidate, decision, expectedFreeEnergy, {
        epistemicValue, pragmaticValue, complexityCost, riskPenalty,
      }),
      evaluatedAt: new Date().toISOString(),
    };
  }

  private computeEpistemicValue(candidate: CandidateCapability): number {
    let value = 0;

    // Novel capability (not overlapping with existing)
    const hasOverlap = this.existingServers.some(s =>
      candidate.packageName.includes(s) || s.includes(candidate.packageName.replace(/@.*\//, ''))
    );
    value += hasOverlap ? 0.1 : 0.4;

    // Domain relevance
    if (this.config.activeDomains.includes(candidate.category)) {
      value += 0.3;
    }

    // Community signal (stars/downloads)
    if (candidate.weeklyDownloads && candidate.weeklyDownloads > 1000) {
      value += Math.min(0.2, Math.log10(candidate.weeklyDownloads) / 20);
    }

    return Math.min(1.0, value);
  }

  private computePragmaticValue(candidate: CandidateCapability): number {
    let value = 0;

    // Category priority mapping
    const priorityMap: Record<string, number> = {
      finance: 0.4,
      research: 0.35,
      development: 0.3,
      content: 0.25,
      communication: 0.2,
      data: 0.2,
      general: 0.1,
    };
    value += priorityMap[candidate.category] ?? 0.1;

    // Recency bonus — newer packages more likely to be relevant
    if (candidate.lastPublished) {
      const daysSince = (Date.now() - new Date(candidate.lastPublished).getTime()) / (86400000);
      if (daysSince < 30) value += 0.2;
      else if (daysSince < 90) value += 0.1;
    }

    return Math.min(1.0, value);
  }

  private computeComplexityCost(candidate: CandidateCapability): number {
    let cost = 0;

    // Server count approaching limit
    const serverRatio = this.existingServers.length / this.config.maxMcpServers;
    cost += serverRatio * 0.3;

    // Base overhead per new server
    cost += 0.1;

    return Math.min(1.0, cost);
  }

  private computeRiskPenalty(candidate: CandidateCapability): number {
    let risk = 0;

    // Unknown transport risk
    if (candidate.transport !== 'stdio') {
      risk += 0.15;
    }

    // No community signal = higher risk
    if (!candidate.weeklyDownloads || candidate.weeklyDownloads < 100) {
      risk += 0.2;
    }

    // Very new package (less than 30 days)
    if (candidate.lastPublished) {
      const daysSince = (Date.now() - new Date(candidate.lastPublished).getTime()) / 86400000;
      if (daysSince < 14) risk += 0.15;
    }

    return Math.min(1.0, risk);
  }

  private generateReasoning(
    candidate: CandidateCapability,
    decision: string,
    efe: number,
    scores: Record<string, number>,
  ): string {
    return `${candidate.packageName} → ${decision} (EFE=${efe.toFixed(3)}) ` +
      `[epistemic=${scores.epistemicValue.toFixed(2)}, pragmatic=${scores.pragmaticValue.toFixed(2)}, ` +
      `complexity=${scores.complexityCost.toFixed(2)}, risk=${scores.riskPenalty.toFixed(2)}]`;
  }
}
