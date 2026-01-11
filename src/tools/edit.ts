/**
 * Genesis Diff-Based File Editor
 *
 * File editing capabilities:
 * - old_string -> new_string replacement
 * - Unique match verification
 * - replace_all for global replacements
 * - Atomic writes with backup
 * - Indentation preservation
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface EditParams {
  /** Absolute path to the file */
  file_path: string;
  /** Text to find and replace */
  old_string: string;
  /** Text to replace with */
  new_string: string;
  /** Replace all occurrences (default: false) */
  replace_all?: boolean;
}

export interface EditResult {
  success: boolean;
  /** Number of replacements made */
  replacements: number;
  /** Error message if failed */
  error?: string;
  /** Diff preview (before/after context) */
  diff?: string;
  /** Backup file path if created */
  backup?: string;
}

export interface WriteParams {
  /** Absolute path to the file */
  file_path: string;
  /** Content to write */
  content: string;
  /** Create backup of existing file */
  backup?: boolean;
}

export interface WriteResult {
  success: boolean;
  error?: string;
  backup?: string;
  bytes_written: number;
}

export interface EditToolConfig {
  /** Create backups before editing */
  createBackups: boolean;
  /** Backup file suffix */
  backupSuffix: string;
  /** Maximum file size to edit (bytes) */
  maxFileSize: number;
  /** Allowed file extensions (empty = all) */
  allowedExtensions: string[];
  /** Blocked paths */
  blockedPaths: RegExp[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_EDIT_CONFIG: EditToolConfig = {
  createBackups: true,
  backupSuffix: '.bak',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedExtensions: [], // All extensions allowed
  blockedPaths: [
    /\/\.git\//,           // .git directory
    /\/node_modules\//,    // node_modules
    /\/\.env$/,            // .env files (exact match)
    /\/\.env\.[^/]+$/,     // .env.* files
    /\/secrets?\./i,       // secrets files
    /\/credentials?\./i,   // credentials files
    /\/\.ssh\//,           // SSH directory
    /\/\.aws\//,           // AWS directory
  ],
};

// ============================================================================
// Edit Tool Class
// ============================================================================

export class EditTool {
  private config: EditToolConfig;

  constructor(config?: Partial<EditToolConfig>) {
    this.config = { ...DEFAULT_EDIT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validate file path for editing
   */
  validatePath(filePath: string): { valid: boolean; reason?: string } {
    // Must be absolute path
    if (!path.isAbsolute(filePath)) {
      return { valid: false, reason: 'Path must be absolute' };
    }

    // Check blocked paths
    for (const pattern of this.config.blockedPaths) {
      if (pattern.test(filePath)) {
        return { valid: false, reason: `Path matches blocked pattern: ${pattern.toString()}` };
      }
    }

    // Check file extension if restricted
    if (this.config.allowedExtensions.length > 0) {
      const ext = path.extname(filePath).toLowerCase();
      if (!this.config.allowedExtensions.includes(ext)) {
        return { valid: false, reason: `Extension not allowed: ${ext}` };
      }
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Edit Operations
  // --------------------------------------------------------------------------

  /**
   * Edit a file by replacing old_string with new_string
   */
  async edit(params: EditParams): Promise<EditResult> {
    const { file_path, old_string, new_string, replace_all = false } = params;

    // Validate path
    const pathValidation = this.validatePath(file_path);
    if (!pathValidation.valid) {
      return {
        success: false,
        replacements: 0,
        error: pathValidation.reason,
      };
    }

    // Check file exists
    if (!fs.existsSync(file_path)) {
      return {
        success: false,
        replacements: 0,
        error: `File not found: ${file_path}`,
      };
    }

    // Check file size
    const stats = fs.statSync(file_path);
    if (stats.size > this.config.maxFileSize) {
      return {
        success: false,
        replacements: 0,
        error: `File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`,
      };
    }

    // Read file content
    let content: string;
    try {
      content = fs.readFileSync(file_path, 'utf-8');
    } catch (err) {
      return {
        success: false,
        replacements: 0,
        error: `Failed to read file: ${(err as Error).message}`,
      };
    }

    // Validate old_string and new_string are different
    if (old_string === new_string) {
      return {
        success: false,
        replacements: 0,
        error: 'old_string and new_string must be different',
      };
    }

    // Find occurrences
    const occurrences = this.countOccurrences(content, old_string);

    if (occurrences === 0) {
      return {
        success: false,
        replacements: 0,
        error: `old_string not found in file`,
      };
    }

    // If not replace_all, ensure unique match
    if (!replace_all && occurrences > 1) {
      return {
        success: false,
        replacements: 0,
        error: `old_string found ${occurrences} times. Use replace_all=true or provide more context to make it unique.`,
      };
    }

    // Create backup if configured
    let backupPath: string | undefined;
    if (this.config.createBackups) {
      backupPath = file_path + this.config.backupSuffix;
      try {
        fs.copyFileSync(file_path, backupPath);
      } catch (err) {
        return {
          success: false,
          replacements: 0,
          error: `Failed to create backup: ${(err as Error).message}`,
        };
      }
    }

    // Perform replacement
    let newContent: string;
    let replacements: number;

    if (replace_all) {
      newContent = content.split(old_string).join(new_string);
      replacements = occurrences;
    } else {
      // Replace only first occurrence
      const index = content.indexOf(old_string);
      newContent = content.slice(0, index) + new_string + content.slice(index + old_string.length);
      replacements = 1;
    }

    // Write atomically
    try {
      const tempPath = file_path + '.tmp.' + Date.now();
      fs.writeFileSync(tempPath, newContent, 'utf-8');
      fs.renameSync(tempPath, file_path);
    } catch (err) {
      // Restore from backup if available
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, file_path);
      }
      return {
        success: false,
        replacements: 0,
        error: `Failed to write file: ${(err as Error).message}`,
      };
    }

    // Generate diff preview
    const diff = this.generateDiff(old_string, new_string, content);

    return {
      success: true,
      replacements,
      diff,
      backup: backupPath,
    };
  }

  /**
   * Write content to a file
   */
  async write(params: WriteParams): Promise<WriteResult> {
    const { file_path, content, backup = true } = params;

    // Validate path
    const pathValidation = this.validatePath(file_path);
    if (!pathValidation.valid) {
      return {
        success: false,
        error: pathValidation.reason,
        bytes_written: 0,
      };
    }

    // Create backup if file exists
    let backupPath: string | undefined;
    if (backup && fs.existsSync(file_path)) {
      backupPath = file_path + this.config.backupSuffix;
      try {
        fs.copyFileSync(file_path, backupPath);
      } catch (err) {
        return {
          success: false,
          error: `Failed to create backup: ${(err as Error).message}`,
          bytes_written: 0,
        };
      }
    }

    // Ensure parent directory exists
    const dir = path.dirname(file_path);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        return {
          success: false,
          error: `Failed to create directory: ${(err as Error).message}`,
          bytes_written: 0,
        };
      }
    }

    // Write atomically
    try {
      const tempPath = file_path + '.tmp.' + Date.now();
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, file_path);
    } catch (err) {
      return {
        success: false,
        error: `Failed to write file: ${(err as Error).message}`,
        bytes_written: 0,
      };
    }

    return {
      success: true,
      bytes_written: Buffer.byteLength(content, 'utf-8'),
      backup: backupPath,
    };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Count occurrences of a string in content
   */
  private countOccurrences(content: string, search: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = content.indexOf(search, pos)) !== -1) {
      count++;
      pos += search.length;
    }
    return count;
  }

  /**
   * Generate a simple diff preview
   */
  private generateDiff(old_string: string, new_string: string, context: string): string {
    const lines: string[] = [];
    const oldLines = old_string.split('\n');
    const newLines = new_string.split('\n');

    // Find line number in context
    const beforeMatch = context.split(old_string)[0];
    const lineNumber = beforeMatch.split('\n').length;

    lines.push(`@@ -${lineNumber},${oldLines.length} +${lineNumber},${newLines.length} @@`);

    for (const line of oldLines) {
      lines.push(`- ${line}`);
    }
    for (const line of newLines) {
      lines.push(`+ ${line}`);
    }

    return lines.join('\n');
  }

  /**
   * Check if a string occurs exactly once in content
   */
  isUnique(content: string, search: string): boolean {
    return this.countOccurrences(content, search) === 1;
  }

  /**
   * Find all occurrences with line numbers
   */
  findOccurrences(content: string, search: string): Array<{ line: number; column: number }> {
    const results: Array<{ line: number; column: number }> = [];
    const lines = content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let pos = 0;
      while ((pos = line.indexOf(search, pos)) !== -1) {
        results.push({ line: lineIdx + 1, column: pos + 1 });
        pos += search.length;
      }
    }

    // Also check for multi-line matches
    let globalPos = 0;
    while ((globalPos = content.indexOf(search, globalPos)) !== -1) {
      const beforeMatch = content.slice(0, globalPos);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = globalPos - lastNewline;

      // Add if not already in results (multi-line match)
      const exists = results.some(r => r.line === lineNumber && r.column === column);
      if (!exists) {
        results.push({ line: lineNumber, column });
      }

      globalPos += search.length;
    }

    return results;
  }

  /**
   * Get configuration
   */
  getConfig(): EditToolConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EditToolConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let editToolInstance: EditTool | null = null;

export function getEditTool(config?: Partial<EditToolConfig>): EditTool {
  if (!editToolInstance) {
    editToolInstance = new EditTool(config);
  } else if (config) {
    editToolInstance.updateConfig(config);
  }
  return editToolInstance;
}

export function resetEditTool(): void {
  editToolInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Edit a file with default settings
 */
export async function edit(params: EditParams): Promise<EditResult> {
  return getEditTool().edit(params);
}

/**
 * Write a file with default settings
 */
export async function writeFile(params: WriteParams): Promise<WriteResult> {
  return getEditTool().write(params);
}

/**
 * Check if old_string is unique in file
 */
export function isUnique(filePath: string, search: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  return getEditTool().isUnique(content, search);
}

/**
 * Validate a file path for editing
 */
export function validatePath(filePath: string): { valid: boolean; reason?: string } {
  return getEditTool().validatePath(filePath);
}
