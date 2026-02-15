/**
 * Repository Cloner v21.0
 *
 * Shallow-clones target repos locally for FULL codebase analysis.
 * This is THE fundamental fix — every PR rejection traced back to
 * "you clearly didn't read our code."
 *
 * Provides:
 * - Shallow git clone (depth=1, single branch)
 * - Full recursive directory tree
 * - Smart file reading (prioritizes relevant files)
 * - Test framework detection
 * - CI configuration extraction
 * - Cleanup after use
 *
 * @module economy/repo-cloner
 * @version 21.0.0
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface ClonedRepo {
  /** Local path to the cloned repo */
  localPath: string;
  /** Owner/repo identifier */
  repoKey: string;
  /** Primary programming language detected */
  primaryLanguage: string;
  /** Full recursive file tree */
  fileTree: string[];
  /** Source files (code, not assets/configs) */
  sourceFiles: string[];
  /** Test files */
  testFiles: string[];
  /** Config files (.editorconfig, linting, CI) */
  configFiles: string[];
  /** Whether the clone was successful */
  success: boolean;
  /** Error message if clone failed */
  error?: string;
}

export interface RepoAnalysis {
  /** Primary language */
  language: string;
  /** All languages detected */
  languages: string[];
  /** Test framework info */
  testFramework: TestFrameworkInfo | null;
  /** CI system detected */
  ciSystem: CISystemInfo | null;
  /** Package manager */
  packageManager: string | null;
  /** Default branch name */
  defaultBranch: string;
  /** Has CONTRIBUTING.md */
  hasContributing: boolean;
  /** Has PR template */
  hasPRTemplate: boolean;
  /** Key source files (most relevant to read) */
  keyFiles: string[];
  /** Signals that AI PRs may be unwelcome */
  aiBanSignals: string[];
  /** Total lines of code (approximate) */
  totalLinesOfCode: number;
}

export interface TestFrameworkInfo {
  name: string;
  command: string;
  configFile: string | null;
  testDir: string | null;
  testFilePattern: string;
}

export interface CISystemInfo {
  name: string;
  configPath: string;
  /** Commands that run in CI (extracted from config) */
  commands: string[];
}

// ============================================================================
// Constants
// ============================================================================

const CLONE_BASE_DIR = path.join(os.tmpdir(), 'genesis-repos');
const MAX_CLONE_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file read
const MAX_TOTAL_READ = 500 * 1024; // 500KB total context budget

// Language detection by file extension
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.py': 'Python', '.pyw': 'Python',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.c': 'C', '.h': 'C',
  '.cpp': 'C++', '.hpp': 'C++', '.cc': 'C++',
  '.cs': 'C#',
  '.swift': 'Swift',
  '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.scala': 'Scala',
  '.sol': 'Solidity',
  '.r': 'R', '.R': 'R',
  '.lua': 'Lua',
  '.ex': 'Elixir', '.exs': 'Elixir',
  '.zig': 'Zig',
  '.dart': 'Dart',
  '.v': 'V',
  '.nim': 'Nim',
};

// Files to skip when building tree
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
  '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build', 'target',
  '.next', '.nuxt', '.cache', 'coverage', '.eggs', '*.egg-info',
  'vendor', 'bower_components', '.bundle', 'Pods',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.pyc', '.pyo', '.class', '.o', '.obj',
  '.lock', // package lock files are huge
]);

// ============================================================================
// Main Class
// ============================================================================

export class RepoCloner {
  private cloneCache = new Map<string, { repo: ClonedRepo; timestamp: number }>();

  /**
   * Clone a repository (or use cache if recent)
   */
  async clone(owner: string, repo: string, defaultBranch?: string): Promise<ClonedRepo> {
    const repoKey = `${owner}/${repo}`;

    // Check cache
    const cached = this.cloneCache.get(repoKey);
    if (cached && Date.now() - cached.timestamp < MAX_CLONE_AGE_MS) {
      if (fs.existsSync(cached.repo.localPath)) {
        console.log(`[RepoCloner] Using cached clone for ${repoKey}`);
        return cached.repo;
      }
    }

    // Ensure base directory exists
    if (!fs.existsSync(CLONE_BASE_DIR)) {
      fs.mkdirSync(CLONE_BASE_DIR, { recursive: true });
    }

    const localPath = path.join(CLONE_BASE_DIR, `${owner}--${repo}`);

    // Remove stale clone if exists
    if (fs.existsSync(localPath)) {
      try {
        fs.rmSync(localPath, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
        console.error('[repo-cloner] Cleanup failed:', err);
      }
    }

    console.log(`[RepoCloner] Cloning ${repoKey} (shallow, depth=1)...`);

    try {
      const branch = defaultBranch || 'main';
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;

      // Shallow clone — only last commit, single branch
      const result = spawnSync('git', [
        'clone',
        '--depth', '1',
        '--single-branch',
        '--branch', branch,
        cloneUrl,
        localPath,
      ], {
        timeout: 60000, // 60s timeout
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      if (result.status !== 0) {
        // Try 'master' if 'main' fails
        if (branch === 'main') {
          console.log(`[RepoCloner] 'main' branch failed, trying 'master'...`);
          const retryResult = spawnSync('git', [
            'clone',
            '--depth', '1',
            '--single-branch',
            '--branch', 'master',
            cloneUrl,
            localPath,
          ], {
            timeout: 60000,
            stdio: 'pipe',
            encoding: 'utf-8',
          });

          if (retryResult.status !== 0) {
            return {
              localPath: '',
              repoKey,
              primaryLanguage: 'Unknown',
              fileTree: [],
              sourceFiles: [],
              testFiles: [],
              configFiles: [],
              success: false,
              error: `Clone failed: ${retryResult.stderr?.slice(0, 200)}`,
            };
          }
        } else {
          return {
            localPath: '',
            repoKey,
            primaryLanguage: 'Unknown',
            fileTree: [],
            sourceFiles: [],
            testFiles: [],
            configFiles: [],
            success: false,
            error: `Clone failed: ${result.stderr?.slice(0, 200)}`,
          };
        }
      }

      console.log(`[RepoCloner] Clone successful: ${localPath}`);

      // Build file tree
      const fileTree = this.buildFileTree(localPath);
      const sourceFiles: string[] = [];
      const testFiles: string[] = [];
      const configFiles: string[] = [];

      // Categorize files
      for (const file of fileTree) {
        const ext = path.extname(file).toLowerCase();
        const basename = path.basename(file).toLowerCase();
        const relDir = path.dirname(file).toLowerCase();

        if (this.isTestFile(file)) {
          testFiles.push(file);
        } else if (this.isConfigFile(file)) {
          configFiles.push(file);
        } else if (EXT_TO_LANGUAGE[ext]) {
          sourceFiles.push(file);
        }
      }

      // Detect primary language
      const langCounts = new Map<string, number>();
      for (const file of sourceFiles) {
        const ext = path.extname(file).toLowerCase();
        const lang = EXT_TO_LANGUAGE[ext];
        if (lang) {
          langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
        }
      }
      const primaryLanguage = [...langCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

      const clonedRepo: ClonedRepo = {
        localPath,
        repoKey,
        primaryLanguage,
        fileTree,
        sourceFiles,
        testFiles,
        configFiles,
        success: true,
      };

      // Cache it
      this.cloneCache.set(repoKey, { repo: clonedRepo, timestamp: Date.now() });

      console.log(`[RepoCloner] Indexed: ${sourceFiles.length} source, ${testFiles.length} test, ${configFiles.length} config files`);

      return clonedRepo;
    } catch (error) {
      return {
        localPath: '',
        repoKey,
        primaryLanguage: 'Unknown',
        fileTree: [],
        sourceFiles: [],
        testFiles: [],
        configFiles: [],
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Analyze a cloned repo in depth
   */
  analyzeRepo(clonedRepo: ClonedRepo): RepoAnalysis {
    const { localPath, fileTree, sourceFiles, testFiles, configFiles } = clonedRepo;

    // Languages
    const langCounts = new Map<string, number>();
    for (const file of sourceFiles) {
      const ext = path.extname(file).toLowerCase();
      const lang = EXT_TO_LANGUAGE[ext];
      if (lang) {
        langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
      }
    }
    const languages = [...langCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);

    // Test framework detection
    const testFramework = this.detectTestFramework(localPath, configFiles);

    // CI system detection
    const ciSystem = this.detectCISystem(localPath, fileTree);

    // Package manager
    const packageManager = this.detectPackageManager(localPath, fileTree);

    // Default branch
    let defaultBranch = 'main';
    try {
      const headRef = fs.readFileSync(path.join(localPath, '.git', 'HEAD'), 'utf-8').trim();
      const match = headRef.match(/ref: refs\/heads\/(.+)/);
      if (match) defaultBranch = match[1];
    } catch (err) { /* ignore */ console.error('[repo-cloner] Default branch detection failed:', err); }

    // Contributing & PR template
    const hasContributing = fileTree.some(f =>
      f.toLowerCase().includes('contributing')
    );
    const hasPRTemplate = fileTree.some(f =>
      f.toLowerCase().includes('pull_request_template')
    );

    // AI ban signals
    const aiBanSignals = this.detectAIBanSignals(localPath, fileTree);

    // Key files (most relevant to read for context)
    const keyFiles = this.identifyKeyFiles(localPath, sourceFiles, configFiles);

    // Approximate LOC
    let totalLinesOfCode = 0;
    for (const file of sourceFiles.slice(0, 100)) {
      try {
        const fullPath = path.join(localPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.size < MAX_FILE_SIZE) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          totalLinesOfCode += content.split('\n').filter(l => l.trim().length > 0).length;
        }
      } catch (err) { /* skip */ console.error('[repo-cloner] LOC count failed:', err); }
    }

    return {
      language: clonedRepo.primaryLanguage,
      languages,
      testFramework,
      ciSystem,
      packageManager,
      defaultBranch,
      hasContributing,
      hasPRTemplate,
      keyFiles,
      aiBanSignals,
      totalLinesOfCode,
    };
  }

  /**
   * Read a file from a cloned repo
   */
  readFile(clonedRepo: ClonedRepo, relativePath: string): string | null {
    try {
      const fullPath = path.join(clonedRepo.localPath, relativePath);
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) {
        return null; // Too large
      }
      return fs.readFileSync(fullPath, 'utf-8');
    } catch (err) {
      console.error('[repo-cloner] File read failed:', err);
      return null;
    }
  }

  /**
   * Read multiple files, respecting total context budget
   */
  readFiles(clonedRepo: ClonedRepo, relativePaths: string[]): Map<string, string> {
    const result = new Map<string, string>();
    let totalRead = 0;

    for (const relPath of relativePaths) {
      if (totalRead >= MAX_TOTAL_READ) break;

      const content = this.readFile(clonedRepo, relPath);
      if (content) {
        const trimmed = content.slice(0, MAX_TOTAL_READ - totalRead);
        result.set(relPath, trimmed);
        totalRead += trimmed.length;
      }
    }

    return result;
  }

  /**
   * Find files matching a pattern in a cloned repo
   */
  findFiles(clonedRepo: ClonedRepo, pattern: RegExp): string[] {
    return clonedRepo.fileTree.filter(f => pattern.test(f));
  }

  /**
   * Get files in the same directory as a target file
   */
  getSiblingFiles(clonedRepo: ClonedRepo, targetFile: string): string[] {
    const dir = path.dirname(targetFile);
    return clonedRepo.fileTree.filter(f =>
      path.dirname(f) === dir && f !== targetFile
    );
  }

  /**
   * Clean up all cloned repos
   */
  cleanup(): void {
    console.log('[RepoCloner] Cleaning up cloned repos...');
    for (const [key, cached] of this.cloneCache) {
      try {
        if (fs.existsSync(cached.repo.localPath)) {
          fs.rmSync(cached.repo.localPath, { recursive: true, force: true });
        }
      } catch (err) {
        // Ignore cleanup errors
        console.error('[repo-cloner] Cache cleanup failed:', err);
      }
    }
    this.cloneCache.clear();
  }

  /**
   * Clean up a specific cloned repo
   */
  cleanupRepo(repoKey: string): void {
    const cached = this.cloneCache.get(repoKey);
    if (cached) {
      try {
        if (fs.existsSync(cached.repo.localPath)) {
          fs.rmSync(cached.repo.localPath, { recursive: true, force: true });
        }
      } catch (err) { /* ignore */ console.error('[repo-cloner] Repo cleanup failed:', err); }
      this.cloneCache.delete(repoKey);
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private buildFileTree(rootPath: string): string[] {
    const files: string[] = [];

    const walk = (dir: string, prefix: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const name = entry.name;

          // Skip hidden directories and known large dirs
          if (name.startsWith('.') && entry.isDirectory()) continue;
          if (SKIP_DIRS.has(name)) continue;

          const relPath = prefix ? `${prefix}/${name}` : name;

          if (entry.isDirectory()) {
            walk(path.join(dir, name), relPath);
          } else if (entry.isFile()) {
            const ext = path.extname(name).toLowerCase();
            if (!SKIP_EXTENSIONS.has(ext)) {
              files.push(relPath);
            }
          }
        }
      } catch (err) {
        // Permission error or similar — skip
        console.error('[repo-cloner] Directory walk failed:', err);
      }
    };

    walk(rootPath, '');
    return files;
  }

  private isTestFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    const basename = path.basename(lower);

    return (
      lower.includes('/test/') ||
      lower.includes('/tests/') ||
      lower.includes('/spec/') ||
      lower.includes('/__tests__/') ||
      lower.includes('/test_') ||
      basename.startsWith('test_') ||
      basename.endsWith('_test.py') ||
      basename.endsWith('_test.go') ||
      basename.endsWith('.test.ts') ||
      basename.endsWith('.test.js') ||
      basename.endsWith('.test.tsx') ||
      basename.endsWith('.test.jsx') ||
      basename.endsWith('.spec.ts') ||
      basename.endsWith('.spec.js') ||
      basename.endsWith('_spec.rb')
    );
  }

  private isConfigFile(filePath: string): boolean {
    const basename = path.basename(filePath).toLowerCase();
    const configFiles = [
      'package.json', 'tsconfig.json', 'setup.py', 'setup.cfg', 'pyproject.toml',
      'cargo.toml', 'go.mod', 'gemfile', 'build.gradle', 'pom.xml',
      '.editorconfig', '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml',
      '.prettierrc', '.prettierrc.js', '.prettierrc.json',
      'jest.config.js', 'jest.config.ts', 'vitest.config.ts',
      'pytest.ini', 'tox.ini', '.flake8', '.pylintrc',
      'makefile', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
      '.github', '.gitlab-ci.yml', '.travis.yml',
      'contributing.md', 'code_of_conduct.md', 'license', 'license.md',
    ];

    return configFiles.includes(basename) ||
      filePath.includes('.github/') ||
      filePath.includes('.circleci/');
  }

  private detectTestFramework(localPath: string, configFiles: string[]): TestFrameworkInfo | null {
    // Check package.json
    const pkgPath = path.join(localPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if (deps.vitest) {
          return {
            name: 'vitest',
            command: pkg.scripts?.test || 'npx vitest run',
            configFile: configFiles.find(f => f.includes('vitest.config')) || null,
            testDir: null,
            testFilePattern: '*.test.{ts,js,tsx,jsx}',
          };
        }
        if (deps.jest) {
          return {
            name: 'jest',
            command: pkg.scripts?.test || 'npx jest',
            configFile: configFiles.find(f => f.includes('jest.config')) || null,
            testDir: null,
            testFilePattern: '*.test.{ts,js,tsx,jsx}',
          };
        }
        if (deps.mocha) {
          return {
            name: 'mocha',
            command: pkg.scripts?.test || 'npx mocha',
            configFile: configFiles.find(f => f.includes('.mocharc')) || null,
            testDir: 'test',
            testFilePattern: '*.test.{ts,js}',
          };
        }
      } catch (err) { /* ignore parse errors */ console.error('[repo-cloner] package.json parse failed:', err); }
    }

    // Check pyproject.toml / setup.cfg for pytest
    const pyprojectPath = path.join(localPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        if (content.includes('pytest') || content.includes('[tool.pytest')) {
          return {
            name: 'pytest',
            command: 'pytest',
            configFile: 'pyproject.toml',
            testDir: configFiles.find(f => f === 'tests') ? 'tests' : 'test',
            testFilePattern: 'test_*.py',
          };
        }
      } catch (err) { /* ignore */ console.error('[repo-cloner] pyproject.toml read failed:', err); }
    }

    // Check for Go tests
    const goModPath = path.join(localPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      return {
        name: 'go_test',
        command: 'go test ./...',
        configFile: 'go.mod',
        testDir: null,
        testFilePattern: '*_test.go',
      };
    }

    // Check for Rust tests
    const cargoPath = path.join(localPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      return {
        name: 'cargo_test',
        command: 'cargo test',
        configFile: 'Cargo.toml',
        testDir: null,
        testFilePattern: '**/tests/*.rs',
      };
    }

    return null;
  }

  private detectCISystem(localPath: string, fileTree: string[]): CISystemInfo | null {
    // GitHub Actions
    const ghWorkflows = fileTree.filter(f => f.startsWith('.github/workflows/'));
    if (ghWorkflows.length > 0) {
      const commands: string[] = [];
      for (const wf of ghWorkflows.slice(0, 3)) {
        try {
          const content = fs.readFileSync(path.join(localPath, wf), 'utf-8');
          // Extract run commands
          const runMatches = content.match(/run:\s*(.+)/g);
          if (runMatches) {
            commands.push(...runMatches.map(m => m.replace('run:', '').trim()).slice(0, 5));
          }
        } catch (err) { /* ignore */ console.error('[repo-cloner] Workflow parse failed:', err); }
      }
      return {
        name: 'github-actions',
        configPath: '.github/workflows/',
        commands,
      };
    }

    // GitLab CI
    if (fileTree.includes('.gitlab-ci.yml')) {
      return { name: 'gitlab-ci', configPath: '.gitlab-ci.yml', commands: [] };
    }

    // Travis CI
    if (fileTree.includes('.travis.yml')) {
      return { name: 'travis', configPath: '.travis.yml', commands: [] };
    }

    // CircleCI
    const circleConfig = fileTree.find(f => f.startsWith('.circleci/'));
    if (circleConfig) {
      return { name: 'circleci', configPath: circleConfig, commands: [] };
    }

    return null;
  }

  private detectPackageManager(localPath: string, fileTree: string[]): string | null {
    if (fileTree.includes('pnpm-lock.yaml')) return 'pnpm';
    if (fileTree.includes('yarn.lock')) return 'yarn';
    if (fileTree.includes('package-lock.json')) return 'npm';
    if (fileTree.includes('bun.lockb')) return 'bun';
    if (fileTree.includes('Pipfile.lock')) return 'pipenv';
    if (fileTree.includes('poetry.lock')) return 'poetry';
    if (fileTree.includes('requirements.txt')) return 'pip';
    if (fileTree.includes('Cargo.lock')) return 'cargo';
    if (fileTree.includes('go.sum')) return 'go';
    if (fileTree.includes('Gemfile.lock')) return 'bundler';
    return null;
  }

  private detectAIBanSignals(localPath: string, fileTree: string[]): string[] {
    const signals: string[] = [];

    // Check CONTRIBUTING.md for AI/bot/LLM mentions
    const contributingFiles = fileTree.filter(f =>
      f.toLowerCase().includes('contributing')
    );

    for (const cf of contributingFiles) {
      try {
        const content = fs.readFileSync(path.join(localPath, cf), 'utf-8').toLowerCase();
        if (content.includes('no ai') || content.includes('no llm') || content.includes('no chatgpt') ||
            content.includes('no copilot') || content.includes('ai-generated') ||
            content.includes('machine-generated') || content.includes('ai submissions') ||
            content.includes('bot submissions')) {
          signals.push(`CONTRIBUTING.md mentions AI/bot restrictions`);
        }
        if (content.includes('will not accept ai') || content.includes('will reject ai') ||
            content.includes('ban ai') || content.includes('close ai')) {
          signals.push(`CONTRIBUTING.md explicitly bans AI contributions`);
        }
      } catch (err) { /* ignore */ console.error('[repo-cloner] CONTRIBUTING.md read failed:', err); }
    }

    // Check for bot-detection in CI (e.g., checking for AI patterns)
    const ciFiles = fileTree.filter(f =>
      f.includes('.github/workflows/') || f.includes('.gitlab-ci')
    );

    for (const cf of ciFiles.slice(0, 5)) {
      try {
        const content = fs.readFileSync(path.join(localPath, cf), 'utf-8').toLowerCase();
        if (content.includes('ai-detect') || content.includes('gpt-detect') ||
            content.includes('copilot-detect') || content.includes('bot-detect')) {
          signals.push(`CI has AI detection checks`);
        }
      } catch (err) { /* ignore */ console.error('[repo-cloner] CI file read failed:', err); }
    }

    // Check README for AI policy
    const readmePath = path.join(localPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      try {
        const content = fs.readFileSync(readmePath, 'utf-8').toLowerCase();
        if (content.includes('no ai pr') || content.includes('ai pull requests') ||
            content.includes('ai contributions will')) {
          signals.push(`README mentions AI PR policy`);
        }
      } catch (err) { /* ignore */ console.error('[repo-cloner] README.md read failed:', err); }
    }

    return signals;
  }

  private identifyKeyFiles(localPath: string, sourceFiles: string[], configFiles: string[]): string[] {
    const keyFiles: string[] = [];

    // Always include these config files
    const importantConfigs = [
      'package.json', 'pyproject.toml', 'setup.cfg', 'setup.py',
      'Cargo.toml', 'go.mod', 'Gemfile',
      '.editorconfig', '.eslintrc.json', '.eslintrc.js',
      '.prettierrc', '.prettierrc.json',
    ];

    for (const cfg of importantConfigs) {
      if (configFiles.includes(cfg) || sourceFiles.includes(cfg)) {
        keyFiles.push(cfg);
      }
    }

    // Include entry point files
    const entryPoints = [
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
      'index.ts', 'index.js', 'main.py', 'app.py', '__init__.py',
      'src/lib.rs', 'main.go', 'cmd/main.go',
    ];

    for (const ep of entryPoints) {
      if (sourceFiles.includes(ep)) {
        keyFiles.push(ep);
      }
    }

    return keyFiles;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let clonerInstance: RepoCloner | null = null;

export function getRepoCloner(): RepoCloner {
  if (!clonerInstance) {
    clonerInstance = new RepoCloner();
  }
  return clonerInstance;
}

export function resetRepoCloner(): void {
  if (clonerInstance) {
    clonerInstance.cleanup();
  }
  clonerInstance = null;
}
