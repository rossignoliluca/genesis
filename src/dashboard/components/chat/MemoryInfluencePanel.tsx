/**
 * MemoryInfluencePanel - Memory Context Visualization
 *
 * Phase 3.4: Shows which memories influenced the current response,
 * with activation levels, source types, and token attribution.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MemoryItem {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  content: string;
  activation: number;
  relevance: number;
  source: 'anticipate' | 'recall' | 'association' | 'manual';
  tokens?: number;
  accessCount?: number;
  addedAt?: number;
}

interface MemoryInfluencePanelProps {
  memories: MemoryItem[];
  isOpen: boolean;
  onClose: () => void;
  onMemoryClick?: (memory: MemoryItem) => void;
}

const TYPE_COLORS = {
  episodic: { bg: 'bg-blue-900/30', text: 'text-blue-300', border: 'border-blue-700/50' },
  semantic: { bg: 'bg-green-900/30', text: 'text-green-300', border: 'border-green-700/50' },
  procedural: { bg: 'bg-purple-900/30', text: 'text-purple-300', border: 'border-purple-700/50' },
};

const SOURCE_LABELS = {
  anticipate: 'Anticipated',
  recall: 'Recalled',
  association: 'Associated',
  manual: 'Manual',
};

export const MemoryInfluencePanel: React.FC<MemoryInfluencePanelProps> = ({
  memories,
  isOpen,
  onClose,
  onMemoryClick,
}) => {
  // Group by type
  const groupedMemories = useMemo(() => {
    const groups: Record<string, MemoryItem[]> = {};
    for (const mem of memories) {
      if (!groups[mem.type]) {
        groups[mem.type] = [];
      }
      groups[mem.type].push(mem);
    }
    // Sort each group by activation
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => b.activation - a.activation);
    }
    return groups;
  }, [memories]);

  // Calculate stats
  const stats = useMemo(() => {
    if (memories.length === 0) return null;

    const totalTokens = memories.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const avgActivation = memories.reduce((sum, m) => sum + m.activation, 0) / memories.length;
    const anticipatedCount = memories.filter(m => m.source === 'anticipate').length;

    return {
      totalTokens,
      avgActivation,
      anticipationHitRate: anticipatedCount / memories.length,
      typeBreakdown: {
        episodic: memories.filter(m => m.type === 'episodic').length,
        semantic: memories.filter(m => m.type === 'semantic').length,
        procedural: memories.filter(m => m.type === 'procedural').length,
      },
    };
  }, [memories]);

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
            className="fixed inset-0 bg-black/30 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-900 border-l border-gray-700 z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h2 className="text-lg font-medium text-white">Memory Influence</h2>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {memories.length} items
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stats summary */}
            {stats && (
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/30">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-lg font-medium text-white">{memories.length}</div>
                    <div className="text-xs text-gray-500">Active</div>
                  </div>
                  <div>
                    <div className="text-lg font-medium text-cyan-400">
                      {(stats.avgActivation * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500">Avg Act.</div>
                  </div>
                  <div>
                    <div className="text-lg font-medium text-green-400">
                      {(stats.anticipationHitRate * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500">Anticipated</div>
                  </div>
                  <div>
                    <div className="text-lg font-medium text-purple-400">
                      {stats.totalTokens}
                    </div>
                    <div className="text-xs text-gray-500">Tokens</div>
                  </div>
                </div>
              </div>
            )}

            {/* Memory list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {memories.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No memories active for this response
                </div>
              ) : (
                Object.entries(groupedMemories).map(([type, mems]) => (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[type as keyof typeof TYPE_COLORS].text.replace('text-', 'bg-')}`} />
                      <h3 className="text-sm font-medium text-gray-300 capitalize">{type}</h3>
                      <span className="text-xs text-gray-600">{mems.length}</span>
                    </div>

                    <div className="space-y-2">
                      {mems.map((mem, idx) => {
                        const colors = TYPE_COLORS[mem.type];

                        return (
                          <motion.div
                            key={mem.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            onClick={() => onMemoryClick?.(mem)}
                            className={`p-3 rounded-lg border ${colors.bg} ${colors.border} cursor-pointer hover:opacity-90 transition-opacity`}
                          >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                {SOURCE_LABELS[mem.source]}
                              </span>
                              <div className="flex items-center gap-2">
                                {mem.tokens && (
                                  <span className="text-xs text-gray-500">{mem.tokens} tok</span>
                                )}
                                <span className="text-xs text-gray-600">
                                  x{mem.accessCount || 1}
                                </span>
                              </div>
                            </div>

                            {/* Content preview */}
                            <div className="text-sm text-gray-300 line-clamp-2 mb-2">
                              {typeof mem.content === 'string'
                                ? mem.content
                                : JSON.stringify(mem.content).slice(0, 100)}
                            </div>

                            {/* Activation bar */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-14">Activation</span>
                              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${
                                    mem.activation > 0.7 ? 'bg-green-500' :
                                    mem.activation > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${mem.activation * 100}%` }}
                                  transition={{ duration: 0.3 }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 w-10 text-right">
                                {(mem.activation * 100).toFixed(0)}%
                              </span>
                            </div>

                            {/* Relevance bar */}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500 w-14">Relevance</span>
                              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full bg-cyan-500"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${mem.relevance * 100}%` }}
                                  transition={{ duration: 0.3, delay: 0.1 }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 w-10 text-right">
                                {(mem.relevance * 100).toFixed(0)}%
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/30">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Workspace capacity: {memories.length}/7</span>
                <span>Click memory for details</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MemoryInfluencePanel;
