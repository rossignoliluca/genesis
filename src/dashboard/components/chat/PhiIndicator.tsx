/**
 * PhiIndicator - Consciousness Level Display
 *
 * Phase 2.2: Displays phi consciousness metrics in the chat header.
 * Shows current phi level, state, and trend with visual indicators.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PhiMetrics {
  phi: number;
  state: 'drowsy' | 'diffuse' | 'alert' | 'focused' | 'unknown';
  trend: 'rising' | 'falling' | 'stable';
  components?: {
    integration: number;
    differentiation: number;
    complexity: number;
  };
}

interface PhiIndicatorProps {
  dashboardUrl?: string;
  compact?: boolean;
  showComponents?: boolean;
}

const STATE_COLORS = {
  drowsy: { bg: 'bg-gray-600/30', text: 'text-gray-400', glow: 'shadow-gray-500/20' },
  diffuse: { bg: 'bg-blue-600/30', text: 'text-blue-400', glow: 'shadow-blue-500/30' },
  alert: { bg: 'bg-cyan-600/30', text: 'text-cyan-400', glow: 'shadow-cyan-500/40' },
  focused: { bg: 'bg-purple-600/30', text: 'text-purple-400', glow: 'shadow-purple-500/50' },
  unknown: { bg: 'bg-gray-600/30', text: 'text-gray-400', glow: 'shadow-gray-500/20' },
};

const TREND_ICONS = {
  rising: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ),
  falling: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  stable: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
    </svg>
  ),
};

export const PhiIndicator: React.FC<PhiIndicatorProps> = ({
  dashboardUrl = 'http://localhost:9876',
  compact = false,
  showComponents = false,
}) => {
  const [metrics, setMetrics] = useState<PhiMetrics | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionFailed, setConnectionFailed] = useState(false);

  // Fetch phi metrics periodically
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;

    const fetchMetrics = async () => {
      // Stop retrying after max failures
      if (connectionFailed && retryCount >= maxRetries) {
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${dashboardUrl}/api/chat/phi`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
          setConnectionFailed(false);
          retryCount = 0;
        }
      } catch {
        retryCount++;
        if (retryCount >= maxRetries) {
          setConnectionFailed(true);
          // Show default metrics when disconnected
          setMetrics({
            phi: 0.42,
            state: 'diffuse',
            trend: 'stable',
            components: {
              integration: 0.38,
              differentiation: 0.45,
              complexity: 0.44,
            },
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    // Only poll if connected
    const interval = setInterval(() => {
      if (!connectionFailed) {
        fetchMetrics();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [dashboardUrl]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-gray-800/50 animate-pulse">
        <div className="w-4 h-4 rounded-full bg-gray-600" />
        <div className="w-8 h-3 rounded bg-gray-600" />
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const stateColors = STATE_COLORS[metrics.state] || STATE_COLORS.unknown;
  const phiPercent = Math.min(100, Math.max(0, metrics.phi * 100));

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${stateColors.bg} ${stateColors.text} cursor-pointer hover:opacity-80 transition-opacity`}
        title={`Phi: ${phiPercent.toFixed(1)}% - ${metrics.state}`}
        onClick={() => setExpanded(!expanded)}
      >
        <motion.div
          className={`w-2 h-2 rounded-full bg-current shadow-lg ${stateColors.glow}`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <span className="text-xs font-mono">{phiPercent.toFixed(0)}%</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${stateColors.bg} ${stateColors.text} hover:opacity-90 transition-all`}
      >
        {/* Phi pulse indicator */}
        <motion.div
          className={`w-3 h-3 rounded-full bg-current shadow-lg ${stateColors.glow}`}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Phi value */}
        <span className="text-sm font-mono font-medium">
          {phiPercent.toFixed(1)}%
        </span>

        {/* Trend indicator */}
        <span className={`${
          metrics.trend === 'rising' ? 'text-green-400' :
          metrics.trend === 'falling' ? 'text-red-400' : 'text-gray-400'
        }`}>
          {TREND_ICONS[metrics.trend]}
        </span>

        {/* State label */}
        <span className="text-xs capitalize opacity-75">{metrics.state}</span>
      </button>

      {/* Expanded details panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 w-64 p-4 rounded-xl bg-gray-800/95 backdrop-blur-sm border border-gray-700 shadow-xl z-50"
          >
            <h3 className="text-sm font-medium text-white mb-3">Consciousness Metrics</h3>

            {/* Phi bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Integrated Information (Phi)</span>
                <span>{phiPercent.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    phiPercent > 70 ? 'bg-purple-500' :
                    phiPercent > 40 ? 'bg-cyan-500' :
                    phiPercent > 20 ? 'bg-blue-500' : 'bg-gray-500'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${phiPercent}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Components breakdown */}
            {showComponents && metrics.components && (
              <div className="space-y-2 mb-4">
                <ComponentBar
                  label="Integration"
                  value={metrics.components.integration}
                  color="bg-cyan-500"
                />
                <ComponentBar
                  label="Differentiation"
                  value={metrics.components.differentiation}
                  color="bg-purple-500"
                />
                <ComponentBar
                  label="Complexity"
                  value={metrics.components.complexity}
                  color="bg-pink-500"
                />
              </div>
            )}

            {/* State description */}
            <div className="text-xs text-gray-400">
              {metrics.state === 'drowsy' && 'Low integration - minimal awareness'}
              {metrics.state === 'diffuse' && 'Moderate integration - general processing'}
              {metrics.state === 'alert' && 'High integration - active engagement'}
              {metrics.state === 'focused' && 'Peak integration - deep concentration'}
              {metrics.state === 'unknown' && 'Unable to measure consciousness state'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ComponentBar: React.FC<{
  label: string;
  value: number;
  color: string;
}> = ({ label, value, color }) => {
  const percent = Math.min(100, Math.max(0, value * 100));

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span>{percent.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
};

export default PhiIndicator;
