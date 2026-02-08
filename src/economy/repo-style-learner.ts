/**
 * Repository Style Learner v19.5
 *
 * Learns and adapts to each repository's coding style:
 * - Analyzes existing code patterns
 * - Extracts naming conventions
 * - Learns formatting preferences
 * - Applies learned style to generated code
 *
 * This ensures our submissions match the repo's existing style.
 *
 * @module economy/repo-style-learner
 * @version 19.5.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface CodeStyle {
  // Naming conventions
  naming: {
    variables: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
    functions: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
    classes: 'PascalCase' | 'camelCase' | 'mixed';
    constants: 'UPPER_SNAKE' | 'camelCase' | 'mixed';
    files: 'kebab-case' | 'snake_case' | 'camelCase' | 'PascalCase' | 'mixed';
  };

  // Formatting
  formatting: {
    indentation: 'tabs' | 'spaces';
    indentSize: number;
    lineEnding: 'lf' | 'crlf';
    maxLineLength: number;
    trailingComma: boolean;
    semicolons: boolean;
    singleQuotes: boolean;
  };

  // Code patterns
  patterns: {
    preferArrowFunctions: boolean;
    preferConst: boolean;
    preferAsync: boolean;
    useTypeScript: boolean;
    useJSDoc: boolean;
    exportStyle: 'named' | 'default' | 'mixed';
  };

  // Documentation
  documentation: {
    hasReadme: boolean;
    hasContributing: boolean;
    commentStyle: 'jsdoc' | 'inline' | 'block' | 'minimal';
    requiresTests: boolean;
  };

  // Confidence in learned style
  confidence: number;
  sampledFiles: number;
  lastUpdated: Date;
}

export interface RepoStyleProfile {
  repo: string;
  owner: string;
  primaryLanguage: string;
  style: CodeStyle;
  exampleSnippets: string[];
  lintConfig?: Record<string, any>;
  prettierConfig?: Record<string, any>;
}

// ============================================================================
// Default Style
// ============================================================================

const DEFAULT_STYLE: CodeStyle = {
  naming: {
    variables: 'camelCase',
    functions: 'camelCase',
    classes: 'PascalCase',
    constants: 'UPPER_SNAKE',
    files: 'kebab-case',
  },
  formatting: {
    indentation: 'spaces',
    indentSize: 2,
    lineEnding: 'lf',
    maxLineLength: 100,
    trailingComma: true,
    semicolons: true,
    singleQuotes: true,
  },
  patterns: {
    preferArrowFunctions: true,
    preferConst: true,
    preferAsync: true,
    useTypeScript: false,
    useJSDoc: false,
    exportStyle: 'named',
  },
  documentation: {
    hasReadme: true,
    hasContributing: false,
    commentStyle: 'inline',
    requiresTests: false,
  },
  confidence: 0.5,
  sampledFiles: 0,
  lastUpdated: new Date(),
};

// ============================================================================
// Repository Style Learner
// ============================================================================

export class RepoStyleLearner {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private cache = new Map<string, RepoStyleProfile>();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? '.genesis/repo-styles.json';
    this.load();
  }

  /**
   * Learn the coding style of a repository
   */
  async learnStyle(owner: string, repo: string): Promise<RepoStyleProfile> {
    const cacheKey = `${owner}/${repo}`;

    // Check cache (valid for 24 hours)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.style.lastUpdated.getTime() < 24 * 60 * 60 * 1000) {
      console.log(`[RepoStyleLearner] Using cached style for ${cacheKey}`);
      return cached;
    }

    console.log(`[RepoStyleLearner] Learning style for ${cacheKey}...`);

    try {
      // 1. Get repository info
      const repoInfo = await this.mcp.call('github', 'get_repository', { owner, repo });
      const primaryLanguage = repoInfo?.data?.language || 'Unknown';

      // 2. Fetch sample files
      const sampleFiles = await this.fetchSampleFiles(owner, repo, primaryLanguage);

      // 3. Check for lint/prettier configs
      const lintConfig = await this.fetchLintConfig(owner, repo);
      const prettierConfig = await this.fetchPrettierConfig(owner, repo);

      // 4. Analyze style from sample files
      const style = await this.analyzeStyle(sampleFiles, primaryLanguage, lintConfig, prettierConfig);

      // 5. Extract example snippets
      const exampleSnippets = this.extractSnippets(sampleFiles);

      const profile: RepoStyleProfile = {
        repo,
        owner,
        primaryLanguage,
        style,
        exampleSnippets,
        lintConfig,
        prettierConfig,
      };

      // Cache and persist
      this.cache.set(cacheKey, profile);
      this.save();

      console.log(`[RepoStyleLearner] Learned style for ${cacheKey} (confidence: ${(style.confidence * 100).toFixed(0)}%)`);
      return profile;

    } catch (error) {
      console.error(`[RepoStyleLearner] Failed to learn style for ${cacheKey}:`, error);

      // Return default style
      return {
        repo,
        owner,
        primaryLanguage: 'Unknown',
        style: { ...DEFAULT_STYLE, confidence: 0.3 },
        exampleSnippets: [],
      };
    }
  }

  /**
   * Apply learned style to generated code
   */
  async applyStyle(code: string, profile: RepoStyleProfile): Promise<string> {
    console.log(`[RepoStyleLearner] Applying ${profile.owner}/${profile.repo} style...`);

    const systemPrompt = `You are a code formatter that adapts code to match a specific repository's style.

REPOSITORY STYLE:
${JSON.stringify(profile.style, null, 2)}

EXAMPLE CODE FROM THIS REPO:
${profile.exampleSnippets.slice(0, 2).join('\n\n---\n\n')}

RULES:
1. Match the naming conventions exactly
2. Use the same indentation style
3. Match quote style (single/double)
4. Match semicolon usage
5. Match comment style
6. Preserve the code's functionality
7. Return ONLY the reformatted code, no explanations`;

    const userPrompt = `Reformat this code to match the repository's style:

\`\`\`
${code}
\`\`\`

Return only the reformatted code:`;

    try {
      const response = await this.router.execute(userPrompt, systemPrompt);

      // Extract code from response
      let formatted = response.content;
      const codeMatch = formatted.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        formatted = codeMatch[1].trim();
      }

      return formatted || code;
    } catch (error) {
      console.error('[RepoStyleLearner] Failed to apply style:', error);
      return code;
    }
  }

  /**
   * Generate style guide for code generation prompts
   */
  generateStyleGuide(profile: RepoStyleProfile): string {
    const s = profile.style;
    const lines: string[] = [];

    lines.push('# Code Style Requirements\n');

    // Naming
    lines.push('## Naming Conventions');
    lines.push(`- Variables: ${s.naming.variables}`);
    lines.push(`- Functions: ${s.naming.functions}`);
    lines.push(`- Classes: ${s.naming.classes}`);
    lines.push(`- Constants: ${s.naming.constants}`);
    lines.push('');

    // Formatting
    lines.push('## Formatting');
    lines.push(`- Indentation: ${s.formatting.indentSize} ${s.formatting.indentation}`);
    lines.push(`- Max line length: ${s.formatting.maxLineLength}`);
    lines.push(`- Semicolons: ${s.formatting.semicolons ? 'required' : 'omit'}`);
    lines.push(`- Quotes: ${s.formatting.singleQuotes ? 'single' : 'double'}`);
    lines.push(`- Trailing commas: ${s.formatting.trailingComma ? 'yes' : 'no'}`);
    lines.push('');

    // Patterns
    lines.push('## Code Patterns');
    if (s.patterns.preferArrowFunctions) lines.push('- Prefer arrow functions');
    if (s.patterns.preferConst) lines.push('- Use const over let');
    if (s.patterns.preferAsync) lines.push('- Use async/await over promises');
    if (s.patterns.useTypeScript) lines.push('- TypeScript with proper types');
    if (s.patterns.useJSDoc) lines.push('- Add JSDoc comments');
    lines.push(`- Export style: ${s.patterns.exportStyle}`);
    lines.push('');

    // Documentation
    if (s.documentation.requiresTests) {
      lines.push('## Requirements');
      lines.push('- Include unit tests');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async fetchSampleFiles(
    owner: string,
    repo: string,
    language: string
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    // Get file extensions for this language
    const extensions = this.getLanguageExtensions(language);

    try {
      // Get repository tree
      const tree = await this.mcp.call('github', 'get_repository_tree', {
        owner,
        repo,
        tree_sha: 'HEAD',
        recursive: true,
      });

      if (!tree?.data?.tree) return files;

      // Filter to relevant files
      const relevantFiles = tree.data.tree
        .filter((f: any) => {
          if (f.type !== 'blob') return false;
          const ext = path.extname(f.path);
          return extensions.includes(ext);
        })
        .slice(0, 10); // Max 10 files

      // Fetch content for each file
      for (const file of relevantFiles) {
        try {
          const content = await this.mcp.call('github', 'get_file_contents', {
            owner,
            repo,
            path: file.path,
          });

          if (content?.data?.content) {
            const decoded = Buffer.from(content.data.content, 'base64').toString('utf-8');
            if (decoded.length < 10000) { // Skip very large files
              files.push({ path: file.path, content: decoded });
            }
          }
        } catch {
          // Skip files we can't fetch
        }
      }
    } catch (error) {
      console.warn('[RepoStyleLearner] Failed to fetch sample files:', error);
    }

    return files;
  }

  private async fetchLintConfig(owner: string, repo: string): Promise<Record<string, any> | undefined> {
    const configFiles = ['.eslintrc.json', '.eslintrc.js', '.eslintrc', 'eslint.config.js'];

    for (const configFile of configFiles) {
      try {
        const content = await this.mcp.call('github', 'get_file_contents', {
          owner,
          repo,
          path: configFile,
        });

        if (content?.data?.content) {
          const decoded = Buffer.from(content.data.content, 'base64').toString('utf-8');
          try {
            return JSON.parse(decoded);
          } catch {
            // Not JSON, might be JS
          }
        }
      } catch {
        // Config not found
      }
    }

    return undefined;
  }

  private async fetchPrettierConfig(owner: string, repo: string): Promise<Record<string, any> | undefined> {
    const configFiles = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];

    for (const configFile of configFiles) {
      try {
        const content = await this.mcp.call('github', 'get_file_contents', {
          owner,
          repo,
          path: configFile,
        });

        if (content?.data?.content) {
          const decoded = Buffer.from(content.data.content, 'base64').toString('utf-8');
          try {
            return JSON.parse(decoded);
          } catch {
            // Not JSON
          }
        }
      } catch {
        // Config not found
      }
    }

    return undefined;
  }

  private async analyzeStyle(
    files: Array<{ path: string; content: string }>,
    language: string,
    lintConfig?: Record<string, any>,
    prettierConfig?: Record<string, any>
  ): Promise<CodeStyle> {
    const style = { ...DEFAULT_STYLE };
    style.sampledFiles = files.length;
    style.lastUpdated = new Date();

    if (files.length === 0) {
      style.confidence = 0.3;
      return style;
    }

    // Analyze from prettier config if available
    if (prettierConfig) {
      if (prettierConfig.tabWidth) style.formatting.indentSize = prettierConfig.tabWidth;
      if (prettierConfig.useTabs !== undefined) {
        style.formatting.indentation = prettierConfig.useTabs ? 'tabs' : 'spaces';
      }
      if (prettierConfig.semi !== undefined) style.formatting.semicolons = prettierConfig.semi;
      if (prettierConfig.singleQuote !== undefined) style.formatting.singleQuotes = prettierConfig.singleQuote;
      if (prettierConfig.trailingComma) {
        style.formatting.trailingComma = prettierConfig.trailingComma !== 'none';
      }
      if (prettierConfig.printWidth) style.formatting.maxLineLength = prettierConfig.printWidth;
      style.confidence = Math.min(0.9, style.confidence + 0.2);
    }

    // Analyze from files
    let tabCount = 0;
    let spaceCount = 0;
    let semicolonCount = 0;
    let noSemicolonCount = 0;
    let singleQuoteCount = 0;
    let doubleQuoteCount = 0;
    let arrowFunctionCount = 0;
    let regularFunctionCount = 0;
    let constCount = 0;
    let letCount = 0;
    let asyncCount = 0;

    for (const file of files) {
      const content = file.content;
      const lines = content.split('\n');

      // Check TypeScript
      if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
        style.patterns.useTypeScript = true;
      }

      for (const line of lines) {
        // Indentation
        if (line.startsWith('\t')) tabCount++;
        else if (line.match(/^  /)) spaceCount++;

        // Semicolons
        if (line.trim().endsWith(';')) semicolonCount++;
        else if (line.trim().length > 0 && !line.trim().startsWith('//')) noSemicolonCount++;

        // Quotes
        singleQuoteCount += (line.match(/'/g) || []).length;
        doubleQuoteCount += (line.match(/"/g) || []).length;

        // Functions
        if (line.includes('=>')) arrowFunctionCount++;
        if (line.includes('function ')) regularFunctionCount++;

        // Variables
        constCount += (line.match(/\bconst\b/g) || []).length;
        letCount += (line.match(/\blet\b/g) || []).length;

        // Async
        if (line.includes('async ')) asyncCount++;
      }

      // Check for JSDoc
      if (content.includes('/**') && content.includes('*/')) {
        style.patterns.useJSDoc = true;
      }
    }

    // Apply analyzed style
    style.formatting.indentation = tabCount > spaceCount ? 'tabs' : 'spaces';
    style.formatting.semicolons = semicolonCount > noSemicolonCount;
    style.formatting.singleQuotes = singleQuoteCount > doubleQuoteCount;
    style.patterns.preferArrowFunctions = arrowFunctionCount > regularFunctionCount;
    style.patterns.preferConst = constCount > letCount;
    style.patterns.preferAsync = asyncCount > 0;

    // Detect indent size from spaces
    if (style.formatting.indentation === 'spaces') {
      const indentMatches = files[0]?.content.match(/^( +)/gm) || [];
      const sizes = indentMatches.map(m => m.length).filter(s => s > 0);
      if (sizes.length > 0) {
        const minSize = Math.min(...sizes);
        if (minSize === 4) style.formatting.indentSize = 4;
        else style.formatting.indentSize = 2;
      }
    }

    // Calculate confidence based on sample size
    style.confidence = Math.min(0.95, 0.5 + (files.length * 0.05));

    return style;
  }

  private extractSnippets(files: Array<{ path: string; content: string }>): string[] {
    const snippets: string[] = [];

    for (const file of files.slice(0, 3)) {
      // Extract first 50 lines as snippet
      const lines = file.content.split('\n').slice(0, 50);
      snippets.push(`// File: ${file.path}\n${lines.join('\n')}`);
    }

    return snippets;
  }

  private getLanguageExtensions(language: string): string[] {
    const extensionMap: Record<string, string[]> = {
      'JavaScript': ['.js', '.jsx', '.mjs'],
      'TypeScript': ['.ts', '.tsx'],
      'Python': ['.py'],
      'Go': ['.go'],
      'Rust': ['.rs'],
      'Java': ['.java'],
      'C#': ['.cs'],
      'Ruby': ['.rb'],
      'PHP': ['.php'],
      'Swift': ['.swift'],
      'Kotlin': ['.kt'],
      'Solidity': ['.sol'],
    };

    return extensionMap[language] || ['.js', '.ts', '.py', '.go'];
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data: Record<string, any> = {};
      for (const [key, profile] of this.cache) {
        data[key] = {
          ...profile,
          style: {
            ...profile.style,
            lastUpdated: profile.style.lastUpdated.toISOString(),
          },
        };
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[RepoStyleLearner] Failed to save:', error);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;

      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));

      for (const [key, profile] of Object.entries(data)) {
        const p = profile as any;
        this.cache.set(key, {
          ...p,
          style: {
            ...p.style,
            lastUpdated: new Date(p.style.lastUpdated),
          },
        });
      }

      console.log(`[RepoStyleLearner] Loaded styles for ${this.cache.size} repositories`);
    } catch (error) {
      console.error('[RepoStyleLearner] Failed to load:', error);
    }
  }

  /**
   * Get cached style profile
   */
  getCachedStyle(owner: string, repo: string): RepoStyleProfile | undefined {
    return this.cache.get(`${owner}/${repo}`);
  }

  /**
   * Clear cache for a repository
   */
  clearCache(owner: string, repo: string): void {
    this.cache.delete(`${owner}/${repo}`);
    this.save();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let styleLearner: RepoStyleLearner | null = null;

export function getRepoStyleLearner(): RepoStyleLearner {
  if (!styleLearner) {
    styleLearner = new RepoStyleLearner();
  }
  return styleLearner;
}

export function resetRepoStyleLearner(): void {
  styleLearner = null;
}
