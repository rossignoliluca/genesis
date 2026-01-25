/**
 * Genesis Observatory UI - Neuromodulation Display Component
 *
 * Visualizes neuromodulator levels (dopamine, serotonin, norepinephrine, cortisol)
 * and their computed effects on system behavior.
 */

import type { NeuromodDisplayData } from '../types.js';
import type { SystemMetrics } from '../../observability/dashboard.js';

// ============================================================================
// Neuromod Display Data Provider
// ============================================================================

export class NeuromodDisplay {
  private data: NeuromodDisplayData;
  private subscribers: Set<(data: NeuromodDisplayData) => void> = new Set();
  private history: Array<{ timestamp: number; data: NeuromodDisplayData }> = [];
  private maxHistory = 60; // Keep 1 minute of history

  constructor(initialData?: NeuromodDisplayData) {
    this.data = initialData || this.getDefaultData();
  }

  /**
   * Update neuromod data from metrics
   */
  update(metrics: SystemMetrics): void {
    const { state } = metrics.consciousness;
    const levels = this.inferNeuromodLevels(state);

    this.data = {
      ...levels,
      dominantState: this.computeDominantState(levels),
      explorationRate: this.computeExplorationRate(levels.dopamine, levels.cortisol),
      temporalDiscount: this.computeTemporalDiscount(levels.serotonin),
      precisionGain: this.computePrecisionGain(levels.norepinephrine),
      riskTolerance: this.computeRiskTolerance(levels.cortisol),
    };

    this.addToHistory();
    this.notifySubscribers();
  }

  /**
   * Get current neuromod data
   */
  getData(): NeuromodDisplayData {
    return { ...this.data };
  }

  /**
   * Subscribe to neuromod updates
   */
  subscribe(callback: (data: NeuromodDisplayData) => void): () => void {
    this.subscribers.add(callback);
    callback(this.data);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get visualization data for each neuromodulator
   */
  getVisualizationData(): Array<{
    name: string;
    level: number;
    color: string;
    label: string;
    description: string;
  }> {
    const { dopamine, serotonin, norepinephrine, cortisol } = this.data;

    return [
      {
        name: 'Dopamine',
        level: dopamine,
        color: '#ff6b9d',
        label: 'Exploration',
        description: this.getDopamineDescription(dopamine),
      },
      {
        name: 'Serotonin',
        level: serotonin,
        color: '#4dd0e1',
        label: 'Patience',
        description: this.getSerotoninDescription(serotonin),
      },
      {
        name: 'Norepinephrine',
        level: norepinephrine,
        color: '#ffa726',
        label: 'Alertness',
        description: this.getNorepinephrineDescription(norepinephrine),
      },
      {
        name: 'Cortisol',
        level: cortisol,
        color: '#ef5350',
        label: 'Stress',
        description: this.getCortisolDescription(cortisol),
      },
    ];
  }

  /**
   * Get dominant state visualization
   */
  getDominantStateVisualization(): {
    state: string;
    color: string;
    icon: string;
    description: string;
  } {
    const { dominantState } = this.data;

    const stateMap = {
      calm: {
        color: '#4dd0e1',
        icon: '🧘',
        description: 'System is relaxed and balanced',
      },
      focused: {
        color: '#ffa726',
        icon: '🎯',
        description: 'High precision and attention',
      },
      stressed: {
        color: '#ef5350',
        icon: '⚠️',
        description: 'Under pressure, survival mode',
      },
      excited: {
        color: '#ff6b9d',
        icon: '⚡',
        description: 'High exploration and reward-seeking',
      },
      threat: {
        color: '#ff4444',
        icon: '🚨',
        description: 'Threat detected, defensive mode',
      },
    };

    return {
      state: dominantState,
      ...stateMap[dominantState],
    };
  }

  /**
   * Get behavioral effect indicators
   */
  getBehavioralEffects(): Array<{
    name: string;
    value: number;
    display: string;
    color: string;
  }> {
    const { explorationRate, temporalDiscount, precisionGain, riskTolerance } = this.data;

    return [
      {
        name: 'Exploration',
        value: explorationRate,
        display: `${(explorationRate * 100).toFixed(0)}%`,
        color: this.getEffectColor(explorationRate),
      },
      {
        name: 'Patience',
        value: temporalDiscount,
        display: `${(temporalDiscount * 100).toFixed(0)}%`,
        color: this.getEffectColor(temporalDiscount),
      },
      {
        name: 'Precision',
        value: precisionGain,
        display: `${precisionGain.toFixed(2)}x`,
        color: this.getEffectColor(precisionGain / 2.0), // Normalize to 0-1
      },
      {
        name: 'Risk Tolerance',
        value: riskTolerance,
        display: `${(riskTolerance * 100).toFixed(0)}%`,
        color: this.getEffectColor(riskTolerance),
      },
    ];
  }

  /**
   * Get historical data for sparkline charts
   */
  getHistory(neuromodulator: keyof Pick<NeuromodDisplayData, 'dopamine' | 'serotonin' | 'norepinephrine' | 'cortisol'>): number[] {
    return this.history.map((h) => h.data[neuromodulator]);
  }

  /**
   * Get trend for a neuromodulator
   */
  getTrend(neuromodulator: keyof Pick<NeuromodDisplayData, 'dopamine' | 'serotonin' | 'norepinephrine' | 'cortisol'>): 'rising' | 'falling' | 'stable' {
    if (this.history.length < 2) return 'stable';

    const recent = this.history.slice(-10);
    const first = recent[0].data[neuromodulator];
    const last = recent[recent.length - 1].data[neuromodulator];
    const delta = last - first;

    if (delta > 0.1) return 'rising';
    if (delta < -0.1) return 'falling';
    return 'stable';
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private inferNeuromodLevels(state: string): {
    dopamine: number;
    serotonin: number;
    norepinephrine: number;
    cortisol: number;
  } {
    const s = state.toLowerCase();

    return {
      dopamine: s.includes('reward') || s.includes('excit') ? 0.7 : 0.5,
      serotonin: s.includes('calm') || s.includes('stable') ? 0.7 : 0.4,
      norepinephrine: s.includes('focus') || s.includes('vigilant') ? 0.7 : 0.4,
      cortisol: s.includes('threat') || s.includes('critical') ? 0.8 : 0.3,
    };
  }

  private computeDominantState(levels: {
    dopamine: number;
    serotonin: number;
    norepinephrine: number;
    cortisol: number;
  }): NeuromodDisplayData['dominantState'] {
    const { dopamine, serotonin, norepinephrine, cortisol } = levels;

    if (cortisol > 0.7) return 'threat';
    if (dopamine > 0.6 && dopamine > norepinephrine) return 'excited';
    if (norepinephrine > 0.6) return 'focused';
    if (serotonin > 0.6) return 'calm';
    return 'stressed';
  }

  private computeExplorationRate(dopamine: number, cortisol: number): number {
    return Math.max(0, Math.min(1, 0.5 + dopamine * 1.0 - cortisol * 0.3));
  }

  private computeTemporalDiscount(serotonin: number): number {
    return 0.99 - (1 - serotonin) * 0.3;
  }

  private computePrecisionGain(norepinephrine: number): number {
    return 0.5 + norepinephrine * 1.5;
  }

  private computeRiskTolerance(cortisol: number): number {
    return Math.max(0.1, 1.0 - cortisol * 0.8);
  }

  private getDopamineDescription(level: number): string {
    if (level > 0.7) return 'High exploration, seeking novelty';
    if (level > 0.4) return 'Balanced exploration/exploitation';
    return 'Low motivation, exploiting known strategies';
  }

  private getSerotoninDescription(level: number): string {
    if (level > 0.7) return 'Patient, long-term focused';
    if (level > 0.4) return 'Moderate patience';
    return 'Impulsive, short-term optimization';
  }

  private getNorepinephrineDescription(level: number): string {
    if (level > 0.7) return 'Highly alert and precise';
    if (level > 0.4) return 'Moderate alertness';
    return 'Diffuse attention, creative mode';
  }

  private getCortisolDescription(level: number): string {
    if (level > 0.7) return 'High stress, survival mode';
    if (level > 0.4) return 'Moderate stress';
    return 'Relaxed, growth mode';
  }

  private getEffectColor(value: number): string {
    if (value > 0.7) return '#00ff88';
    if (value > 0.4) return '#ffaa00';
    return '#ff4444';
  }

  private addToHistory(): void {
    this.history.push({
      timestamp: Date.now(),
      data: { ...this.data },
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.data);
      } catch (err) {
        console.error('[NeuromodDisplay] Subscriber error:', err);
      }
    }
  }

  private getDefaultData(): NeuromodDisplayData {
    return {
      dopamine: 0.5,
      serotonin: 0.6,
      norepinephrine: 0.4,
      cortisol: 0.3,
      dominantState: 'calm',
      explorationRate: 0.5,
      temporalDiscount: 0.9,
      precisionGain: 1.0,
      riskTolerance: 0.7,
    };
  }
}

// ============================================================================
// Visualization Helpers
// ============================================================================

/**
 * Generate radial gauge path for neuromodulator level
 */
export function generateNeuromodGaugePath(
  level: number,
  radius: number,
  thickness: number
): string {
  const startAngle = -Math.PI / 2; // Top
  const endAngle = startAngle + (level * Math.PI * 2);

  const innerRadius = radius - thickness;
  const outerRadius = radius;

  const x1 = Math.cos(startAngle) * outerRadius;
  const y1 = Math.sin(startAngle) * outerRadius;
  const x2 = Math.cos(endAngle) * outerRadius;
  const y2 = Math.sin(endAngle) * outerRadius;
  const x3 = Math.cos(endAngle) * innerRadius;
  const y3 = Math.sin(endAngle) * innerRadius;
  const x4 = Math.cos(startAngle) * innerRadius;
  const y4 = Math.sin(startAngle) * innerRadius;

  const largeArc = level > 0.5 ? 1 : 0;

  return `
    M ${x1} ${y1}
    A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
    L ${x3} ${y3}
    A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
    Z
  `;
}

// ============================================================================
// Factory
// ============================================================================

let neuromodDisplayInstance: NeuromodDisplay | null = null;

export function getNeuromodDisplay(): NeuromodDisplay {
  if (!neuromodDisplayInstance) {
    neuromodDisplayInstance = new NeuromodDisplay();
  }
  return neuromodDisplayInstance;
}

export function createNeuromodDisplay(initialData?: NeuromodDisplayData): NeuromodDisplay {
  return new NeuromodDisplay(initialData);
}

export function resetNeuromodDisplay(): void {
  neuromodDisplayInstance = null;
}
