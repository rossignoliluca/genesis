/**
 * Chat Components - Genesis Chat Hub
 *
 * Comprehensive AI chat interface components
 *
 * Phase 1-4 Improvements:
 * - PhiIndicator: Consciousness level display (Phase 2.2)
 * - SuggestionPanel: AI-powered next action suggestions (Phase 2.3)
 * - ToolDAGPanel: Parallel tool execution visualization (Phase 2.4)
 * - CommandPalette: Quick command interface (Phase 3.1)
 * - GlobalSearch: Cross-conversation search (Phase 3.2)
 * - MemoryInfluencePanel: Memory context visualization (Phase 3.4)
 * - AnalyticsView: Usage analytics dashboard (Phase 3.5)
 */

import { ChatHubView } from './ChatHubView';

// Core components
export { ChatHubView };
export { ConversationSidebar } from './ConversationSidebar';
export { MessageRenderer } from './MessageRenderer';
export { ChatInput } from './ChatInput';
export { ToolExecutionPanel } from './ToolExecutionPanel';
export { ContextPanel } from './ContextPanel';
export { DocumentGenerator } from './DocumentGenerator';

// Phase 2: Core Improvements
export { PhiIndicator } from './PhiIndicator';
export { SuggestionPanel } from './SuggestionPanel';
export { ToolDAGPanel } from './ToolDAGPanel';

// Phase 3: Advanced Features
export { CommandPalette } from './CommandPalette';
export { GlobalSearch } from './GlobalSearch';
export { MemoryInfluencePanel } from './MemoryInfluencePanel';
export { AnalyticsView } from './AnalyticsView';

export default ChatHubView;
