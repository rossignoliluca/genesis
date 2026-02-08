/**
 * ChatHubView - Main Chat Interface Container
 *
 * Comprehensive AI chat interface with:
 * - Real-time streaming with StreamOrchestrator
 * - Tool execution visualization with DAG
 * - Memory integration with anticipation
 * - Document generation
 * - Multi-conversation support
 * - Command palette (Cmd+K)
 * - Global search
 * - Phi consciousness indicator
 * - AI-powered suggestions
 * - Analytics dashboard
 *
 * Phase 1-4 Improvements integrated
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenesisStore, selectChat, selectActiveConversation, selectIsStreaming, selectActiveToolCalls } from '../../stores/genesisStore';
import { ConversationSidebar } from './ConversationSidebar';
import { MessageRenderer } from './MessageRenderer';
import { ChatInput } from './ChatInput';
import { ToolExecutionPanel } from './ToolExecutionPanel';
import { ContextPanel } from './ContextPanel';
import { DocumentGenerator } from './DocumentGenerator';

// Phase 2-4: New components
import { PhiIndicator } from './PhiIndicator';
import { SuggestionPanel } from './SuggestionPanel';
import { ToolDAGPanel } from './ToolDAGPanel';
import { CommandPalette } from './CommandPalette';
import { GlobalSearch } from './GlobalSearch';
import { MemoryInfluencePanel } from './MemoryInfluencePanel';
import { AnalyticsView } from './AnalyticsView';
import { useKeyboardShortcuts, useChatKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

interface ChatHubViewProps {
  dashboardUrl?: string;
}

export const ChatHubView: React.FC<ChatHubViewProps> = ({
  dashboardUrl = 'http://localhost:9876'
}) => {
  const chat = useGenesisStore(selectChat);
  const activeConversation = useGenesisStore(selectActiveConversation);
  const isStreaming = useGenesisStore(selectIsStreaming);
  const activeToolCalls = useGenesisStore(selectActiveToolCalls);
  const {
    addConversation,
    setActiveConversation,
    addChatMessage,
    setIsStreaming,
    setStreamingMessage,
    appendToStreamingMessage,
    finalizeStreamingMessage,
    addActiveToolCall,
    updateToolCall,
    clearActiveToolCalls,
    setInputMessage,
  } = useGenesisStore();

  const [showSidebar, setShowSidebar] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [showDocGen, setShowDocGen] = useState(false);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Phase 2-4: New panel states
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  // Phase 2.4: Tool DAG nodes for visualization
  const [dagNodes, setDagNodes] = useState<Array<{
    id: string;
    tool: string;
    dependsOn: string[];
    status: 'pending' | 'running' | 'success' | 'error';
    duration?: number;
  }>>([]);
  const [parallelSaved, setParallelSaved] = useState(0);

  // Phase 3.4: Memory influence data
  const [activeMemories, setActiveMemories] = useState<Array<{
    id: string;
    type: 'episodic' | 'semantic' | 'procedural';
    content: string;
    activation: number;
    relevance: number;
    source: 'anticipate' | 'recall' | 'association' | 'manual';
  }>>([])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, chat.streamingMessage]);

  // Create new conversation if none exists
  useEffect(() => {
    if (chat.conversations.length === 0) {
      const newConv = {
        id: crypto.randomUUID(),
        title: `Chat ${new Date().toLocaleDateString()}`,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        context: {},
      };
      addConversation(newConv);
    }
  }, [chat.conversations.length, addConversation]);

  // Check connection status with timeout
  useEffect(() => {
    let failCount = 0;
    const maxFails = 2;

    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`${dashboardUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        setConnected(res.ok);
        failCount = 0;
      } catch {
        failCount++;
        // Only mark as disconnected after consecutive failures
        if (failCount >= maxFails) {
          setConnected(false);
        }
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 10000); // Check less frequently
    return () => clearInterval(interval);
  }, [dashboardUrl]);

  // Send message handler
  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim() || !chat.activeConversationId) return;

    // Add user message
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: message,
      timestamp: Date.now(),
      attachments: chat.attachedFiles,
    };
    addChatMessage(chat.activeConversationId, userMessage);
    setInputMessage('');
    setIsStreaming(true);
    setStreamingMessage({ content: '', role: 'assistant', timestamp: Date.now() });

    // Connect to SSE for streaming response
    try {
      const response = await fetch(`${dashboardUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: chat.activeConversationId,
          message,
          attachments: chat.attachedFiles,
          options: {
            model: chat.selectedModel,
            stream: true,
            useBrain: chat.useBrain,
            useMemory: chat.useMemory,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7);
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleStreamEvent(data);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setIsStreaming(false);
      setStreamingMessage(null);
    }
  }, [
    chat.activeConversationId,
    chat.attachedFiles,
    chat.selectedModel,
    chat.useBrain,
    chat.useMemory,
    dashboardUrl,
    addChatMessage,
    setInputMessage,
    setIsStreaming,
    setStreamingMessage,
  ]);

  // Handle stream events - Phase 1-4 enhanced
  const handleStreamEvent = useCallback((data: any) => {
    if (data.content !== undefined && !data.tool) {
      appendToStreamingMessage(data.content);
    } else if (data.tool && data.status === 'running') {
      addActiveToolCall({
        id: data.id || crypto.randomUUID(),
        tool: data.tool,
        input: data.input || {},
        status: 'running',
      });
      // Phase 2.4: Update DAG nodes
      setDagNodes(prev => [...prev, {
        id: data.id || crypto.randomUUID(),
        tool: data.tool,
        dependsOn: data.dependsOn || [],
        status: 'running',
      }]);
    } else if (data.tool && (data.output !== undefined || data.error)) {
      updateToolCall(data.tool, {
        status: data.error ? 'error' : 'success',
        output: data.output,
        duration: data.duration,
        error: data.error,
      });
      // Phase 2.4: Update DAG node status
      setDagNodes(prev => prev.map(n =>
        n.tool === data.tool
          ? { ...n, status: data.error ? 'error' : 'success', duration: data.duration }
          : n
      ));
    } else if (data.tokens || data.latency) {
      // Done event - Phase 1-4 enhanced with new metrics
      const current = useGenesisStore.getState().chat.streamingMessage;
      setStreamingMessage({
        ...current,
        tokens: data.tokens,
        latency: data.latency,
        model: data.model,
        // Phase 1.1-1.4: New metrics
        tier: data.tier,
        racing: data.racing,
        cacheHits: data.cacheHits,
        anticipationHits: data.anticipationHits,
        phi: data.phi,
      });
      // Phase 2.4: Record parallel savings
      if (data.parallelToolSaved) {
        setParallelSaved(data.parallelToolSaved);
      }
      finalizeStreamingMessage();
      setIsStreaming(false);
      clearActiveToolCalls();
      // Clear DAG after completion
      setTimeout(() => setDagNodes([]), 2000);
    } else if (data.type === 'tool_dag') {
      // Phase 2.4: Handle DAG structure updates
      if (data.nodes) {
        setDagNodes(data.nodes);
      }
    } else if (data.type === 'memory_context') {
      // Phase 3.4: Handle memory influence data
      if (data.memories) {
        setActiveMemories(data.memories);
      }
    }
  }, [
    appendToStreamingMessage,
    addActiveToolCall,
    updateToolCall,
    setStreamingMessage,
    finalizeStreamingMessage,
    setIsStreaming,
    clearActiveToolCalls,
  ]);

  const handleNewConversation = useCallback(() => {
    const newConv = {
      id: crypto.randomUUID(),
      title: `Chat ${new Date().toLocaleDateString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: {},
    };
    addConversation(newConv);
  }, [addConversation]);

  // Phase 4.1: Keyboard shortcuts (defined after handlers)
  const shortcutActions = useChatKeyboardShortcuts({
    onCommandPalette: () => setShowCommandPalette(true),
    onSearch: () => setShowSearch(true),
    onNewConversation: handleNewConversation,
    onClearInput: () => setInputMessage(''),
    onClosePanel: () => {
      setShowCommandPalette(false);
      setShowSearch(false);
      setShowAnalytics(false);
      setShowMemoryPanel(false);
      setShowDocGen(false);
    },
    onToggleSidebar: () => setShowSidebar(s => !s),
    onToggleContext: () => setShowContext(s => !s),
    onToggleAnalytics: () => setShowAnalytics(s => !s),
    onToggleMemory: () => setShowMemoryPanel(s => !s),
    onFocusInput: () => inputRef.current?.focus(),
  });

  useKeyboardShortcuts({ shortcuts: shortcutActions });

  return (
    <div className="h-full flex bg-gray-900">
      {/* Conversation Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-gray-700 flex-shrink-0"
          >
            <ConversationSidebar
              conversations={chat.conversations}
              activeId={chat.activeConversationId}
              onSelect={setActiveConversation}
              onNew={handleNewConversation}
              onDelete={(id) => useGenesisStore.getState().deleteConversation(id)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-lg font-medium text-white truncate">
              {activeConversation?.title || 'Genesis Chat'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 2.2: Phi Indicator */}
            <PhiIndicator dashboardUrl={dashboardUrl} compact />

            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              connected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>

            {/* Phase 3.1: Command Palette Button */}
            <button
              onClick={() => setShowCommandPalette(true)}
              className="p-2 rounded-lg transition-colors hover:bg-gray-700 text-gray-400"
              title="Command palette (⌘K)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>

            {/* Phase 3.2: Search Button */}
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-lg transition-colors hover:bg-gray-700 text-gray-400"
              title="Search (⌘/)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Phase 3.5: Analytics Button */}
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`p-2 rounded-lg transition-colors ${
                showAnalytics ? 'bg-cyan-900/50 text-cyan-400' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="Analytics"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>

            {/* Phase 3.4: Memory Panel Button */}
            <button
              onClick={() => setShowMemoryPanel(!showMemoryPanel)}
              className={`p-2 rounded-lg transition-colors ${
                showMemoryPanel ? 'bg-purple-900/50 text-purple-400' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="Memory influence"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>

            {/* Context Toggle */}
            <button
              onClick={() => setShowContext(!showContext)}
              className={`p-2 rounded-lg transition-colors ${
                showContext ? 'bg-cyan-900/50 text-cyan-400' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="Toggle context panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Doc Gen Toggle */}
            <button
              onClick={() => setShowDocGen(!showDocGen)}
              className={`p-2 rounded-lg transition-colors ${
                showDocGen ? 'bg-purple-900/50 text-purple-400' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="Generate document"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Empty State - No Conversation Selected */}
          {!activeConversation && (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">Welcome to Genesis Chat</h3>
              <p className="text-gray-400 mb-6 max-w-md">
                Your AI assistant with memory, tool execution, and consciousness monitoring.
                Start a new conversation to begin.
              </p>
              <button
                onClick={handleNewConversation}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Conversation
              </button>
              <div className="mt-8 grid grid-cols-3 gap-6 text-sm">
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <span className="text-lg">⌘K</span>
                  </div>
                  <span>Commands</span>
                </div>
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span>Brain Mode</span>
                </div>
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <span>Memory</span>
                </div>
              </div>
            </div>
          )}

          {/* Empty Conversation State */}
          {activeConversation && activeConversation.messages.length === 0 && !chat.streamingMessage && (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Ready to assist</h3>
              <p className="text-gray-400 mb-6 max-w-sm">
                Ask me anything. I can help with code, analysis, writing, and more.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {[
                  'Explain this codebase',
                  'Help me debug an issue',
                  'Write a function that...',
                  'Analyze this data',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInputMessage(prompt)}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {activeConversation?.messages.map((message) => (
            <MessageRenderer
              key={message.id}
              message={message}
              showThinking={chat.showThinking}
            />
          ))}

          {/* Streaming Message */}
          {chat.streamingMessage && (
            <MessageRenderer
              message={{
                id: 'streaming',
                role: 'assistant',
                content: chat.streamingMessage.content || '',
                timestamp: chat.streamingMessage.timestamp || Date.now(),
                toolCalls: activeToolCalls,
                thinking: chat.streamingMessage.thinking,
              }}
              showThinking={chat.showThinking}
              isStreaming
            />
          )}

          {/* Tool Execution Panel */}
          {activeToolCalls.length > 0 && (
            <ToolExecutionPanel toolCalls={activeToolCalls} />
          )}

          {/* Phase 2.4: Tool DAG Visualization */}
          {dagNodes.length > 1 && (
            <ToolDAGPanel
              nodes={dagNodes}
              parallelSaved={parallelSaved}
            />
          )}

          {/* Phase 2.3: AI Suggestions */}
          {activeConversation && activeConversation.messages.length > 0 && (
            <SuggestionPanel
              conversationId={chat.activeConversationId}
              dashboardUrl={dashboardUrl}
              onSuggestionClick={(text) => setInputMessage(text)}
              isStreaming={isStreaming}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <ChatInput
          value={chat.inputMessage}
          onChange={setInputMessage}
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          attachments={chat.attachedFiles}
          onAttach={(file) => useGenesisStore.getState().attachFile(file)}
          onRemoveAttachment={(id) => useGenesisStore.getState().removeAttachment(id)}
          selectedModel={chat.selectedModel}
          onModelChange={(model) => useGenesisStore.getState().setChatSettings({ selectedModel: model })}
        />
      </div>

      {/* Context Panel */}
      <AnimatePresence>
        {showContext && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-gray-700 flex-shrink-0"
          >
            <ContextPanel
              attachedFiles={chat.attachedFiles}
              memoryContext={chat.memoryContext}
              settings={{
                useBrain: chat.useBrain,
                useMemory: chat.useMemory,
                showThinking: chat.showThinking,
              }}
              onSettingsChange={(settings) => useGenesisStore.getState().setChatSettings(settings)}
              stats={{
                totalTokens: chat.totalTokensUsed,
                totalCost: chat.totalCost,
                messageCount: activeConversation?.messages.length || 0,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Generator Modal */}
      <AnimatePresence>
        {showDocGen && activeConversation && (
          <DocumentGenerator
            conversation={activeConversation}
            onClose={() => setShowDocGen(false)}
            dashboardUrl={dashboardUrl}
          />
        )}
      </AnimatePresence>

      {/* Phase 3.1: Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onCommandExecute={(id) => {
          // Handle command execution
          if (id === 'new-conversation') handleNewConversation();
          if (id === 'search-conversations') setShowSearch(true);
          if (id === 'toggle-brain') useGenesisStore.getState().setChatSettings({ useBrain: !chat.useBrain });
          if (id === 'toggle-memory') useGenesisStore.getState().setChatSettings({ useMemory: !chat.useMemory });
          if (id === 'clear-input') setInputMessage('');
          if (id === 'export-conversation') setShowDocGen(true);
          if (id === 'view-analytics') setShowAnalytics(true);
        }}
      />

      {/* Phase 3.2: Global Search */}
      <GlobalSearch
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversations={chat.conversations}
        onResultClick={(convId, msgId) => {
          setActiveConversation(convId);
          // Could scroll to message
        }}
      />

      {/* Phase 3.5: Analytics View */}
      <AnalyticsView
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        dashboardUrl={dashboardUrl}
      />

      {/* Phase 3.4: Memory Influence Panel */}
      <MemoryInfluencePanel
        memories={activeMemories}
        isOpen={showMemoryPanel}
        onClose={() => setShowMemoryPanel(false)}
      />
    </div>
  );
};

export default ChatHubView;
