/**
 * ToolExecutionPanel - Real-time tool execution visualization
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatToolCall } from '../../stores/genesisStore';

interface ToolExecutionPanelProps {
  toolCalls: ChatToolCall[];
}

export const ToolExecutionPanel: React.FC<ToolExecutionPanelProps> = ({
  toolCalls,
}) => {
  if (toolCalls.length === 0) return null;

  const runningTools = toolCalls.filter(t => t.status === 'running');
  const completedTools = toolCalls.filter(t => t.status !== 'running' && t.status !== 'pending');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-4 p-4 bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl"
    >
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm font-medium text-white">Tool Execution</span>
        {runningTools.length > 0 && (
          <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded-full">
            {runningTools.length} running
          </span>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {toolCalls.map((tool) => (
            <ToolCallRow key={tool.id} tool={tool} />
          ))}
        </AnimatePresence>
      </div>

      {/* Summary */}
      {completedTools.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
          <span>
            {completedTools.filter(t => t.status === 'success').length} succeeded,{' '}
            {completedTools.filter(t => t.status === 'error').length} failed
          </span>
          <span>
            Total: {completedTools.reduce((acc, t) => acc + (t.duration || 0), 0)}ms
          </span>
        </div>
      )}
    </motion.div>
  );
};

const ToolCallRow: React.FC<{ tool: ChatToolCall }> = ({ tool }) => {
  const statusConfig = {
    pending: {
      icon: '○',
      color: 'text-gray-400',
      bg: 'bg-gray-700',
    },
    running: {
      icon: '●',
      color: 'text-yellow-400',
      bg: 'bg-yellow-900/30',
    },
    success: {
      icon: '✓',
      color: 'text-green-400',
      bg: 'bg-green-900/30',
    },
    error: {
      icon: '✗',
      color: 'text-red-400',
      bg: 'bg-red-900/30',
    },
  };

  const config = statusConfig[tool.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`flex items-center justify-between px-3 py-2 rounded-lg ${config.bg}`}
    >
      <div className="flex items-center gap-3">
        {/* Status Icon */}
        <span className={`text-lg ${config.color}`}>
          {tool.status === 'running' ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="inline-block"
            >
              ⟳
            </motion.span>
          ) : (
            config.icon
          )}
        </span>

        {/* Tool Info */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-white">{tool.tool}</span>
            {tool.server && (
              <span className="text-xs text-gray-500">@{tool.server}</span>
            )}
          </div>
          {tool.status === 'running' && (
            <div className="mt-1 h-1 w-32 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-yellow-400"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Duration */}
      <div className="flex items-center gap-2 text-xs">
        {tool.duration !== undefined && (
          <span className="text-gray-400">{tool.duration}ms</span>
        )}
        {tool.status === 'error' && tool.error && (
          <span className="text-red-400 max-w-[200px] truncate" title={tool.error}>
            {tool.error}
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default ToolExecutionPanel;
