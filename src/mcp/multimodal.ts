/**
 * Genesis MCP Multimodal Handler
 *
 * Handles image, audio, and other media types from MCP tool results.
 * Provides terminal display, file management, and format conversion.
 *
 * Features:
 * - Detect media in tool results
 * - Display images in terminal (iTerm2, Kitty, sixel)
 * - Open media with system default apps
 * - Convert between formats
 * - Thumbnail generation
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'unknown';

export interface MediaInfo {
  type: MediaType;
  mimeType: string;
  path?: string;
  url?: string;
  base64?: string;
  width?: number;
  height?: number;
  size?: number;
  format?: string;
}

export interface DisplayOptions {
  // Max width for terminal display
  maxWidth?: number;
  // Max height for terminal display
  maxHeight?: number;
  // Auto-open with system viewer
  autoOpen?: boolean;
  // Show inline in terminal
  inline?: boolean;
  // Terminal protocol: 'iterm2' | 'kitty' | 'sixel' | 'none'
  protocol?: TerminalProtocol;
}

export type TerminalProtocol = 'iterm2' | 'kitty' | 'sixel' | 'ascii' | 'none';

export interface MultimodalResult {
  detected: boolean;
  media: MediaInfo[];
  displayedInline: boolean;
  openedExternally: boolean;
}

// ============================================================================
// Media Detection
// ============================================================================

const MIME_TYPE_MAP: Record<string, MediaType> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'application/pdf': 'document',
};

const EXTENSION_MAP: Record<string, MediaType> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.mp4': 'video',
  '.webm': 'video',
  '.pdf': 'document',
};

export function detectMediaType(input: string | MediaInfo): MediaType {
  if (typeof input !== 'string') {
    return input.type;
  }

  // Check extension
  const ext = path.extname(input).toLowerCase();
  if (EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext];
  }

  // Check if it's a data URL
  if (input.startsWith('data:')) {
    const mimeMatch = input.match(/^data:([^;,]+)/);
    if (mimeMatch && MIME_TYPE_MAP[mimeMatch[1]]) {
      return MIME_TYPE_MAP[mimeMatch[1]];
    }
  }

  return 'unknown';
}

export function extractMediaFromResult(result: any): MediaInfo[] {
  const media: MediaInfo[] = [];

  if (!result) return media;

  // Check for common image result patterns
  const imagePatterns = [
    'imagePath', 'outputPath', 'path', 'filePath', 'file_path',
    'imageUrl', 'url', 'src', 'image', 'output',
  ];

  for (const pattern of imagePatterns) {
    if (result[pattern] && typeof result[pattern] === 'string') {
      const value = result[pattern];
      const type = detectMediaType(value);

      if (type !== 'unknown') {
        media.push({
          type,
          mimeType: getMimeType(value),
          path: value.startsWith('/') || value.startsWith('.') ? value : undefined,
          url: value.startsWith('http') ? value : undefined,
          base64: value.startsWith('data:') ? value.split(',')[1] : undefined,
        });
      }
    }
  }

  // Check for base64 data
  if (result.base64 || result.data) {
    const base64Data = result.base64 || result.data;
    if (typeof base64Data === 'string' && base64Data.length > 100) {
      media.push({
        type: 'image',
        mimeType: result.mimeType || 'image/png',
        base64: base64Data,
      });
    }
  }

  // Check for arrays of results
  if (Array.isArray(result.images || result.files || result.outputs)) {
    const items = result.images || result.files || result.outputs;
    for (const item of items) {
      media.push(...extractMediaFromResult(item));
    }
  }

  return media;
}

function getMimeType(pathOrUrl: string): string {
  const ext = path.extname(pathOrUrl).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// ============================================================================
// Terminal Display
// ============================================================================

export function detectTerminalProtocol(): TerminalProtocol {
  const term = process.env.TERM_PROGRAM || '';
  const termEnv = process.env.TERM || '';

  if (term === 'iTerm.app') {
    return 'iterm2';
  }

  if (term === 'kitty' || termEnv.includes('kitty')) {
    return 'kitty';
  }

  if (termEnv.includes('xterm') && process.env.SIXEL_SUPPORT === 'true') {
    return 'sixel';
  }

  // Fallback to ASCII art representation
  return 'ascii';
}

export async function displayImageInline(
  imagePath: string,
  options: DisplayOptions = {}
): Promise<boolean> {
  const protocol = options.protocol || detectTerminalProtocol();

  try {
    switch (protocol) {
      case 'iterm2':
        return await displayITerm2(imagePath, options);
      case 'kitty':
        return await displayKitty(imagePath, options);
      case 'sixel':
        return await displaySixel(imagePath, options);
      case 'ascii':
        return await displayAscii(imagePath, options);
      default:
        return false;
    }
  } catch (error) {
    console.error(`[Multimodal] Display error: ${error}`);
    return false;
  }
}

async function displayITerm2(imagePath: string, options: DisplayOptions): Promise<boolean> {
  try {
    const data = await fs.promises.readFile(imagePath);
    const base64 = data.toString('base64');

    const width = options.maxWidth || 80;
    const height = options.maxHeight || 24;

    // iTerm2 inline image protocol
    const osc = '\x1b]1337;File=';
    const params = `inline=1;width=${width};height=${height};preserveAspectRatio=1`;
    const st = '\x07';

    process.stdout.write(`${osc}${params}:${base64}${st}\n`);
    return true;
  } catch (err) {
    console.error('[multimodal] display failed:', err);
    return false;
  }
}

async function displayKitty(imagePath: string, options: DisplayOptions): Promise<boolean> {
  try {
    // Use kitten icat for Kitty terminal
    await execAsync(`kitten icat --place ${options.maxWidth || 80}x${options.maxHeight || 24}@0x0 "${imagePath}"`);
    return true;
  } catch (err) {
    console.error('[multimodal] display failed:', err);
    return false;
  }
}

async function displaySixel(imagePath: string, options: DisplayOptions): Promise<boolean> {
  try {
    // Use img2sixel if available
    await execAsync(`img2sixel -w ${options.maxWidth || 800} "${imagePath}"`);
    return true;
  } catch (err) {
    console.error('[multimodal] display failed:', err);
    return false;
  }
}

async function displayAscii(imagePath: string, options: DisplayOptions): Promise<boolean> {
  try {
    // Generate simple ASCII representation using file info
    const stats = await fs.promises.stat(imagePath);
    const ext = path.extname(imagePath);
    const name = path.basename(imagePath);

    console.log('┌─────────────────────────────────────┐');
    console.log(`│ 🖼️  ${name.slice(0, 33).padEnd(33)} │`);
    console.log(`│    Format: ${ext.slice(1).toUpperCase().padEnd(24)} │`);
    console.log(`│    Size: ${formatBytes(stats.size).padEnd(26)} │`);
    console.log(`│    Path: ...${imagePath.slice(-22).padEnd(23)} │`);
    console.log('└─────────────────────────────────────┘');
    return true;
  } catch (err) {
    console.error('[multimodal] display failed:', err);
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// System Viewer
// ============================================================================

export async function openWithSystemViewer(filePath: string): Promise<boolean> {
  const platform = process.platform;

  try {
    let command: string;

    switch (platform) {
      case 'darwin':
        command = 'open';
        break;
      case 'win32':
        command = 'start';
        break;
      default:
        command = 'xdg-open';
    }

    await execAsync(`${command} "${filePath}"`);
    return true;
  } catch (error) {
    console.error(`[Multimodal] Failed to open: ${error}`);
    return false;
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export class MultimodalHandler {
  private options: DisplayOptions;

  constructor(options: DisplayOptions = {}) {
    this.options = {
      maxWidth: 80,
      maxHeight: 24,
      autoOpen: false,
      inline: true,
      protocol: detectTerminalProtocol(),
      ...options,
    };
  }

  async handleResult(result: any): Promise<MultimodalResult> {
    const media = extractMediaFromResult(result);

    const multimodalResult: MultimodalResult = {
      detected: media.length > 0,
      media,
      displayedInline: false,
      openedExternally: false,
    };

    if (media.length === 0) {
      return multimodalResult;
    }

    for (const item of media) {
      if (item.type === 'image' && item.path) {
        // Try inline display
        if (this.options.inline) {
          const displayed = await displayImageInline(item.path, this.options);
          multimodalResult.displayedInline = multimodalResult.displayedInline || displayed;
        }

        // Auto-open if configured
        if (this.options.autoOpen) {
          const opened = await openWithSystemViewer(item.path);
          multimodalResult.openedExternally = multimodalResult.openedExternally || opened;
        }
      }
    }

    return multimodalResult;
  }

  setOptions(options: Partial<DisplayOptions>): void {
    Object.assign(this.options, options);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let handlerInstance: MultimodalHandler | null = null;

export function getMultimodalHandler(options?: DisplayOptions): MultimodalHandler {
  if (!handlerInstance) {
    handlerInstance = new MultimodalHandler(options);
  }
  return handlerInstance;
}

export async function handleMultimodalResult(result: any): Promise<MultimodalResult> {
  return getMultimodalHandler().handleResult(result);
}
