/**
 * Genesis Self-Awareness Module
 *
 * Enables Genesis to know and understand its own codebase.
 *
 * Features:
 * - GitHub repo sync for code structure
 * - Semantic memory storage of code knowledge
 * - Periodic refresh to detect changes
 * - Introspection API for self-queries
 *
 * Usage:
 * ```typescript
 * import { getSelfAwareness } from './memory/self-awareness.js';
 *
 * const self = getSelfAwareness();
 * await self.sync(); // Load code from GitHub
 *
 * // Ask about own code
 * const info = self.introspect('How does the memory system work?');
 * ```
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { getMCPClient, MCPCallResult } from '../mcp/index.js';
import { getMemorySystem, SemanticMemory } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface CodeFile {
  path: string;
  content: string;
  hash: string;
  size: number;
  lastSynced: Date;
}

export interface CodeModule {
  name: string;
  path: string;
  description: string;
  exports: string[];
  dependencies: string[];
  files: string[];
}

export interface SelfAwarenessConfig {
  // Local path (preferred - faster, no auth needed)
  localPath?: string;  // e.g., '/Users/user/genesis' - if set, uses local filesystem

  // GitHub repo info (fallback when localPath not available)
  owner: string;
  repo: string;
  branch: string;

  // Sync settings
  syncIntervalMs: number;  // How often to check for updates
  autoSync: boolean;       // Start periodic sync on init

  // What to track
  includePaths: string[];  // Paths to include (glob patterns)
  excludePaths: string[];  // Paths to exclude

  // Memory settings
  maxFilesInMemory: number;
  storeFullContent: boolean;  // Store full file content or just metadata
}

export interface SyncResult {
  filesScanned: number;
  filesUpdated: number;
  filesAdded: number;
  filesRemoved: number;
  modulesDetected: number;
  duration: number;
  errors: string[];
}

export interface IntrospectionResult {
  query: string;
  relevantFiles: CodeFile[];
  relevantModules: CodeModule[];
  summary: string;
  confidence: number;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: SelfAwarenessConfig = {
  owner: 'rossignoliluca',
  repo: 'genesis',
  branch: 'main',
  syncIntervalMs: 30 * 60 * 1000, // 30 minutes
  autoSync: false,
  includePaths: ['src/**/*.ts'],
  excludePaths: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'],
  maxFilesInMemory: 100,
  storeFullContent: false,  // Store summaries to save memory
};

// ============================================================================
// Self-Awareness Class
// ============================================================================

export class SelfAwareness {
  private config: SelfAwarenessConfig;
  private files: Map<string, CodeFile> = new Map();
  private modules: Map<string, CodeModule> = new Map();
  private lastSync: Date | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(config: Partial<SelfAwarenessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize self-awareness by syncing with GitHub
   */
  async init(): Promise<SyncResult> {
    console.log('[SelfAwareness] Initializing...');

    // Initial sync
    const result = await this.sync();
    this.isInitialized = true;

    // Start periodic sync if configured
    if (this.config.autoSync) {
      this.startPeriodicSync();
    }

    console.log(`[SelfAwareness] Initialized with ${this.files.size} files, ${this.modules.size} modules`);
    return result;
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      console.log('[SelfAwareness] Running periodic sync...');
      await this.sync();
    }, this.config.syncIntervalMs);

    console.log(`[SelfAwareness] Periodic sync started (every ${this.config.syncIntervalMs / 60000} minutes)`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // ============================================================================
  // GitHub Sync
  // ============================================================================

  /**
   * Sync code from local filesystem or GitHub repository
   * Prefers local filesystem for speed and reliability
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      filesScanned: 0,
      filesUpdated: 0,
      filesAdded: 0,
      filesRemoved: 0,
      modulesDetected: 0,
      duration: 0,
      errors: [],
    };

    try {
      // Try local filesystem first (faster, no auth needed)
      if (this.config.localPath && existsSync(this.config.localPath)) {
        await this.syncFromLocal(result);
      } else {
        // Fall back to GitHub MCP
        await this.syncFromGitHub(result);
      }

      // Detect modules after sync
      this.detectModules();
      result.modulesDetected = this.modules.size;
      this.lastSync = new Date();

    } catch (error: any) {
      result.errors.push(error.message);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Sync from local filesystem (preferred method)
   */
  private async syncFromLocal(result: SyncResult): Promise<void> {
    const basePath = this.config.localPath!;
    const srcPath = join(basePath, 'src');

    if (!existsSync(srcPath)) {
      result.errors.push(`Source directory not found: ${srcPath}`);
      return;
    }

    const existingPaths = new Set(this.files.keys());
    const allFiles = this.walkDirectory(srcPath, basePath);

    for (const filePath of allFiles) {
      const relativePath = relative(basePath, filePath);
      if (!this.shouldInclude(relativePath)) continue;

      result.filesScanned++;
      existingPaths.delete(relativePath);

      try {
        const content = readFileSync(filePath, 'utf-8');
        const hash = createHash('sha256').update(content).digest('hex');
        const stats = statSync(filePath);

        const existingFile = this.files.get(relativePath);

        // Check if file changed
        if (existingFile && existingFile.hash === hash) {
          continue; // No change
        }

        const codeFile: CodeFile = {
          path: relativePath,
          content: this.config.storeFullContent ? content : this.summarizeContent(content),
          hash,
          size: stats.size,
          lastSynced: new Date(),
        };

        if (existingFile) {
          result.filesUpdated++;
        } else {
          result.filesAdded++;
        }

        this.files.set(relativePath, codeFile);

        // Store in semantic memory
        await this.storeInMemory(codeFile);

      } catch (err: any) {
        result.errors.push(`Failed to read ${relativePath}: ${err.message}`);
      }
    }

    // Remove deleted files
    for (const removedPath of existingPaths) {
      this.files.delete(removedPath);
      result.filesRemoved++;
    }
  }

  /**
   * Recursively walk directory to find all .ts files
   */
  private walkDirectory(dir: string, basePath: string): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
            continue;
          }
          files.push(...this.walkDirectory(fullPath, basePath));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch (err) {

      console.error('[self-awareness] operation failed:', err);
      // Ignore unreadable directories
    }

    return files;
  }

  /**
   * Sync from GitHub MCP (fallback method)
   */
  private async syncFromGitHub(result: SyncResult): Promise<void> {
    const client = getMCPClient();

    // Get repository tree
    const treeResult = await this.getRepoTree(client);
    if (!treeResult.success || !treeResult.data) {
      result.errors.push('Failed to get repository tree');
      return;
    }

    const tree = treeResult.data;
    const existingPaths = new Set(this.files.keys());

    // Process each file
    for (const item of tree) {
      if (item.type !== 'blob') continue;
      if (!this.shouldInclude(item.path)) continue;

      result.filesScanned++;
      existingPaths.delete(item.path);

      const existingFile = this.files.get(item.path);

      // Check if file changed (by SHA)
      if (existingFile && existingFile.hash === item.sha) {
        continue; // No change
      }

      // Fetch file content
      const contentResult = await this.getFileContent(client, item.path);
      if (!contentResult.success || !contentResult.data) {
        result.errors.push(`Failed to fetch: ${item.path}`);
        continue;
      }

      const content = contentResult.data;
      const hash = createHash('sha256').update(content).digest('hex');

      const codeFile: CodeFile = {
        path: item.path,
        content: this.config.storeFullContent ? content : this.summarizeContent(content),
        hash,
        size: content.length,
        lastSynced: new Date(),
      };

      if (existingFile) {
        result.filesUpdated++;
      } else {
        result.filesAdded++;
      }

      this.files.set(item.path, codeFile);

      // Store in semantic memory
      await this.storeInMemory(codeFile);
    }

    // Remove deleted files
    for (const removedPath of existingPaths) {
      this.files.delete(removedPath);
      result.filesRemoved++;
    }
  }

  /**
   * Get repository file tree from GitHub
   */
  private async getRepoTree(client: ReturnType<typeof getMCPClient>): Promise<MCPCallResult<any[]>> {
    try {
      // Use GitHub MCP to get repo contents
      const result = await client.call('github', 'get_file_contents', {
        owner: this.config.owner,
        repo: this.config.repo,
        path: 'src',
        branch: this.config.branch,
      });

      if (result.success && Array.isArray(result.data)) {
        // Recursively get all files
        const allFiles: any[] = [];
        await this.collectFiles(client, result.data, allFiles);
        return { ...result, data: allFiles };
      }

      return result as MCPCallResult<any[]>;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        server: 'github',
        tool: 'get_file_contents',
        mode: 'real',
        latency: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Recursively collect all files from directory structure
   */
  private async collectFiles(
    client: ReturnType<typeof getMCPClient>,
    items: any[],
    allFiles: any[]
  ): Promise<void> {
    for (const item of items) {
      if (item.type === 'file') {
        allFiles.push({
          path: item.path,
          sha: item.sha,
          type: 'blob',
          size: item.size,
        });
      } else if (item.type === 'dir') {
        // Recursively get directory contents
        const result = await client.call('github', 'get_file_contents', {
          owner: this.config.owner,
          repo: this.config.repo,
          path: item.path,
          branch: this.config.branch,
        });

        if (result.success && Array.isArray(result.data)) {
          await this.collectFiles(client, result.data, allFiles);
        }
      }
    }
  }

  /**
   * Get file content from GitHub
   */
  private async getFileContent(
    client: ReturnType<typeof getMCPClient>,
    path: string
  ): Promise<MCPCallResult<string>> {
    try {
      const result = await client.call('github', 'get_file_contents', {
        owner: this.config.owner,
        repo: this.config.repo,
        path,
        branch: this.config.branch,
      });

      if (result.success && result.data) {
        // GitHub returns base64 encoded content
        const content = typeof result.data === 'string'
          ? result.data
          : result.data.content
            ? Buffer.from(result.data.content, 'base64').toString('utf-8')
            : '';
        return { ...result, data: content };
      }

      return result as MCPCallResult<string>;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        server: 'github',
        tool: 'get_file_contents',
        mode: 'real',
        latency: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check if a path should be included based on config
   */
  private shouldInclude(path: string): boolean {
    // Check excludes first
    for (const pattern of this.config.excludePaths) {
      if (this.matchGlob(path, pattern)) {
        return false;
      }
    }

    // Check includes
    for (const pattern of this.config.includePaths) {
      if (this.matchGlob(path, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Escape dots FIRST, then handle wildcards
    const regex = pattern
      .replace(/\./g, '\\.')      // Escape dots first
      .replace(/\*\*/g, '.*')     // ** matches any path
      .replace(/(?<!\.)(\*)/g, '[^/]*');  // * matches single segment (not .*)
    return new RegExp(`^${regex}$`).test(path);
  }

  /**
   * Summarize file content (extract key info without full content)
   */
  private summarizeContent(content: string): string {
    const lines = content.split('\n');
    const summary: string[] = [];

    // Extract doc comments
    let inDocComment = false;
    for (const line of lines.slice(0, 50)) { // First 50 lines
      if (line.includes('/**')) {
        inDocComment = true;
        summary.push(line);
      } else if (line.includes('*/') && inDocComment) {
        summary.push(line);
        inDocComment = false;
      } else if (inDocComment) {
        summary.push(line);
      }
    }

    // Extract exports
    for (const line of lines) {
      if (line.startsWith('export ')) {
        summary.push(line.split('{')[0].trim());
      }
    }

    // Extract class/function names
    for (const line of lines) {
      const classMatch = line.match(/^export\s+(class|interface|type|function|const)\s+(\w+)/);
      if (classMatch) {
        summary.push(`${classMatch[1]}: ${classMatch[2]}`);
      }
    }

    return summary.join('\n').slice(0, 2000); // Max 2KB summary
  }

  // ============================================================================
  // Memory Integration
  // ============================================================================

  /**
   * Store file info in semantic memory
   */
  private async storeInMemory(file: CodeFile): Promise<void> {
    const memory = getMemorySystem();

    // Extract module name from path
    const parts = file.path.split('/');
    const moduleName = parts[1] || 'root'; // e.g., 'memory', 'mcp', 'brain'
    const fileName = parts[parts.length - 1];

    // Create semantic fact about this file
    memory.learn({
      concept: `genesis:file:${file.path}`,
      definition: `Genesis source file: ${fileName} in ${moduleName} module`,
      category: 'self-code',
      tags: ['genesis', 'source', moduleName, fileName.replace('.ts', '')],
      properties: {
        path: file.path,
        hash: file.hash,
        size: file.size,
        module: moduleName,
        summary: file.content.slice(0, 500),
      },
    });
  }

  /**
   * Detect and categorize modules from file structure
   */
  private detectModules(): void {
    this.modules.clear();

    // Group files by top-level directory
    const moduleFiles = new Map<string, CodeFile[]>();

    for (const [path, file] of this.files) {
      const parts = path.split('/');
      if (parts.length >= 2 && parts[0] === 'src') {
        const moduleName = parts[1];
        if (!moduleFiles.has(moduleName)) {
          moduleFiles.set(moduleName, []);
        }
        moduleFiles.get(moduleName)!.push(file);
      }
    }

    // Create module entries
    for (const [name, files] of moduleFiles) {
      // Find index.ts for module description
      const indexFile = files.find(f => f.path.endsWith('index.ts'));
      const description = indexFile
        ? this.extractModuleDescription(indexFile.content)
        : `Genesis ${name} module`;

      // Extract exports from index.ts
      const exports = indexFile
        ? this.extractExports(indexFile.content)
        : [];

      // Detect dependencies from imports
      const dependencies = this.detectDependencies(files);

      const module: CodeModule = {
        name,
        path: `src/${name}`,
        description,
        exports,
        dependencies,
        files: files.map(f => f.path),
      };

      this.modules.set(name, module);

      // Store module in memory
      const memory = getMemorySystem();
      memory.learn({
        concept: `genesis:module:${name}`,
        definition: description,
        category: 'self-module',
        tags: ['genesis', 'module', name],
        properties: {
          exports,
          dependencies,
          fileCount: files.length,
        },
      });
    }
  }

  /**
   * Extract module description from index.ts doc comment
   */
  private extractModuleDescription(content: string): string {
    const match = content.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
    if (match) {
      return match[1]
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trim())
        .filter(line => line && !line.startsWith('@'))
        .slice(0, 3)
        .join(' ')
        .slice(0, 200);
    }
    return '';
  }

  /**
   * Extract export names from file content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const regex = /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    return exports.slice(0, 20); // Max 20 exports
  }

  /**
   * Detect dependencies from imports
   */
  private detectDependencies(files: CodeFile[]): string[] {
    const deps = new Set<string>();

    for (const file of files) {
      const regex = /from\s+['"]\.\.\/(\w+)/g;
      let match;
      while ((match = regex.exec(file.content)) !== null) {
        deps.add(match[1]);
      }
    }

    return Array.from(deps);
  }

  // ============================================================================
  // Introspection API
  // ============================================================================

  /**
   * Answer questions about own code
   */
  introspect(query: string): IntrospectionResult {
    const memory = getMemorySystem();

    // Search semantic memory for relevant code knowledge
    const memories = memory.recall(query, {
      types: ['semantic'],
      limit: 10,
    }) as SemanticMemory[];

    // Filter to self-code facts
    const codeMemories = memories.filter(m =>
      m.category === 'self-code' || m.category === 'self-module'
    );

    // Get relevant files
    const relevantFiles: CodeFile[] = [];
    const relevantModules: CodeModule[] = [];

    for (const mem of codeMemories) {
      if (mem.category === 'self-code' && mem.content.properties?.path) {
        const file = this.files.get(mem.content.properties.path as string);
        if (file) relevantFiles.push(file);
      } else if (mem.category === 'self-module') {
        const moduleName = mem.content.concept.replace('genesis:module:', '');
        const module = this.modules.get(moduleName);
        if (module) relevantModules.push(module);
      }
    }

    // Generate summary
    const summary = this.generateIntrospectionSummary(query, relevantFiles, relevantModules);

    return {
      query,
      relevantFiles,
      relevantModules,
      summary,
      confidence: codeMemories.length > 0 ? Math.min(codeMemories.length / 5, 1) : 0,
    };
  }

  /**
   * Get info about a specific module
   */
  getModule(name: string): CodeModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Get info about a specific file
   */
  getFile(path: string): CodeFile | undefined {
    return this.files.get(path);
  }

  /**
   * List all modules
   */
  listModules(): CodeModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * List all files
   */
  listFiles(): CodeFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Get self-awareness stats
   */
  getStats(): {
    files: number;
    modules: number;
    totalSize: number;
    lastSync: Date | null;
    isInitialized: boolean;
  } {
    let totalSize = 0;
    for (const file of this.files.values()) {
      totalSize += file.size;
    }

    return {
      files: this.files.size,
      modules: this.modules.size,
      totalSize,
      lastSync: this.lastSync,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Generate summary for introspection result
   */
  private generateIntrospectionSummary(
    query: string,
    files: CodeFile[],
    modules: CodeModule[]
  ): string {
    const parts: string[] = [];

    if (modules.length > 0) {
      parts.push(`Relevant modules: ${modules.map(m => m.name).join(', ')}`);
      for (const mod of modules.slice(0, 3)) {
        parts.push(`- ${mod.name}: ${mod.description}`);
      }
    }

    if (files.length > 0) {
      parts.push(`\nRelevant files: ${files.length}`);
      for (const file of files.slice(0, 5)) {
        parts.push(`- ${file.path} (${file.size} bytes)`);
      }
    }

    if (parts.length === 0) {
      parts.push('No relevant code found for this query. Try syncing first with .sync()');
    }

    return parts.join('\n');
  }

  // ============================================================================
  // Shutdown
  // ============================================================================

  shutdown(): void {
    this.stopPeriodicSync();
    this.files.clear();
    this.modules.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let selfAwarenessInstance: SelfAwareness | null = null;

/**
 * Get or create the self-awareness instance
 */
export function getSelfAwareness(config?: Partial<SelfAwarenessConfig>): SelfAwareness {
  if (!selfAwarenessInstance) {
    selfAwarenessInstance = new SelfAwareness(config);
  }
  return selfAwarenessInstance;
}

/**
 * Reset self-awareness instance
 */
export function resetSelfAwareness(): void {
  if (selfAwarenessInstance) {
    selfAwarenessInstance.shutdown();
    selfAwarenessInstance = null;
  }
}
