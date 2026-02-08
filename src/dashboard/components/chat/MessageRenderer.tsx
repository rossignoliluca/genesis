/**
 * MessageRenderer - Rich message rendering with code, tools, thinking
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChatMessage, ChatToolCall, ChatThinkingBlock } from '../../stores/genesisStore';

interface MessageRendererProps {
  message: ChatMessage;
  showThinking?: boolean;
  isStreaming?: boolean;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  message,
  showThinking = true,
  isStreaming = false,
}) => {
  const [expandedThinking, setExpandedThinking] = useState(false);
  const [expandedCode, setExpandedCode] = useState<Record<string, boolean>>({});

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Parse code blocks from content
  const contentParts = useMemo(() => {
    const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(message.content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: message.content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', content: match[2], language: match[1] || 'plaintext' });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.content.length) {
      parts.push({ type: 'text', content: message.content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text' as const, content: message.content }];
  }, [message.content]);

  // Format timestamp
  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-cyan-500 to-purple-600'
      }`}>
        {isUser ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <span className="text-white text-xs font-bold">G</span>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-3xl ${isUser ? 'items-end' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-sm font-medium text-gray-300">
            {isUser ? 'You' : 'Genesis'}
          </span>
          <span className="text-xs text-gray-500">{formattedTime}</span>
          {message.model && (
            <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
              {message.model}
            </span>
          )}
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-cyan-400">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              Generating...
            </span>
          )}
        </div>

        {/* Thinking Block (Collapsible) */}
        {showThinking && message.thinking && message.thinking.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-2"
          >
            <button
              onClick={() => setExpandedThinking(!expandedThinking)}
              className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${expandedThinking ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Thinking ({message.thinking.length} blocks)
            </button>
            {expandedThinking && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-2 pl-4 border-l-2 border-purple-500/30"
              >
                {message.thinking.map((block) => (
                  <div key={block.id} className="text-sm text-gray-400 italic mb-2">
                    {block.content}
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Message Body */}
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-100'
        }`}>
          {contentParts.map((part, index) => (
            <React.Fragment key={index}>
              {part.type === 'text' ? (
                <div className="whitespace-pre-wrap break-words">
                  {renderMarkdown(part.content)}
                </div>
              ) : (
                <div className="my-3 -mx-2">
                  <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/50 border-b border-gray-700">
                      <span className="text-xs text-gray-400">{part.language}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(part.content)}
                        className="text-xs text-gray-500 hover:text-white transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="p-3 overflow-x-auto text-sm">
                      <code className="text-gray-300">{part.content}</code>
                    </pre>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-1" />
          )}
        </div>

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.toolCalls.map((tool) => (
              <ToolCallCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg text-sm"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="text-gray-300">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Metrics Footer */}
        {message.tokens && (
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            <span>{message.tokens.input + message.tokens.output} tokens</span>
            {message.latency && <span>{message.latency}ms</span>}
            {message.cost && <span>${message.cost.toFixed(4)}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Tool Call Card Component
const ToolCallCard: React.FC<{ tool: ChatToolCall }> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const statusColors = {
    pending: 'text-gray-400 bg-gray-800',
    running: 'text-yellow-400 bg-yellow-900/30',
    success: 'text-green-400 bg-green-900/30',
    error: 'text-red-400 bg-red-900/30',
  };

  const statusIcons = {
    pending: '○',
    running: '●',
    success: '✓',
    error: '✗',
  };

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm ${statusColors[tool.status]}`}>
            {statusIcons[tool.status]}
          </span>
          <span className="text-sm font-mono text-gray-300">{tool.tool}</span>
          {tool.server && (
            <span className="text-xs text-gray-500">@{tool.server}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tool.duration !== undefined && (
            <span className="text-xs text-gray-500">{tool.duration}ms</span>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-gray-700"
        >
          <div className="p-3 space-y-2">
            <div>
              <span className="text-xs text-gray-500">Input</span>
              <pre className="mt-1 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
            {tool.output !== undefined && (
              <div>
                <span className="text-xs text-gray-500">Output</span>
                <pre className="mt-1 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto max-h-48">
                  {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
                </pre>
              </div>
            )}
            {tool.error && (
              <div>
                <span className="text-xs text-red-400">Error</span>
                <pre className="mt-1 text-xs text-red-300 bg-red-900/20 p-2 rounded">
                  {tool.error}
                </pre>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

// Simple markdown renderer
function renderMarkdown(text: string): React.ReactNode {
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 rounded text-cyan-300">$1</code>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-400 hover:underline" target="_blank">$1</a>');

  return <span dangerouslySetInnerHTML={{ __html: text }} />;
}

export default MessageRenderer;
