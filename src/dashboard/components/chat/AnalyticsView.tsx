/**
 * AnalyticsView - Chat Analytics Dashboard
 *
 * Phase 3.5: Comprehensive analytics including token usage, costs,
 * latency metrics, cache performance, and memory efficiency.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Analytics {
  totalConversations: number;
  totalMessages: number;
  totalTokens: { input: number; output: number };
  estimatedCost: number;
  modelUsage: Record<string, number>;
  averageLatency: number;
  cacheHitRate: number;
  workspaceMetrics: {
    reuseRate: number;
    anticipationAccuracy: number;
  };
}

interface AnalyticsViewProps {
  isOpen: boolean;
  onClose: () => void;
  dashboardUrl?: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  isOpen,
  onClose,
  dashboardUrl = 'http://localhost:9876',
}) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'all'>('all');

  // Fetch analytics
  useEffect(() => {
    if (!isOpen) return;

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${dashboardUrl}/api/chat/analytics`);
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data);
        }
      } catch {
        // Ignore fetch errors
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [isOpen, dashboardUrl]);

  // Calculate derived metrics
  const derivedMetrics = useMemo(() => {
    if (!analytics) return null;

    const totalTokens = analytics.totalTokens.input + analytics.totalTokens.output;
    const avgTokensPerMessage = analytics.totalMessages > 0
      ? totalTokens / analytics.totalMessages
      : 0;
    const avgMessagesPerConv = analytics.totalConversations > 0
      ? analytics.totalMessages / analytics.totalConversations
      : 0;

    return {
      totalTokens,
      avgTokensPerMessage,
      avgMessagesPerConv,
    };
  }, [analytics]);

  // Format numbers
  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${(cost * 1000).toFixed(2)}m`;
    return `$${cost.toFixed(2)}`;
  };

  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms.toFixed(0)}ms`;
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Analytics panel */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-gray-900 border-l border-gray-700 z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Analytics
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Time range selector */}
            <div className="flex gap-2 px-6 py-3 border-b border-gray-800">
              {(['day', 'week', 'month', 'all'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    timeRange === range
                      ? 'bg-cyan-900/50 text-cyan-300'
                      : 'text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  {range === 'all' ? 'All time' : range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-gray-600 border-t-cyan-400 rounded-full animate-spin" />
                </div>
              ) : analytics ? (
                <>
                  {/* Overview cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <MetricCard
                      label="Conversations"
                      value={formatNumber(analytics.totalConversations)}
                      subValue={`${formatNumber(derivedMetrics?.avgMessagesPerConv || 0)} avg msgs`}
                      icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      }
                      color="cyan"
                    />

                    <MetricCard
                      label="Messages"
                      value={formatNumber(analytics.totalMessages)}
                      subValue={`${formatNumber(derivedMetrics?.avgTokensPerMessage || 0)} avg tokens`}
                      icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      }
                      color="blue"
                    />

                    <MetricCard
                      label="Total Tokens"
                      value={formatNumber(derivedMetrics?.totalTokens || 0)}
                      subValue={`${formatNumber(analytics.totalTokens.input)} in / ${formatNumber(analytics.totalTokens.output)} out`}
                      icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      }
                      color="purple"
                    />

                    <MetricCard
                      label="Estimated Cost"
                      value={formatCost(analytics.estimatedCost)}
                      subValue="based on API pricing"
                      icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                      color="green"
                    />
                  </div>

                  {/* Performance metrics */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-3">Performance</h3>
                    <div className="space-y-3">
                      <ProgressMetric
                        label="Average Latency"
                        value={formatLatency(analytics.averageLatency)}
                        percentage={Math.min(100, (analytics.averageLatency / 5000) * 100)}
                        color="bg-cyan-500"
                        target="< 2s"
                      />

                      <ProgressMetric
                        label="Cache Hit Rate"
                        value={formatPercent(analytics.cacheHitRate)}
                        percentage={analytics.cacheHitRate * 100}
                        color="bg-green-500"
                        target="> 50%"
                      />

                      <ProgressMetric
                        label="Memory Reuse Rate"
                        value={formatPercent(analytics.workspaceMetrics.reuseRate)}
                        percentage={analytics.workspaceMetrics.reuseRate * 100}
                        color="bg-purple-500"
                        target="54-60%"
                      />

                      <ProgressMetric
                        label="Anticipation Accuracy"
                        value={formatPercent(analytics.workspaceMetrics.anticipationAccuracy)}
                        percentage={analytics.workspaceMetrics.anticipationAccuracy * 100}
                        color="bg-pink-500"
                        target="> 55%"
                      />
                    </div>
                  </div>

                  {/* Model usage */}
                  {Object.keys(analytics.modelUsage).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-300 mb-3">Model Usage</h3>
                      <div className="space-y-2">
                        {Object.entries(analytics.modelUsage)
                          .sort((a, b) => b[1] - a[1])
                          .map(([model, count]) => {
                            const total = Object.values(analytics.modelUsage).reduce((a, b) => a + b, 0);
                            const percentage = (count / total) * 100;

                            return (
                              <div key={model} className="flex items-center gap-3">
                                <div className="flex-1">
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-300 font-mono text-xs truncate max-w-[200px]">
                                      {model}
                                    </span>
                                    <span className="text-gray-500">{count}</span>
                                  </div>
                                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${percentage}%` }}
                                      transition={{ duration: 0.5 }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Savings summary */}
                  <div className="bg-gradient-to-br from-cyan-900/30 to-purple-900/30 rounded-xl p-4 border border-cyan-800/30">
                    <h3 className="text-sm font-medium text-white mb-2">Optimization Savings</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-400">Cache savings</div>
                        <div className="text-lg font-medium text-green-400">
                          ~{formatLatency(analytics.cacheHitRate * analytics.totalMessages * 2000)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Memory reuse</div>
                        <div className="text-lg font-medium text-purple-400">
                          {formatPercent(analytics.workspaceMetrics.reuseRate)} hit rate
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  Unable to load analytics
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Metric card component
const MetricCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  color: 'cyan' | 'blue' | 'purple' | 'green' | 'pink';
}> = ({ label, value, subValue, icon, color }) => {
  const colorClasses = {
    cyan: 'bg-cyan-900/30 text-cyan-400 border-cyan-800/50',
    blue: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
    purple: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
    green: 'bg-green-900/30 text-green-400 border-green-800/50',
    pink: 'bg-pink-900/30 text-pink-400 border-pink-800/50',
  };

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={colorClasses[color].split(' ')[1]}>{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
};

// Progress metric component
const ProgressMetric: React.FC<{
  label: string;
  value: string;
  percentage: number;
  color: string;
  target?: string;
}> = ({ label, value, percentage, color, target }) => (
  <div>
    <div className="flex justify-between text-sm mb-1">
      <span className="text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-white font-medium">{value}</span>
        {target && <span className="text-xs text-gray-600">target: {target}</span>}
      </div>
    </div>
    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, percentage)}%` }}
        transition={{ duration: 0.5 }}
      />
    </div>
  </div>
);

export default AnalyticsView;
