/**
 * GlobalSearch - Cross-Conversation Search
 *
 * Phase 3.2: Full-text and semantic search across all conversations.
 * Supports filtering by date, model, tools, with result highlighting.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  matchType: 'exact' | 'semantic' | 'fuzzy';
  score: number;
  highlights: Array<{ start: number; end: number }>;
}

interface SearchFilters {
  dateRange: 'all' | 'today' | 'week' | 'month';
  role: 'all' | 'user' | 'assistant';
  model: string | null;
  hasCode: boolean | null;
  hasTools: boolean | null;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Array<{
    id: string;
    title: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      timestamp: number;
      model?: string;
      toolCalls?: unknown[];
    }>;
  }>;
  onResultClick?: (conversationId: string, messageId: string) => void;
}

const DEFAULT_FILTERS: SearchFilters = {
  dateRange: 'all',
  role: 'all',
  model: null,
  hasCode: null,
  hasTools: null,
};

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  isOpen,
  onClose,
  conversations,
  onResultClick,
}) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get unique models for filter
  const availableModels = useMemo(() => {
    const models = new Set<string>();
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.model) models.add(msg.model);
      }
    }
    return Array.from(models);
  }, [conversations]);

  // Search function
  const performSearch = useCallback(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const lowerQuery = query.toLowerCase();
    const searchResults: SearchResult[] = [];

    // Date filter helper
    const getDateThreshold = () => {
      const now = Date.now();
      switch (filters.dateRange) {
        case 'today':
          return now - 24 * 60 * 60 * 1000;
        case 'week':
          return now - 7 * 24 * 60 * 60 * 1000;
        case 'month':
          return now - 30 * 24 * 60 * 60 * 1000;
        default:
          return 0;
      }
    };

    const dateThreshold = getDateThreshold();

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        // Apply filters
        if (msg.timestamp < dateThreshold) continue;
        if (filters.role !== 'all' && msg.role !== filters.role) continue;
        if (filters.model && msg.model !== filters.model) continue;
        if (filters.hasCode === true && !/```/.test(msg.content)) continue;
        if (filters.hasCode === false && /```/.test(msg.content)) continue;
        if (filters.hasTools === true && (!msg.toolCalls || msg.toolCalls.length === 0)) continue;
        if (filters.hasTools === false && msg.toolCalls && msg.toolCalls.length > 0) continue;

        // Search content
        const lowerContent = msg.content.toLowerCase();
        const exactIndex = lowerContent.indexOf(lowerQuery);

        if (exactIndex !== -1) {
          // Find all highlights
          const highlights: Array<{ start: number; end: number }> = [];
          let searchIndex = 0;
          while (true) {
            const idx = lowerContent.indexOf(lowerQuery, searchIndex);
            if (idx === -1) break;
            highlights.push({ start: idx, end: idx + query.length });
            searchIndex = idx + 1;
          }

          searchResults.push({
            conversationId: conv.id,
            conversationTitle: conv.title,
            messageId: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.timestamp,
            model: msg.model,
            matchType: 'exact',
            score: highlights.length / msg.content.length * 100,
            highlights,
          });
        } else {
          // Fuzzy match - check if all words are present
          const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
          const matchedWords = queryWords.filter(w => lowerContent.includes(w));

          if (matchedWords.length === queryWords.length && queryWords.length > 0) {
            searchResults.push({
              conversationId: conv.id,
              conversationTitle: conv.title,
              messageId: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: msg.timestamp,
              model: msg.model,
              matchType: 'fuzzy',
              score: matchedWords.length / queryWords.length * 50,
              highlights: [],
            });
          }
        }
      }
    }

    // Sort by score (higher first)
    searchResults.sort((a, b) => b.score - a.score);

    setResults(searchResults.slice(0, 50)); // Limit results
    setLoading(false);
    setSelectedIndex(0);
  }, [query, filters, conversations]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(performSearch, 200);
    return () => clearTimeout(timer);
  }, [performSearch]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFilters(DEFAULT_FILTERS);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            onResultClick?.(results[selectedIndex].conversationId, results[selectedIndex].messageId);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onResultClick, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Highlight text helper
  const renderHighlightedContent = (result: SearchResult) => {
    const { content, highlights } = result;
    if (highlights.length === 0) {
      return <span className="text-gray-400">{truncateContent(content)}</span>;
    }

    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    // Find context window around first highlight
    const firstHighlight = highlights[0];
    const contextStart = Math.max(0, firstHighlight.start - 50);
    const contextEnd = Math.min(content.length, firstHighlight.end + 100);
    const contextContent = content.slice(contextStart, contextEnd);

    // Adjust highlights for context
    const adjustedHighlights = highlights
      .filter(h => h.start >= contextStart && h.end <= contextEnd)
      .map(h => ({ start: h.start - contextStart, end: h.end - contextStart }));

    let lastContextEnd = 0;
    for (const h of adjustedHighlights) {
      if (h.start > lastContextEnd) {
        parts.push(
          <span key={`text-${lastContextEnd}`} className="text-gray-400">
            {contextContent.slice(lastContextEnd, h.start)}
          </span>
        );
      }
      parts.push(
        <mark key={`highlight-${h.start}`} className="bg-yellow-500/30 text-yellow-200 px-0.5 rounded">
          {contextContent.slice(h.start, h.end)}
        </mark>
      );
      lastContextEnd = h.end;
    }

    if (lastContextEnd < contextContent.length) {
      parts.push(
        <span key="text-end" className="text-gray-400">
          {contextContent.slice(lastContextEnd)}
        </span>
      );
    }

    return (
      <span>
        {contextStart > 0 && <span className="text-gray-500">...</span>}
        {parts}
        {contextEnd < content.length && <span className="text-gray-500">...</span>}
      </span>
    );
  };

  const truncateContent = (content: string, maxLength = 150) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  };

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

          {/* Search panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50"
          >
            <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
              {/* Search header */}
              <div className="border-b border-gray-700">
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search all conversations..."
                    className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none"
                  />
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      showFilters ? 'bg-cyan-900/50 text-cyan-400' : 'text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </button>
                  <kbd className="px-2 py-0.5 text-xs text-gray-500 bg-gray-800 rounded">esc</kbd>
                </div>

                {/* Filters */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-3 overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-3">
                        {/* Date range */}
                        <select
                          value={filters.dateRange}
                          onChange={e => setFilters({ ...filters, dateRange: e.target.value as any })}
                          className="bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700"
                        >
                          <option value="all">All time</option>
                          <option value="today">Today</option>
                          <option value="week">This week</option>
                          <option value="month">This month</option>
                        </select>

                        {/* Role */}
                        <select
                          value={filters.role}
                          onChange={e => setFilters({ ...filters, role: e.target.value as any })}
                          className="bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700"
                        >
                          <option value="all">All messages</option>
                          <option value="user">User only</option>
                          <option value="assistant">Assistant only</option>
                        </select>

                        {/* Model */}
                        {availableModels.length > 0 && (
                          <select
                            value={filters.model || ''}
                            onChange={e => setFilters({ ...filters, model: e.target.value || null })}
                            className="bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700"
                          >
                            <option value="">Any model</option>
                            {availableModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        )}

                        {/* Has code */}
                        <button
                          onClick={() =>
                            setFilters({
                              ...filters,
                              hasCode: filters.hasCode === true ? null : true,
                            })
                          }
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            filters.hasCode === true
                              ? 'bg-cyan-900/50 border-cyan-700 text-cyan-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400'
                          }`}
                        >
                          Has code
                        </button>

                        {/* Has tools */}
                        <button
                          onClick={() =>
                            setFilters({
                              ...filters,
                              hasTools: filters.hasTools === true ? null : true,
                            })
                          }
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            filters.hasTools === true
                              ? 'bg-cyan-900/50 border-cyan-700 text-cyan-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400'
                          }`}
                        >
                          Used tools
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="inline-block w-6 h-6 border-2 border-gray-600 border-t-cyan-400 rounded-full animate-spin" />
                  </div>
                ) : query && results.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No results found for "{query}"
                  </div>
                ) : !query ? (
                  <div className="p-8 text-center text-gray-500">
                    Start typing to search across all conversations
                  </div>
                ) : (
                  <div className="p-2">
                    {results.map((result, index) => (
                      <button
                        key={`${result.conversationId}-${result.messageId}`}
                        data-index={index}
                        onClick={() => {
                          onResultClick?.(result.conversationId, result.messageId);
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          index === selectedIndex
                            ? 'bg-cyan-900/30'
                            : 'hover:bg-gray-800'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            result.role === 'user'
                              ? 'bg-blue-900/50 text-blue-300'
                              : 'bg-purple-900/50 text-purple-300'
                          }`}>
                            {result.role}
                          </span>
                          <span className="text-sm text-gray-300 truncate flex-1">
                            {result.conversationTitle}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(result.timestamp).toLocaleDateString()}
                          </span>
                          {result.matchType !== 'exact' && (
                            <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                              {result.matchType}
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="text-sm line-clamp-2">
                          {renderHighlightedContent(result)}
                        </div>

                        {/* Footer */}
                        {result.model && (
                          <div className="mt-1 text-xs text-gray-600">
                            {result.model}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {results.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
                  <span>{results.length} results</span>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↑↓</kbd> Navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">↵</kbd> Open
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default GlobalSearch;
