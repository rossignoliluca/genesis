/**
 * CommandPalette - Quick Command Interface (Cmd+K)
 *
 * Phase 3.1: Spotlight-style command palette for quick navigation and actions.
 * Features fuzzy search, keyboard navigation, and recent items.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'navigation' | 'action' | 'tool' | 'settings' | 'memory';
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands?: Command[];
  recentCommands?: string[];
  onCommandExecute?: (commandId: string) => void;
}

const DEFAULT_COMMANDS: Command[] = [
  {
    id: 'new-conversation',
    label: 'New Conversation',
    description: 'Start a new chat conversation',
    category: 'action',
    shortcut: 'Cmd+N',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'search-conversations',
    label: 'Search Conversations',
    description: 'Search across all conversations',
    category: 'navigation',
    shortcut: 'Cmd+/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'toggle-brain',
    label: 'Toggle Brain Mode',
    description: 'Enable/disable Brain integration',
    category: 'settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'toggle-memory',
    label: 'Toggle Memory',
    description: 'Enable/disable memory integration',
    category: 'settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'clear-input',
    label: 'Clear Input',
    description: 'Clear the message input',
    category: 'action',
    shortcut: 'Cmd+L',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'export-conversation',
    label: 'Export Conversation',
    description: 'Export current conversation as document',
    category: 'action',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'view-analytics',
    label: 'View Analytics',
    description: 'Show usage analytics and metrics',
    category: 'navigation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'switch-model-fast',
    label: 'Use Fast Model',
    description: 'Switch to Haiku for quick responses',
    category: 'settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'switch-model-powerful',
    label: 'Use Powerful Model',
    description: 'Switch to Sonnet for complex tasks',
    category: 'settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    action: () => {},
  },
];

const CATEGORY_LABELS: Record<Command['category'], string> = {
  navigation: 'Navigation',
  action: 'Actions',
  tool: 'Tools',
  settings: 'Settings',
  memory: 'Memory',
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands = DEFAULT_COMMANDS,
  recentCommands = [],
  onCommandExecute,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fuzzy search filter
  const filteredCommands = useMemo(() => {
    if (!query) {
      // Show recent commands first if no query
      const recent = commands.filter(c => recentCommands.includes(c.id));
      const others = commands.filter(c => !recentCommands.includes(c.id));
      return [...recent, ...others];
    }

    const lowerQuery = query.toLowerCase();
    return commands
      .filter(
        c =>
          c.label.toLowerCase().includes(lowerQuery) ||
          c.description?.toLowerCase().includes(lowerQuery) ||
          c.category.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => {
        // Prioritize label matches
        const aLabelMatch = a.label.toLowerCase().startsWith(lowerQuery);
        const bLabelMatch = b.label.toLowerCase().startsWith(lowerQuery);
        if (aLabelMatch && !bLabelMatch) return -1;
        if (!aLabelMatch && bLabelMatch) return 1;
        return 0;
      });
  }, [query, commands, recentCommands]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  const executeCommand = useCallback(
    (command: Command) => {
      command.action();
      onCommandExecute?.(command.id);
      onClose();
    },
    [onCommandExecute, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

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

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50"
          >
            <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none"
                />
                <kbd className="px-2 py-0.5 text-xs text-gray-500 bg-gray-800 rounded">esc</kbd>
              </div>

              {/* Commands list */}
              <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
                {filteredCommands.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    No commands found for "{query}"
                  </div>
                ) : (
                  Object.entries(groupedCommands).map(([category, cmds]) => (
                    <div key={category} className="mb-2">
                      <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase">
                        {CATEGORY_LABELS[category as Command['category']]}
                      </div>
                      {cmds.map((cmd, idx) => {
                        const globalIndex = filteredCommands.indexOf(cmd);
                        const isSelected = globalIndex === selectedIndex;

                        return (
                          <button
                            key={cmd.id}
                            data-index={globalIndex}
                            onClick={() => executeCommand(cmd)}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                              isSelected
                                ? 'bg-cyan-900/50 text-white'
                                : 'text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            <span className={`${isSelected ? 'text-cyan-400' : 'text-gray-400'}`}>
                              {cmd.icon}
                            </span>
                            <div className="flex-1 text-left">
                              <div className="font-medium">{cmd.label}</div>
                              {cmd.description && (
                                <div className="text-xs text-gray-500">{cmd.description}</div>
                              )}
                            </div>
                            {cmd.shortcut && (
                              <kbd className="px-2 py-0.5 text-xs text-gray-500 bg-gray-800 rounded">
                                {cmd.shortcut}
                              </kbd>
                            )}
                            {recentCommands.includes(cmd.id) && (
                              <span className="text-xs text-gray-600">Recent</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↑↓</kbd> Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↵</kbd> Select
                  </span>
                </div>
                <span>Cmd+K to open</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
