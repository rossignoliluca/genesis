/**
 * SuggestionPanel - AI-Powered Next Action Suggestions
 *
 * Phase 2.3: Displays proactive suggestions based on Active Inference.
 * Uses AutonomousLoop predictions to suggest next actions.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Suggestion {
  id: string;
  type: 'question' | 'action' | 'clarification';
  text: string;
  confidence: number;
}

interface SuggestionPanelProps {
  conversationId: string | null;
  dashboardUrl?: string;
  onSuggestionClick?: (text: string) => void;
  isStreaming?: boolean;
}

const TYPE_STYLES = {
  question: {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: 'bg-blue-900/30 hover:bg-blue-900/50',
    border: 'border-blue-700/50',
    text: 'text-blue-300',
  },
  action: {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    bg: 'bg-green-900/30 hover:bg-green-900/50',
    border: 'border-green-700/50',
    text: 'text-green-300',
  },
  clarification: {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    bg: 'bg-purple-900/30 hover:bg-purple-900/50',
    border: 'border-purple-700/50',
    text: 'text-purple-300',
  },
};

export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  conversationId,
  dashboardUrl = 'http://localhost:9876',
  onSuggestionClick,
  isStreaming = false,
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);

  // Fetch suggestions when conversation changes or streaming ends
  useEffect(() => {
    if (!conversationId || isStreaming) {
      return;
    }

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${dashboardUrl}/api/chat/suggestions/${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    // Delay fetch slightly to allow message to fully render
    const timer = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(timer);
  }, [conversationId, isStreaming, dashboardUrl]);

  const handleSuggestionClick = useCallback((suggestion: Suggestion) => {
    if (onSuggestionClick) {
      onSuggestionClick(suggestion.text);
    }
    // Remove clicked suggestion
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  }, [onSuggestionClick]);

  // Don't show during streaming
  if (isStreaming) {
    return null;
  }

  // Don't show if no suggestions
  if (!loading && suggestions.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="px-4 py-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Suggestions
            </span>
            <button
              onClick={() => setVisible(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="h-8 bg-gray-800/50 rounded-lg animate-pulse"
                  style={{ width: `${60 + Math.random() * 40}px` }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => {
                const style = TYPE_STYLES[suggestion.type];

                return (
                  <motion.button
                    key={suggestion.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${style.bg} ${style.border} ${style.text} text-sm transition-all hover:scale-105 active:scale-95`}
                  >
                    {style.icon}
                    <span className="truncate max-w-[200px]">{suggestion.text}</span>

                    {/* Confidence indicator */}
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: suggestion.confidence > 0.7
                          ? '#10B981'
                          : suggestion.confidence > 0.5
                          ? '#F59E0B'
                          : '#6B7280',
                      }}
                      title={`${(suggestion.confidence * 100).toFixed(0)}% confidence`}
                    />
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SuggestionPanel;
