/**
 * ContextPanel - Sidebar showing context, settings, and metrics
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ChatAttachment } from '../../stores/genesisStore';

interface ContextPanelProps {
  attachedFiles: ChatAttachment[];
  memoryContext: Array<{ id: string; content: string; type: string }>;
  settings: {
    useBrain: boolean;
    useMemory: boolean;
    showThinking: boolean;
  };
  onSettingsChange: (settings: Partial<{
    useBrain: boolean;
    useMemory: boolean;
    showThinking: boolean;
  }>) => void;
  stats: {
    totalTokens: number;
    totalCost: number;
    messageCount: number;
  };
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  attachedFiles,
  memoryContext,
  settings,
  onSettingsChange,
  stats,
}) => {
  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white">Context & Settings</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Files Section */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium text-gray-300">Files</span>
            </div>
            <span className="text-xs text-gray-500">{attachedFiles.length}</span>
          </div>

          {attachedFiles.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No files attached</p>
          ) : (
            <div className="space-y-2">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg text-sm"
                >
                  <span className="text-gray-400">
                    {file.type === 'image' ? '🖼️' : '📄'}
                  </span>
                  <span className="text-gray-300 truncate flex-1">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Memory Section */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-sm font-medium text-gray-300">Memory</span>
            </div>
            <span className="text-xs text-gray-500">{memoryContext.length}</span>
          </div>

          {memoryContext.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No memory context loaded</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {memoryContext.map((item) => (
                <div
                  key={item.id}
                  className="p-2 bg-gray-800 rounded-lg"
                >
                  <div className="text-xs text-purple-400 mb-1">{item.type}</div>
                  <p className="text-xs text-gray-400 line-clamp-2">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings Section */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-300">Settings</span>
          </div>

          <div className="space-y-3">
            <ToggleSetting
              label="Use Brain"
              description="Enable consciousness integration"
              enabled={settings.useBrain}
              onChange={(v) => onSettingsChange({ useBrain: v })}
              color="cyan"
            />
            <ToggleSetting
              label="Use Memory"
              description="Recall relevant context"
              enabled={settings.useMemory}
              onChange={(v) => onSettingsChange({ useMemory: v })}
              color="purple"
            />
            <ToggleSetting
              label="Show Thinking"
              description="Display reasoning process"
              enabled={settings.showThinking}
              onChange={(v) => onSettingsChange({ showThinking: v })}
              color="yellow"
            />
          </div>
        </div>

        {/* Stats Section */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-sm font-medium text-gray-300">Session Stats</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Messages"
              value={stats.messageCount.toString()}
              icon="💬"
            />
            <StatCard
              label="Tokens"
              value={formatNumber(stats.totalTokens)}
              icon="🔤"
            />
            <StatCard
              label="Cost"
              value={`$${stats.totalCost.toFixed(4)}`}
              icon="💰"
            />
            <StatCard
              label="Avg/msg"
              value={stats.messageCount > 0 ? Math.round(stats.totalTokens / stats.messageCount).toString() : '0'}
              icon="📊"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface ToggleSettingProps {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  color: 'cyan' | 'purple' | 'yellow' | 'green';
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({
  label,
  description,
  enabled,
  onChange,
  color,
}) => {
  const colors = {
    cyan: 'bg-cyan-600',
    purple: 'bg-purple-600',
    yellow: 'bg-yellow-600',
    green: 'bg-green-600',
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-300">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          enabled ? colors[color] : 'bg-gray-600'
        }`}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
          animate={{ left: enabled ? '22px' : '2px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon }) => (
  <div className="p-3 bg-gray-800 rounded-lg">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-sm">{icon}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
    <div className="text-lg font-mono text-white">{value}</div>
  </div>
);

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export default ContextPanel;
