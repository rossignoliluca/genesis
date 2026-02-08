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
    };
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
      if (directional < 2) {
        // Not enough data to calibrate
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
