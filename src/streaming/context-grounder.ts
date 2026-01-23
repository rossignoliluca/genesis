import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface GroundingContext {
  project?: ProjectContext;
  git?: GitContext;
  environment?: EnvironmentContext;
  recentErrors?: ErrorContext[];
  memory?: MemoryContext;
}

export interface ProjectContext {
  name: string;
  type: string;           // 'nodejs' | 'python' | 'rust' | etc
  rootPath: string;
  mainFiles: string[];    // Key files detected
  packageManager?: string;
  framework?: string;     // 'express' | 'nextjs' | 'django' | etc
}

export interface GitContext {
  branch: string;
  lastCommit: string;
  uncommittedFiles: string[];
  recentCommits: Array<{hash: string, message: string, ago: string}>;
}

export interface EnvironmentContext {
  nodeVersion?: string;
  platform: string;
  cwd: string;
  envHints: string[];  // Non-sensitive env var names that are set
}

export interface ErrorContext {
  message: string;
  file?: string;
  line?: number;
  timestamp: number;
}

export interface MemoryContext {
  recentTopics: string[];
  userPreferences: Record<string, string>;
  projectKnowledge: string[];
}

export class ContextGrounder {
  private cache: GroundingContext | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 30_000;  // 30s cache

  /**
   * Gather all context (cached for 30s)
   */
  async gather(): Promise<GroundingContext> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    const context: GroundingContext = {
      project: await this.detectProject(),
      git: await this.getGitContext(),
      environment: this.getEnvironment(),
    };

    this.cache = context;
    this.cacheExpiry = now + this.CACHE_TTL;
    return context;
  }

  /**
   * Format context as a concise system prompt section
   */
  formatForPrompt(ctx: GroundingContext): string {
    const lines: string[] = ['[Context]'];

    // Project info
    if (ctx.project) {
      const { name, type, packageManager, framework } = ctx.project;
      let projectLine = `Project: ${name}`;

      if (framework) {
        projectLine += ` (${type}/${framework}`;
      } else {
        projectLine += ` (${type}`;
      }

      if (packageManager) {
        projectLine += `, ${packageManager}`;
      }
      projectLine += ')';

      lines.push(projectLine);

      if (ctx.project.mainFiles.length > 0) {
        lines.push(`Main: ${ctx.project.mainFiles.slice(0, 3).join(', ')}`);
      }
    }

    // Git info
    if (ctx.git) {
      const uncommitted = ctx.git.uncommittedFiles.length;
      let gitLine = `Branch: ${ctx.git.branch}`;
      if (uncommitted > 0) {
        gitLine += ` (+${uncommitted} uncommitted)`;
      }
      lines.push(gitLine);

      if (ctx.git.recentCommits.length > 0) {
        const recent = ctx.git.recentCommits.slice(0, 2)
          .map(c => `"${c.message}"`)
          .join(' → ');
        lines.push(`Recent: ${recent}`);
      }
    }

    // Environment info
    if (ctx.environment) {
      const envParts: string[] = [];
      envParts.push(ctx.environment.cwd);

      if (ctx.environment.nodeVersion) {
        envParts.push(`Node: ${ctx.environment.nodeVersion}`);
      }

      envParts.push(this.getPlatformName(ctx.environment.platform));
      lines.push(`CWD: ${envParts.join(', ')}`);
    }

    // Recent errors
    if (ctx.recentErrors && ctx.recentErrors.length > 0) {
      const errorSummary = ctx.recentErrors
        .slice(0, 2)
        .map(e => e.file ? `${e.file}: ${e.message}` : e.message)
        .join('; ');
      lines.push(`Recent errors: ${errorSummary}`);
    }

    // Memory context
    if (ctx.memory?.recentTopics && ctx.memory.recentTopics.length > 0) {
      lines.push(`Topics: ${ctx.memory.recentTopics.slice(0, 3).join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Detect project type from cwd
   */
  private async detectProject(): Promise<ProjectContext | undefined> {
    const cwd = process.cwd();

    // Check for package.json (Node.js)
    const packageJsonPath = join(cwd, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Detect framework
        let framework: string | undefined;
        if (deps['next']) framework = 'nextjs';
        else if (deps['express']) framework = 'express';
        else if (deps['@nestjs/core']) framework = 'nestjs';
        else if (deps['react']) framework = 'react';
        else if (deps['vue']) framework = 'vue';
        else if (deps['svelte']) framework = 'svelte';

        // Detect package manager
        let packageManager: string | undefined;
        if (existsSync(join(cwd, 'package-lock.json'))) packageManager = 'npm';
        else if (existsSync(join(cwd, 'yarn.lock'))) packageManager = 'yarn';
        else if (existsSync(join(cwd, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
        else if (existsSync(join(cwd, 'bun.lockb'))) packageManager = 'bun';

        // Find main files
        const mainFiles = this.findMainFiles(cwd, [
          'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
          'index.ts', 'index.js', 'main.ts', 'main.js',
          'src/app.ts', 'src/app.js', 'app.ts', 'app.js'
        ]);

        return {
          name: pkg.name || 'nodejs-project',
          type: 'nodejs',
          rootPath: cwd,
          mainFiles,
          packageManager,
          framework,
        };
      } catch (err) {
        // Invalid package.json, continue
      }
    }

    // Check for Python
    if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'pyproject.toml'))) {
      const mainFiles = this.findMainFiles(cwd, [
        'main.py', 'app.py', 'src/main.py', 'src/app.py',
        'manage.py', '__main__.py'
      ]);

      let framework: string | undefined;
      if (existsSync(join(cwd, 'manage.py'))) framework = 'django';
      else if (mainFiles.some(f => f.includes('app.py'))) framework = 'flask';

      return {
        name: cwd.split('/').pop() || 'python-project',
        type: 'python',
        rootPath: cwd,
        mainFiles,
        framework,
      };
    }

    // Check for Rust
    if (existsSync(join(cwd, 'Cargo.toml'))) {
      const mainFiles = this.findMainFiles(cwd, [
        'src/main.rs', 'src/lib.rs', 'main.rs'
      ]);

      return {
        name: cwd.split('/').pop() || 'rust-project',
        type: 'rust',
        rootPath: cwd,
        mainFiles,
        packageManager: 'cargo',
      };
    }

    // Check for Go
    if (existsSync(join(cwd, 'go.mod'))) {
      const mainFiles = this.findMainFiles(cwd, [
        'main.go', 'cmd/main.go', 'cmd/server/main.go'
      ]);

      return {
        name: cwd.split('/').pop() || 'go-project',
        type: 'go',
        rootPath: cwd,
        mainFiles,
        packageManager: 'go',
      };
    }

    // Check for Java
    if (existsSync(join(cwd, 'pom.xml'))) {
      return {
        name: cwd.split('/').pop() || 'java-project',
        type: 'java',
        rootPath: cwd,
        mainFiles: [],
        packageManager: 'maven',
      };
    }

    if (existsSync(join(cwd, 'build.gradle')) || existsSync(join(cwd, 'build.gradle.kts'))) {
      return {
        name: cwd.split('/').pop() || 'java-project',
        type: 'java',
        rootPath: cwd,
        mainFiles: [],
        packageManager: 'gradle',
      };
    }

    return undefined;
  }

  /**
   * Get git status
   */
  private async getGitContext(): Promise<GitContext | undefined> {
    try {
      // Check if in a git repository
      execSync('git rev-parse --git-dir', {
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      // Get current branch
      const branch = execSync('git branch --show-current', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      // Get last commit message
      const lastCommit = execSync('git log -1 --oneline', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      // Get recent commits
      const logOutput = execSync('git log --oneline -3 --format=%h|%s|%ar', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      const recentCommits = logOutput.split('\n').map(line => {
        const [hash, message, ago] = line.split('|');
        return { hash, message, ago };
      });

      // Get uncommitted files
      const statusOutput = execSync('git status --porcelain', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      const uncommittedFiles = statusOutput
        ? statusOutput.split('\n').map(line => line.substring(3))
        : [];

      return {
        branch,
        lastCommit,
        uncommittedFiles,
        recentCommits,
      };
    } catch (err) {
      // Not a git repository or git not available
      return undefined;
    }
  }

  /**
   * Get environment info
   */
  private getEnvironment(): EnvironmentContext {
    let nodeVersion: string | undefined;
    try {
      nodeVersion = execSync('node --version', {
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();
    } catch (err) {
      // Node not available
    }

    // Get non-sensitive env var names
    const envHints: string[] = [];
    const interestingVars = ['NODE_ENV', 'ENVIRONMENT', 'DEBUG', 'CI', 'TERM'];
    for (const varName of interestingVars) {
      if (process.env[varName]) {
        envHints.push(varName);
      }
    }

    return {
      nodeVersion,
      platform: process.platform,
      cwd: process.cwd(),
      envHints,
    };
  }

  /**
   * Invalidate cache
   */
  invalidate(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Find main files from a list of candidates
   */
  private findMainFiles(root: string, candidates: string[]): string[] {
    const found: string[] = [];
    for (const candidate of candidates) {
      if (existsSync(join(root, candidate))) {
        found.push(candidate);
      }
    }
    return found;
  }

  /**
   * Get human-readable platform name
   */
  private getPlatformName(platform: string): string {
    switch (platform) {
      case 'darwin': return 'macOS';
      case 'win32': return 'Windows';
      case 'linux': return 'Linux';
      default: return platform;
    }
  }
}
