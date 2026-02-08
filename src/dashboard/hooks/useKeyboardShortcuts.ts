/**
 * useKeyboardShortcuts - Global Keyboard Shortcut Handler
 *
 * Phase 4.1: Provides keyboard shortcuts for the chat interface.
 * Supports modifiers, chords, and accessibility features.
 */

import { useEffect, useCallback, useRef } from 'react';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  cmd?: boolean; // macOS Command key
  meta?: boolean; // Windows key / Command key
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description?: string;
  enabled?: boolean;
}

export interface KeyboardShortcutsConfig {
  shortcuts: ShortcutConfig[];
  enabled?: boolean;
  preventDefault?: boolean;
}

/**
 * Hook to register global keyboard shortcuts
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): void {
  const { shortcuts, enabled = true, preventDefault = true } = config;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Skip if user is typing in an input field (unless it's a global shortcut)
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable;

      for (const shortcut of shortcuts) {
        if (shortcut.enabled === false) continue;

        // Check key match (case insensitive)
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase() ||
                        event.code.toLowerCase() === `key${shortcut.key.toLowerCase()}`;

        if (!keyMatch) continue;

        // Check modifier keys
        const isMac = navigator.platform.toLowerCase().includes('mac');

        // Handle cmd/meta key (Mac uses Command, Windows uses Ctrl for most shortcuts)
        const cmdOrMeta = isMac ? event.metaKey : event.ctrlKey;
        const needsCmdOrMeta = shortcut.cmd || shortcut.meta;

        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : true;
        const cmdMetaMatch = needsCmdOrMeta ? cmdOrMeta : true;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

        // If shortcut requires modifiers but none match, skip
        if (needsCmdOrMeta && !cmdOrMeta) continue;
        if (shortcut.ctrl && !event.ctrlKey) continue;
        if (shortcut.alt && !event.altKey) continue;
        if (shortcut.shift && !event.shiftKey) continue;

        // Skip input fields for most shortcuts (except global ones like Escape)
        if (isInput && shortcut.key.toLowerCase() !== 'escape' && needsCmdOrMeta) {
          // Allow cmd+K in input fields (command palette)
          if (shortcut.key.toLowerCase() !== 'k') continue;
        }

        // All conditions match - execute the action
        if (preventDefault) {
          event.preventDefault();
          event.stopPropagation();
        }

        shortcut.action();
        break; // Only execute first matching shortcut
      }
    },
    [shortcuts, enabled, preventDefault]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Predefined shortcut configurations for the chat interface
 */
export interface ChatShortcutActions {
  onCommandPalette?: () => void;
  onSearch?: () => void;
  onNewConversation?: () => void;
  onClearInput?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onClosePanel?: () => void;
  onSendWithThinking?: () => void;
  onToggleSidebar?: () => void;
  onToggleContext?: () => void;
  onToggleAnalytics?: () => void;
  onToggleMemory?: () => void;
  onFocusInput?: () => void;
}

export function useChatKeyboardShortcuts(actions: ChatShortcutActions): ShortcutConfig[] {
  const shortcuts: ShortcutConfig[] = [];

  if (actions.onCommandPalette) {
    shortcuts.push({
      key: 'k',
      cmd: true,
      action: actions.onCommandPalette,
      description: 'Open command palette',
    });
  }

  if (actions.onSearch) {
    shortcuts.push({
      key: '/',
      cmd: true,
      action: actions.onSearch,
      description: 'Search conversations',
    });
  }

  if (actions.onNewConversation) {
    shortcuts.push({
      key: 'n',
      cmd: true,
      action: actions.onNewConversation,
      description: 'New conversation',
    });
  }

  if (actions.onClearInput) {
    shortcuts.push({
      key: 'l',
      cmd: true,
      action: actions.onClearInput,
      description: 'Clear input',
    });
  }

  if (actions.onNavigateUp) {
    shortcuts.push({
      key: 'ArrowUp',
      cmd: true,
      action: actions.onNavigateUp,
      description: 'Previous conversation',
    });
  }

  if (actions.onNavigateDown) {
    shortcuts.push({
      key: 'ArrowDown',
      cmd: true,
      action: actions.onNavigateDown,
      description: 'Next conversation',
    });
  }

  if (actions.onClosePanel) {
    shortcuts.push({
      key: 'Escape',
      action: actions.onClosePanel,
      description: 'Close panel',
    });
  }

  if (actions.onSendWithThinking) {
    shortcuts.push({
      key: 'Enter',
      cmd: true,
      action: actions.onSendWithThinking,
      description: 'Send with extended thinking',
    });
  }

  if (actions.onToggleSidebar) {
    shortcuts.push({
      key: 'b',
      cmd: true,
      action: actions.onToggleSidebar,
      description: 'Toggle sidebar',
    });
  }

  if (actions.onToggleContext) {
    shortcuts.push({
      key: 'i',
      cmd: true,
      action: actions.onToggleContext,
      description: 'Toggle context panel',
    });
  }

  if (actions.onToggleAnalytics) {
    shortcuts.push({
      key: 'a',
      cmd: true,
      shift: true,
      action: actions.onToggleAnalytics,
      description: 'Toggle analytics',
    });
  }

  if (actions.onToggleMemory) {
    shortcuts.push({
      key: 'm',
      cmd: true,
      shift: true,
      action: actions.onToggleMemory,
      description: 'Toggle memory panel',
    });
  }

  if (actions.onFocusInput) {
    shortcuts.push({
      key: '/',
      action: actions.onFocusInput,
      description: 'Focus input',
      enabled: true, // Only when not in input
    });
  }

  return shortcuts;
}

/**
 * Format shortcut for display
 */
export function formatShortcut(shortcut: ShortcutConfig): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== 'undefined' &&
                navigator.platform.toLowerCase().includes('mac');

  if (shortcut.cmd || shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.ctrl && !shortcut.cmd) {
    parts.push(isMac ? '⌃' : 'Ctrl');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }

  // Format key name
  let keyName = shortcut.key;
  if (keyName === 'ArrowUp') keyName = '↑';
  else if (keyName === 'ArrowDown') keyName = '↓';
  else if (keyName === 'ArrowLeft') keyName = '←';
  else if (keyName === 'ArrowRight') keyName = '→';
  else if (keyName === 'Enter') keyName = '↵';
  else if (keyName === 'Escape') keyName = 'Esc';
  else keyName = keyName.toUpperCase();

  parts.push(keyName);

  return parts.join(isMac ? '' : '+');
}

/**
 * Get all shortcuts as a help reference
 */
export function getShortcutsHelp(shortcuts: ShortcutConfig[]): Array<{
  shortcut: string;
  description: string;
}> {
  return shortcuts
    .filter(s => s.description)
    .map(s => ({
      shortcut: formatShortcut(s),
      description: s.description!,
    }));
}

export default useKeyboardShortcuts;
