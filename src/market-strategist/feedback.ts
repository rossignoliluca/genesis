/**
 * Genesis v19.1 - Feedback Engine (Loop 1)
 *
 * Tracks positioning predictions, scores them against market data,
 * computes rolling track record, and generates calibration profiles
 * to cap conviction on asset classes where we've been wrong.
 */

import { randomUUID } from 'crypto';
import type {
  MarketBrief,
  AssetSnapshot,
  Prediction,
  TrackRecord,
  AssetClassScore,
  CalibrationProfile,
  ASSET_CLASS_PROXIES,
} from './types.js';
import { ASSET_CLASS_PROXIES as PROXIES } from './types.js';

// ============================================================================
// Feedback Engine
// ============================================================================

export class FeedbackEngine {

  /**
   * Convert positioning views from a brief into trackable Predictions.
   * Matches each position to an entry price from current market data.
   */
  createPredictions(brief: MarketBrief): Prediction[] {
    const predictions: Prediction[] = [];

    for (const pos of brief.positioning) {
      const proxyName = PROXIES[pos.assetClass] || pos.assetClass;
      const market = brief.snapshot.markets.find(m => m.name === proxyName);

      if (!market || market.level === 'N/A') continue;

      const entryPrice = parseFloat(market.level.replace(/,/g, '').replace('%', ''));
      if (isNaN(entryPrice)) continue;

      // Compute confidence interval based on conviction
      const ciMap: Record<string, [number, number]> = {
        high: [0.65, 0.90],
        medium: [0.45, 0.70],
        low: [0.25, 0.50],
      };
      const ci = ciMap[pos.conviction] || [0.35, 0.65];

      predictions.push({
        id: randomUUID(),
        week: brief.week,
        date: brief.date,
        assetClass: pos.assetClass,
        position: pos.position,
        conviction: pos.conviction,
        rationale: pos.rationale,
        entryPrice,
        entryTicker: proxyName,
        timeframeWeeks: 4,
        outcome: 'pending',
        confidenceInterval: ci,
      });
    }

    return predictions;
  }

  /**
   * Score pending predictions that have expired (>= timeframeWeeks old).
   * Compares entry price with current market price to determine outcome.
   */
  scorePredictions(
    pending: Prediction[],
    currentMarkets: AssetSnapshot[],
  ): Prediction[] {
    const now = new Date();
    const scored: Prediction[] = [];

    for (const pred of pending) {
      if (pred.outcome !== 'pending') continue;

      // Check if prediction has expired
      const predDate = new Date(pred.date);
      const weeksElapsed = (now.getTime() - predDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
      if (weeksElapsed < pred.timeframeWeeks) continue;

      // Find current price for this asset
      const market = currentMarkets.find(m => m.name === pred.entryTicker);
      if (!market || market.level === 'N/A') continue;

      const exitPrice = parseFloat(market.level.replace(/,/g, '').replace('%', ''));
      if (isNaN(exitPrice)) continue;

      // Calculate directional P&L
      const pnlPercent = pred.position === 'long'
        ? ((exitPrice - pred.entryPrice) / pred.entryPrice) * 100
        : pred.position === 'short'
          ? ((pred.entryPrice - exitPrice) / pred.entryPrice) * 100
          : 0;

      // Determine outcome based on direction
      let outcome: Prediction['outcome'];
      if (pred.position === 'neutral') {
        outcome = 'neutral';
      } else if (pnlPercent > 0.5) {
        outcome = 'correct';
      } else if (pnlPercent < -0.5) {
        outcome = 'incorrect';
      } else {
        outcome = 'neutral'; // within ±0.5% is a wash
      }

      scored.push({
        ...pred,
        exitPrice,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        outcome,
        scoredAt: now.toISOString(),
      });
    }

    return scored;
  }

  /**
   * Compute rolling track record from all predictions (scored + pending).
   * Uses a rolling window (default 26 weeks = 6 months).
   */
  computeTrackRecord(
    allPredictions: Prediction[],
    windowWeeks = 26,
  ): TrackRecord {
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowWeeks * 7 * 24 * 60 * 60 * 1000);

    // Filter to window
    const inWindow = allPredictions.filter(p =>
      new Date(p.date) >= cutoff
    );
    const scored = inWindow.filter(p =>
      p.outcome && p.outcome !== 'pending'
    );

    // Overall stats
    const correct = scored.filter(p => p.outcome === 'correct').length;
    const incorrect = scored.filter(p => p.outcome === 'incorrect').length;
    const neutral = scored.filter(p => p.outcome === 'neutral').length;
    const directional = correct + incorrect;
    const overallHitRate = directional > 0 ? correct / directional : 0;
    const overallAvgPnl = scored.length > 0
      ? scored.reduce((sum, p) => sum + (p.pnlPercent || 0), 0) / scored.length
      : 0;

    // Per asset class
    const assetClasses = [...new Set(inWindow.map(p => p.assetClass))];
    const byAssetClass: AssetClassScore[] = assetClasses.map(ac => {
      const acPreds = scored.filter(p => p.assetClass === ac);
      const acCorrect = acPreds.filter(p => p.outcome === 'correct').length;
      const acIncorrect = acPreds.filter(p => p.outcome === 'incorrect').length;
      const acNeutral = acPreds.filter(p => p.outcome === 'neutral').length;
      const acDirectional = acCorrect + acIncorrect;
      const avgPnl = acPreds.length > 0
        ? acPreds.reduce((sum, p) => sum + (p.pnlPercent || 0), 0) / acPreds.length
        : 0;

      // Calculate streak (consecutive results, latest first)
      const sorted = acPreds
        .filter(p => p.outcome === 'correct' || p.outcome === 'incorrect')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      let streak = 0;
      if (sorted.length > 0) {
        const firstOutcome = sorted[0].outcome;
        for (const p of sorted) {
          if (p.outcome === firstOutcome) {
            streak += firstOutcome === 'correct' ? 1 : -1;
          } else break;
        }
      }

      return {
        assetClass: ac,
        hitRate: acDirectional > 0 ? acCorrect / acDirectional : 0,
        totalCalls: inWindow.filter(p => p.assetClass === ac).length,
        correct: acCorrect,
        incorrect: acIncorrect,
        neutral: acNeutral,
        avgPnl: Math.round(avgPnl * 100) / 100,
        streak,
        lastCall: sorted[0],
      };
    });

    // Best and worst
    const ranked = [...byAssetClass]
      .filter(ac => (ac.correct + ac.incorrect) >= 1)
      .sort((a, b) => b.hitRate - a.hitRate);

    // Brier Score (Item 8)
    const brierScore = this.computeBrierScore(scored);
    const calibrationGrade = brierScore <= 0.15 ? 'A' as const
      : brierScore <= 0.25 ? 'B' as const
      : brierScore <= 0.35 ? 'C' as const
      : brierScore <= 0.45 ? 'D' as const
      : 'F' as const;

    // Base rate alpha (Item 8)
    const baseRateAlpha = this.computeBaseRateAlpha(overallHitRate, scored);

    // Per-conviction accuracy
    const byConviction: Record<string, { total: number; correct: number; hitRate: number }> = {};
    for (const level of ['high', 'medium', 'low']) {
      const preds = scored.filter(p => p.conviction === level && (p.outcome === 'correct' || p.outcome === 'incorrect'));
      const correct = preds.filter(p => p.outcome === 'correct').length;
      byConviction[level] = {
        total: preds.length,
        correct,
        hitRate: preds.length > 0 ? correct / preds.length : 0,
      };
    }

    return {
      asOf: now.toISOString().slice(0, 10),
      windowWeeks,
      totalPredictions: inWindow.length,
      scoredPredictions: scored.length,
      overallHitRate: Math.round(overallHitRate * 1000) / 1000,
      overallAvgPnl: Math.round(overallAvgPnl * 100) / 100,
      byAssetClass,
      bestAssetClass: ranked[0]?.assetClass || 'N/A',
      worstAssetClass: ranked[ranked.length - 1]?.assetClass || 'N/A',
      brierScore: Math.round(brierScore * 1000) / 1000,
      calibrationGrade,
      baseRateAlpha: Math.round(baseRateAlpha * 1000) / 1000,
      byConviction,
    };
  }

  /**
   * Compute Brier Score: mean squared error of probabilistic predictions.
   * Maps conviction to probability: high=0.75, medium=0.55, low=0.35
   * Perfect = 0, worst = 1, coin-flip = 0.25
   */
  private computeBrierScore(scored: Prediction[]): number {
    const directional = scored.filter(p => p.outcome === 'correct' || p.outcome === 'incorrect');
    if (directional.length === 0) return 0.25; // default to coin-flip

    // Calibrated mapping: probabilities should reflect observed hit rates per conviction level.
    // These are starting points; the system adjusts via calibration feedback.
    // high=80% (we should be right 4/5 times when highly convicted)
    // medium=60% (we should be right 3/5 times)
    // low=40% (barely above coin-flip, acknowledging uncertainty)
    const convictionToProb: Record<string, number> = { high: 0.80, medium: 0.60, low: 0.40 };
    let sumSquaredError = 0;

    for (const p of directional) {
      const prob = convictionToProb[p.conviction] || 0.5;
      const actual = p.outcome === 'correct' ? 1 : 0;
      sumSquaredError += (prob - actual) ** 2;
    }

    return sumSquaredError / directional.length;
  }

  /**
   * Compute alpha over naive base rate.
   * S&P is up ~56% of weeks, so a coin-flip model gets 56%.
   * Positive alpha = adding value beyond random.
   */
  private computeBaseRateAlpha(hitRate: number, scored: Prediction[]): number {
    // Weighted base rate: different asset classes have different base rates
    const baseRates: Record<string, number> = {
      'US Equities': 0.56,       // S&P up ~56% of weeks
      'European Equities': 0.54,
      'Gold': 0.55,
      'US Treasuries': 0.50,     // yields are roughly 50/50
      'Credit': 0.52,
      'USD': 0.50,
      'Crypto': 0.53,
      'EM Equities': 0.52,
      'Oil': 0.51,
    };

    if (scored.length === 0) return 0;

    // Compute weighted base rate for actual prediction mix
    let totalWeight = 0;
    let weightedBaseRate = 0;
    for (const p of scored) {
      const br = baseRates[p.assetClass] || 0.50;
      totalWeight++;
      weightedBaseRate += br;
    }

    const avgBaseRate = totalWeight > 0 ? weightedBaseRate / totalWeight : 0.50;
    return hitRate - avgBaseRate;
  }

  /**
   * Generate calibration profile from track record.
   * If hitRate < 40% on an asset class → cap conviction to "low"
   * If hitRate < 70% → cap to "medium"
   * Otherwise → no cap ("high" allowed)
   */
  generateCalibration(trackRecord: TrackRecord): CalibrationProfile {
    const adjustments: CalibrationProfile['adjustments'] = [];

    for (const ac of trackRecord.byAssetClass) {
      const directional = ac.correct + ac.incorrect;
      if (directional < 5) {
        // Not enough data for reliable calibration (need >= 5 calls)
        continue;
      }

      let suggestedConvictionCap: 'high' | 'medium' | 'low';
      let note: string;

      if (ac.hitRate < 0.4) {
        suggestedConvictionCap = 'low';
        note = `${ac.correct}/${directional} correct (${(ac.hitRate * 100).toFixed(0)}%) — below coin-flip threshold, force low conviction`;
      } else if (ac.hitRate < 0.7) {
        suggestedConvictionCap = 'medium';
        note = `${ac.correct}/${directional} correct (${(ac.hitRate * 100).toFixed(0)}%) — moderate accuracy, cap at medium`;
      } else {
        suggestedConvictionCap = 'high';
        note = `${ac.correct}/${directional} correct (${(ac.hitRate * 100).toFixed(0)}%) — strong track record`;
      }

      adjustments.push({
        assetClass: ac.assetClass,
        hitRate: ac.hitRate,
        suggestedConvictionCap,
        note,
      });
    }

    return {
      asOf: trackRecord.asOf,
      adjustments,
    };
  }
}
