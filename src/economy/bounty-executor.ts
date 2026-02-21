/**
 * Genesis v16 — Bounty Executor
 *
 * The missing link between bounty discovery and completion.
 * Orchestrates:
 * 1. BountyHunter.scan() — discover bounties
 * 2. BountyCodeGenerator — generate solution using LLM
 * 3. PRPipeline.submitBounty() — submit solution
 * 4. RSI Feedback — learn from outcomes
 *
 * This module enables autonomous revenue generation.
 */

import * as path from 'path';
import { getBountyHunter, Bounty, BountySubmission, BountyHunterStats } from './generators/bounty-hunter.js';
import { PRPipeline, CodeChange, PRSubmission } from './live/pr-pipeline.js';
import { getRevenueTracker } from './live/revenue-tracker.js';
import { getBountyRSIFeedback } from './rsi-feedback.js';
import { getHybridRouter } from '../llm/router.js';
import { getMCPClient } from '../mcp/index.js';
import { validateCode, formatValidationResult, type RepoContext } from './code-validator.js';
// v19.2: Intelligent bounty selection and learning
import {
  classifyBounty,
  scoreBountyIntelligently,
  rankBountiesIntelligently,
  type BountyClassification,
  type IntelligentBountyScore,
} from './bounty-intelligence.js';
import { getBountyLearning, type BountyOutcome } from './bounty-learning.js';
// v19.3: Deep feedback analysis
import { getFeedbackAnalyzer, type PreSubmissionReport, type SkillProfile } from './feedback-analyzer.js';
// v19.4: Multi-model consensus validation
import { getMultiValidator, type ConsensusResult } from './multi-validator.js';
// v19.5: Advanced capabilities
import { getRepoStyleLearner } from './repo-style-learner.js';
import { getTestGenerator } from './test-generator.js';
import { getSmartRetry } from './smart-retry.js';
import { getSuccessPatterns } from './success-patterns.js';
// v19.6: Near-infallibility modules
import { getMaintainerProfiler } from './maintainer-profiler.js';
import { getPRTemplateMatcher } from './pr-template-matcher.js';
import { getCommitOptimizer } from './commit-optimizer.js';
import { getPortfolioTracker } from './portfolio-tracker.js';
// v21.0: Local repo cloning for full codebase analysis
import { getRepoCloner, type ClonedRepo, type RepoAnalysis } from './repo-cloner.js';
// v21.0: Pre-submission test runner
import { getPreSubmitTester } from './pre-submit-tester.js';

// ============================================================================
// Types
// ============================================================================

export interface BountyExecutorConfig {
  githubUsername: string;
  maxConcurrentExecutions: number;
  dryRun: boolean;
  autoSubmit: boolean;
  minConfidenceToSubmit: number; // 0-1
  /** v16.2: Max PR submissions per day (default: 3) */
  maxDailySubmissions: number;
  /** v16.2: Min interval between submissions in ms (default: 60 min) */
  minSubmissionIntervalMs: number;
  /** v16.2: Optional repo allowlist — if set, only submit to these repos */
  repoAllowlist: string[];
}

export interface GeneratedSolution {
  success: boolean;
  changes: CodeChange[];
  description: string;
  confidence: number;
  error?: string;
}

export interface ExecutionResult {
  bountyId: string;
  status: 'success' | 'failed' | 'skipped';
  solution?: GeneratedSolution;
  submission?: PRSubmission;
  error?: string;
  duration: number;
}

// ============================================================================
// Bounty Code Generator
// ============================================================================

export class BountyCodeGenerator {
  private router = getHybridRouter();
  private mcp = getMCPClient();
  private repoCloner = getRepoCloner();
  private lastRepoContext: RepoContext | null = null;
  /** v21.0: Cached clone + analysis for current bounty */
  private lastClonedRepo: ClonedRepo | null = null;
  private lastRepoAnalysis: RepoAnalysis | null = null;

  /**
   * Generate code solution for a bounty using LLM
   */
  async generate(bounty: Bounty): Promise<GeneratedSolution> {
    console.log(`[BountyCodeGen] Generating solution for: ${bounty.title}`);

    try {
      // 1. Gather context about the bounty (now with local clone)
      const context = await this.gatherContext(bounty);

      // v21.0: Check for AI-ban signals before proceeding
      if (this.lastRepoAnalysis?.aiBanSignals && this.lastRepoAnalysis.aiBanSignals.length > 0) {
        console.log(`[BountyCodeGen] ⚠️ AI-BAN SIGNALS DETECTED:`);
        this.lastRepoAnalysis.aiBanSignals.forEach(s => console.log(`  - ${s}`));
        return {
          success: false,
          changes: [],
          description: '',
          confidence: 0,
          error: `Repository has AI-ban signals: ${this.lastRepoAnalysis.aiBanSignals[0]}`,
        };
      }

      // 2. Generate solution with multi-model approach
      const solution = await this.generateWithRetry(bounty, context);

      if (!solution) {
        return {
          success: false,
          changes: [],
          description: '',
          confidence: 0,
          error: 'All models failed to generate valid solution',
        };
      }

      // v21.0: Validate PR size — reject if >200 lines total
      const totalLines = solution.changes.reduce((sum, c) =>
        sum + c.content.split('\n').length, 0);
      if (totalLines > 200) {
        console.log(`[BountyCodeGen] ⚠️ PR too large: ${totalLines} lines (max 200). Trimming or rejecting.`);
        // Don't hard-block, but warn — some bounties legitimately need more
      }

      // 3. Validate solution
      const validation = await this.validateSolution(solution, bounty);

      if (!validation.valid) {
        return {
          success: false,
          changes: [],
          description: '',
          confidence: 0,
          error: validation.error,
        };
      }

      return {
        success: true,
        changes: solution.changes,
        description: solution.description,
        confidence: validation.confidence,
      };
    } catch (error) {
      console.error(`[BountyCodeGen] Error:`, error);
      return {
        success: false,
        changes: [],
        description: '',
        confidence: 0,
        error: String(error),
      };
    } finally {
      // v21.0: Cleanup cloned repo after generation
      if (this.lastClonedRepo?.repoKey) {
        this.repoCloner.cleanupRepo(this.lastClonedRepo.repoKey);
        this.lastClonedRepo = null;
        this.lastRepoAnalysis = null;
      }
    }
  }

  /**
   * v21.0: Completely rewritten to use local git clone for full codebase access.
   * This is THE fundamental fix — every PR rejection traced back to not reading the code.
   */
  private async gatherContext(bounty: Bounty): Promise<string> {
    const parts: string[] = [];

    // Initialize repo context for validation
    this.lastRepoContext = {
      primaryLanguage: 'Unknown',
      languages: [],
      existingFiles: [],
      targetFiles: [],
    };

    parts.push(`# Bounty: ${bounty.title}`);
    parts.push(`Platform: ${bounty.platform}`);
    parts.push(`Category: ${bounty.category}`);
    parts.push(`Difficulty: ${bounty.difficulty}`);
    parts.push(`Reward: $${bounty.reward}`);
    parts.push(`\n## Description:\n${bounty.description}`);

    if (!bounty.sourceMetadata?.org || !bounty.sourceMetadata?.repo) {
      return parts.join('\n');
    }

    const owner = bounty.sourceMetadata.org;
    const repo = bounty.sourceMetadata.repo;

    // ====================================================================
    // STEP 1: Clone the repo locally (shallow, depth=1)
    // ====================================================================
    console.log(`[BountyCodeGen] Step 1: Cloning ${owner}/${repo} locally...`);
    const clonedRepo = await this.repoCloner.clone(owner, repo);
    this.lastClonedRepo = clonedRepo;

    if (!clonedRepo.success) {
      console.warn(`[BountyCodeGen] Clone failed: ${clonedRepo.error}. Falling back to API-only.`);
      return await this.gatherContextFallback(bounty, parts);
    }

    // ====================================================================
    // STEP 2: Analyze the repo structure
    // ====================================================================
    console.log(`[BountyCodeGen] Step 2: Analyzing repo structure...`);
    const analysis = this.repoCloner.analyzeRepo(clonedRepo);
    this.lastRepoAnalysis = analysis;

    this.lastRepoContext.primaryLanguage = analysis.language;
    this.lastRepoContext.languages = analysis.languages;
    this.lastRepoContext.existingFiles = clonedRepo.sourceFiles;

    parts.push(`\n## Repository Analysis:`);
    parts.push(`- Primary Language: ${analysis.language}`);
    parts.push(`- All Languages: ${analysis.languages.join(', ')}`);
    parts.push(`- Default Branch: ${analysis.defaultBranch}`);
    parts.push(`- Total Source Files: ${clonedRepo.sourceFiles.length}`);
    parts.push(`- Test Files: ${clonedRepo.testFiles.length}`);
    parts.push(`- Lines of Code: ~${analysis.totalLinesOfCode}`);
    if (analysis.testFramework) {
      parts.push(`- Test Framework: ${analysis.testFramework.name} (${analysis.testFramework.command})`);
    }
    if (analysis.ciSystem) {
      parts.push(`- CI System: ${analysis.ciSystem.name}`);
    }
    if (analysis.packageManager) {
      parts.push(`- Package Manager: ${analysis.packageManager}`);
    }

    // ====================================================================
    // STEP 3: Full directory tree (truncated to relevant parts)
    // ====================================================================
    parts.push(`\n## Full Repository Structure:`);
    // Show source files organized by directory
    const dirTree = this.buildDirectoryTree(clonedRepo.sourceFiles.concat(clonedRepo.testFiles));
    parts.push(dirTree.slice(0, 5000)); // Cap at 5KB

    // ====================================================================
    // STEP 4: Get issue details and extract target files
    // ====================================================================
    if (bounty.sourceMetadata.issueNumber) {
      try {
        const issue = await this.mcp.call('github', 'get_issue', {
          owner, repo,
          issue_number: bounty.sourceMetadata.issueNumber,
        });
        if (issue) {
          parts.push(`\n## Issue Details:\n${JSON.stringify(issue, null, 2).slice(0, 3000)}`);

          const issueBody = issue.data?.body || '';
          const fileRefs = this.extractFileReferences(issueBody);
          this.lastRepoContext.targetFiles = fileRefs;

          // v21.0: Read target files from LOCAL clone (no API limit!)
          if (fileRefs.length > 0) {
            parts.push(`\n## Target Files (referenced in issue — MUST MODIFY THESE):`);
            const targetContents = this.repoCloner.readFiles(clonedRepo, fileRefs);
            for (const [filePath, content] of targetContents) {
              parts.push(`\n### File: ${filePath}\n\`\`\`\n${content}\n\`\`\``);
            }
          }
        }
      } catch (err) {
        // Issue not available via API
        console.error('[bounty-executor] Issue fetch failed:', err);
      }
    }

    // ====================================================================
    // STEP 5: Read key context files from local clone
    // ====================================================================
    // Read CONTRIBUTING.md
    const contributingContent = this.repoCloner.readFile(clonedRepo, 'CONTRIBUTING.md') ||
      this.repoCloner.readFile(clonedRepo, 'contributing.md') ||
      this.repoCloner.readFile(clonedRepo, '.github/CONTRIBUTING.md');
    if (contributingContent) {
      parts.push(`\n## CONTRIBUTING GUIDE (MUST FOLLOW):\n${contributingContent.slice(0, 5000)}`);
    }

    // Read README for context
    const readmeContent = this.repoCloner.readFile(clonedRepo, 'README.md') ||
      this.repoCloner.readFile(clonedRepo, 'readme.md');
    if (readmeContent) {
      parts.push(`\n## Repository README:\n${readmeContent.slice(0, 3000)}`);
    }

    // Read package config (package.json, pyproject.toml, etc.)
    for (const keyFile of analysis.keyFiles) {
      const content = this.repoCloner.readFile(clonedRepo, keyFile);
      if (content) {
        parts.push(`\n## Config: ${keyFile}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``);
      }
    }

    // ====================================================================
    // STEP 6: Read sibling files and imports of target files
    // ====================================================================
    if (this.lastRepoContext.targetFiles && this.lastRepoContext.targetFiles.length > 0) {
      const targetFile = this.lastRepoContext.targetFiles[0];
      const siblings = this.repoCloner.getSiblingFiles(clonedRepo, targetFile);

      // Read up to 5 sibling files for style/pattern understanding
      const siblingContents = this.repoCloner.readFiles(clonedRepo, siblings.slice(0, 5));
      if (siblingContents.size > 0) {
        parts.push(`\n## Sibling Files (same directory as target — follow their patterns):`);
        for (const [filePath, content] of siblingContents) {
          parts.push(`\n### ${filePath}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``);
        }
      }

      // Read test files related to the target
      const targetBasename = path.basename(targetFile).replace(/\.[^.]+$/, '');
      const relatedTests = clonedRepo.testFiles.filter(t =>
        t.toLowerCase().includes(targetBasename.toLowerCase())
      );
      if (relatedTests.length > 0) {
        const testContents = this.repoCloner.readFiles(clonedRepo, relatedTests.slice(0, 3));
        parts.push(`\n## Related Test Files (MUST understand the test patterns):`);
        for (const [filePath, content] of testContents) {
          parts.push(`\n### ${filePath}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``);
        }
      }
    }

    // ====================================================================
    // STEP 7: Read existing test examples for pattern matching
    // ====================================================================
    if (clonedRepo.testFiles.length > 0 && !parts.some(p => p.includes('Related Test Files'))) {
      // Read a sample test file for framework patterns
      const sampleTest = clonedRepo.testFiles[0];
      const testContent = this.repoCloner.readFile(clonedRepo, sampleTest);
      if (testContent) {
        parts.push(`\n## Sample Test File (follow this pattern):\n### ${sampleTest}\n\`\`\`\n${testContent.slice(0, 3000)}\n\`\`\``);
      }
    }

    // Add hard language constraint at the top
    if (this.lastRepoContext.primaryLanguage !== 'Unknown') {
      parts.unshift(`\n⚠️ CRITICAL: This repository uses ${this.lastRepoContext.primaryLanguage}. ALL code MUST be written in ${this.lastRepoContext.primaryLanguage}. Using any other language will cause immediate rejection.\n`);
    }

    const totalContextSize = parts.join('\n').length;
    console.log(`[BountyCodeGen] Context gathered: ${(totalContextSize / 1024).toFixed(1)}KB from local clone`);

    return parts.join('\n');
  }

  /**
   * v21.0: Fallback to API-only context gathering when clone fails
   */
  private async gatherContextFallback(bounty: Bounty, parts: string[]): Promise<string> {
    const owner = bounty.sourceMetadata!.org!;
    const repo = bounty.sourceMetadata!.repo!;

    // Original API-based context gathering (kept as fallback)
    try {
      const repoInfo = await this.mcp.call('github', 'get_repository', { owner, repo });
      if (repoInfo?.data) {
        const r = repoInfo.data;
        parts.push(`\n## Repository Info:`);
        parts.push(`- Primary Language: ${r.language || 'Unknown'}`);
        parts.push(`- Description: ${r.description || 'N/A'}`);
        this.lastRepoContext!.primaryLanguage = r.language || 'Unknown';
      }
    } catch (err) { /* ignore */ console.error('[bounty-executor] Repo info fetch failed:', err); }

    try {
      const readme = await this.mcp.call('github', 'get_file_contents', { owner, repo, path: 'README.md' });
      if (readme) parts.push(`\n## Repository README:\n${String(readme).slice(0, 2000)}`);
    } catch (err) { /* ignore */ console.error('[bounty-executor] README fetch failed:', err); }

    if (bounty.sourceMetadata?.issueNumber) {
      try {
        const issue = await this.mcp.call('github', 'get_issue', {
          owner, repo, issue_number: bounty.sourceMetadata.issueNumber,
        });
        if (issue) {
          parts.push(`\n## Issue Details:\n${JSON.stringify(issue, null, 2).slice(0, 3000)}`);
          const issueBody = issue.data?.body || '';
          const fileRefs = this.extractFileReferences(issueBody);
          this.lastRepoContext!.targetFiles = fileRefs;

          for (const filePath of fileRefs.slice(0, 8)) {
            try {
              const fileContent = await this.mcp.call('github', 'get_file_contents', {
                owner, repo, path: filePath,
              });
              if (fileContent?.data?.content) {
                const decoded = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
                parts.push(`\n## Existing File: ${filePath}\n\`\`\`\n${decoded.slice(0, 15000)}\n\`\`\``);
                this.lastRepoContext!.existingFiles.push(filePath);
              }
            } catch (err) { /* ignore */ console.error('[bounty-executor] File content fetch failed:', err); }
          }
        }
      } catch (err) { /* ignore */ console.error('[bounty-executor] Issue details fetch failed:', err); }
    }

    try {
      const tree = await this.mcp.call('github', 'get_repository_tree', {
        owner, repo, tree_sha: 'HEAD', recursive: false,
      });
      if (tree?.data?.tree) {
        const files = tree.data.tree.filter((f: any) => f.type === 'blob').map((f: any) => f.path).slice(0, 20);
        parts.push(`\n## Repository Structure (root files):\n${files.join('\n')}`);
        this.lastRepoContext!.existingFiles = files;
      }
    } catch (err) { /* ignore */ console.error('[bounty-executor] Repo tree fetch failed:', err); }

    for (const contributingPath of ['CONTRIBUTING.md', 'contributing.md', '.github/CONTRIBUTING.md']) {
      try {
        const contributing = await this.mcp.call('github', 'get_file_contents', { owner, repo, path: contributingPath });
        if (contributing?.data?.content) {
          const decoded = Buffer.from(contributing.data.content, 'base64').toString('utf-8');
          parts.push(`\n## CONTRIBUTING GUIDE (MUST FOLLOW):\n${decoded.slice(0, 3000)}`);
          break;
        }
      } catch (err) { /* ignore */ console.error('[bounty-executor] CONTRIBUTING.md fetch failed:', err); }
    }

    if (this.lastRepoContext!.primaryLanguage !== 'Unknown') {
      parts.unshift(`\n⚠️ CRITICAL: This repository uses ${this.lastRepoContext!.primaryLanguage}. ALL code MUST be written in ${this.lastRepoContext!.primaryLanguage}. Using any other language will cause immediate rejection.\n`);
    }

    return parts.join('\n');
  }

  /**
   * v21.0: Build a compact directory tree string for context
   */
  private buildDirectoryTree(files: string[]): string {
    const lines: string[] = [];
    const dirs = new Map<string, string[]>();

    for (const file of files) {
      const dir = path.dirname(file);
      if (!dirs.has(dir)) dirs.set(dir, []);
      dirs.get(dir)!.push(path.basename(file));
    }

    const sortedDirs = [...dirs.keys()].sort();
    for (const dir of sortedDirs) {
      const dirFiles = dirs.get(dir)!;
      lines.push(`${dir}/`);
      for (const f of dirFiles.slice(0, 20)) { // Cap per directory
        lines.push(`  ${f}`);
      }
      if (dirFiles.length > 20) {
        lines.push(`  ... and ${dirFiles.length - 20} more`);
      }
    }

    return lines.join('\n');
  }

  /** v21.0: Expose cloned repo for pre-submission test runner */
  getLastClonedRepo(): ClonedRepo | null {
    return this.lastClonedRepo;
  }

  /** v21.0: Expose repo analysis for pre-submission test runner */
  getLastRepoAnalysis(): RepoAnalysis | null {
    return this.lastRepoAnalysis;
  }

  /**
   * v20.2: Improved file reference extraction with broader patterns
   */
  private extractFileReferences(text: string): string[] {
    const patterns = [
      /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})`/g,           // `filename.ext`
      /in\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,        // in filename.ext
      /modify\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,    // modify filename.ext
      /file:\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,     // file: filename.ext
      /update\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,    // update filename.ext
      /fix\s+(?:the\s+)?(?:logic\s+in\s+)?([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,  // fix (the logic in) filename.ext
      /changes?\s+(?:to\s+)?([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,  // change(s) (to) filename.ext
      /edit\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})/gi,      // edit filename.ext
      /\b(src\/[a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})\b/g,     // src/path/file.ext (common pattern)
      /\b(lib\/[a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})\b/g,     // lib/path/file.ext
      /\b(app\/[a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,4})\b/g,     // app/path/file.ext
    ];

    const files = new Set<string>();
    // Common non-file extensions to filter out
    const ignoreExts = new Set(['com', 'org', 'net', 'io', 'dev', 'html', 'md']);

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const file = match[1];
        const ext = file.split('.').pop()?.toLowerCase() || '';
        if (file && !file.includes('..') && file.length < 100 && !ignoreExts.has(ext)) {
          files.add(file);
        }
      }
    }
    return [...files];
  }

  private async generateWithRetry(
    bounty: Bounty,
    context: string,
  ): Promise<{ changes: CodeChange[]; description: string } | null> {
    // v16.2.1: Improved prompt with explicit JSON formatting rules
    const isContentBounty = bounty.category === 'content' ||
                            bounty.title.toLowerCase().includes('proposal') ||
                            bounty.title.toLowerCase().includes('article') ||
                            bounty.title.toLowerCase().includes('documentation');

    // v20.1: Extract repo language for hard constraint in prompt
    const repoLanguage = this.lastRepoContext?.primaryLanguage || 'Unknown';
    const langExtMap: Record<string, string> = {
      'Python': '.py', 'JavaScript': '.js', 'TypeScript': '.ts',
      'Go': '.go', 'Rust': '.rs', 'Ruby': '.rb', 'Java': '.java', 'PHP': '.php',
    };
    const expectedExt = langExtMap[repoLanguage] || '';

    const systemPrompt = `You are an expert completing bounties for open source projects.

CRITICAL RULES:
1. JSON FORMAT - Respond ONLY with valid JSON:
   - No markdown code blocks
   - Escape newlines as \\n, quotes as \\"
   - Max 5000 chars per file

2. LANGUAGE REQUIREMENT (MANDATORY - VIOLATION = INSTANT REJECTION):
   - This repository uses ${repoLanguage}
   - ALL code files MUST use ${repoLanguage} with ${expectedExt || 'the correct'} extension
   - NEVER write JavaScript for a Python repo or vice versa
   - If the context shows existing files, match their language EXACTLY

3. MODIFY EXISTING FILES when the bounty references them:
   - Use operation: "update" to modify existing files
   - Include the COMPLETE file content (not just changes)
   - Read the existing file content provided in context
   - If the issue says "modify X.py", your changes MUST target X.py

4. FOLLOW REPOSITORY STRUCTURE:
   - Place files in the correct directories (check CONTRIBUTING guide and repo structure)
   - If there's a submissions/ folder, put submissions there
   - Match the project's file organization

5. NO PLACEHOLDER CODE:
   - No "TODO", "PLACEHOLDER", "Not implemented"
   - No fake URLs like "example.com"
   - No empty stub functions
   - Every function must have a real implementation

6. MATCH REQUIRED INTERFACES:
   - If the issue specifies method names, use EXACTLY those names
   - If the issue specifies a return type, match it
   - Read the existing code to understand the expected API

${isContentBounty ? `
This is a CONTENT bounty. Create:
- A markdown file with the article/documentation
- Keep formatting simple (no complex tables)
` : `
This is a CODE bounty:
- Write COMPLETE, WORKING code in ${repoLanguage}
- If modifying existing file, include full updated content
- Include proper error handling and imports
- Follow the repository's coding style exactly
`}

JSON FORMAT:
{"changes":[{"path":"path/to/file${expectedExt}","content":"complete file content","operation":"create|update"}],"description":"Brief PR description"}`;

    const userPrompt = `${context}

Generate the solution. Remember: return ONLY valid JSON, escape all newlines as \\n.`;

    // v16.2.1: Try multiple times with increasingly specific prompts
    const attempts = [
      { prompt: userPrompt },
      { prompt: userPrompt + '\n\nIMPORTANT: Your previous response had invalid JSON. Return ONLY a JSON object, no markdown.' },
      { prompt: 'Return a minimal valid JSON solution:\n' + userPrompt },
    ];

    for (let i = 0; i < attempts.length; i++) {
      try {
        console.log(`[BountyCodeGen] Attempt ${i + 1}/${attempts.length}...`);
        const response = await this.router.execute(attempts[i].prompt, systemPrompt);
        const parsed = this.parseResponse(response.content);
        if (parsed) {
          console.log(`[BountyCodeGen] Success on attempt ${i + 1}`);
          return parsed;
        }
      } catch (error) {
        console.error(`[BountyCodeGen] Attempt ${i + 1} failed: ${error}`);
      }
    }

    return null;
  }

  private parseResponse(content: string): { changes: CodeChange[]; description: string } | null {
    // v16.2.2: Robust JSON parsing with multiple cleanup strategies
    const cleanupStrategies = [
      // Strategy 1: Raw extraction
      (s: string) => s,
      // Strategy 2: Remove control characters except newlines in strings
      (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''),
      // Strategy 3: Escape newlines inside JSON string values
      // This handles the common case where LLM outputs literal newlines
      (s: string) => {
        // Find all string values and escape newlines within them
        let inString = false;
        let escaped = false;
        let result = '';
        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          if (escaped) {
            result += c;
            escaped = false;
            continue;
          }
          if (c === '\\') {
            escaped = true;
            result += c;
            continue;
          }
          if (c === '"') {
            inString = !inString;
            result += c;
            continue;
          }
          if (inString && c === '\n') {
            result += '\\n';
          } else if (inString && c === '\r') {
            result += '\\r';
          } else if (inString && c === '\t') {
            result += '\\t';
          } else {
            result += c;
          }
        }
        return result;
      },
      // Strategy 4: More aggressive - replace ALL newlines with \n
      (s: string) => s.replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
    ];

    // Extract JSON from response
    let jsonStr = content;

    // Try to extract from markdown code block first
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      // Fallback: find outermost JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[BountyCodeGen] No JSON found in response');
        console.log('[BountyCodeGen] Response preview:', content.slice(0, 300));
        return null;
      }
      jsonStr = jsonMatch[0];
    }

    // Try each cleanup strategy
    let parsed: any = null;
    for (let i = 0; i < cleanupStrategies.length; i++) {
      try {
        const cleaned = cleanupStrategies[i](jsonStr);
        parsed = JSON.parse(cleaned);
        if (i > 0) {
          console.log(`[BountyCodeGen] JSON parsed with cleanup strategy ${i + 1}`);
        }
        break;
      } catch (error) {
        if (i === cleanupStrategies.length - 1) {
          console.error('[BountyCodeGen] All JSON parse strategies failed:', String(error));
          console.error('[BountyCodeGen] Raw JSON preview:', jsonStr.slice(0, 500));
          return null;
        }
      }
    }

    if (!parsed) return null;

    // Handle case where LLM returns changes as a single object instead of array
    if (parsed.changes && !Array.isArray(parsed.changes)) {
      parsed.changes = [parsed.changes];
    }

    if (!Array.isArray(parsed.changes)) {
      console.log('[BountyCodeGen] Response missing "changes" array');
      return null;
    }

    // Generate description if missing
    if (typeof parsed.description !== 'string') {
      parsed.description = `Automated solution for bounty. Changes: ${parsed.changes.length} file(s).`;
    }

    // Validate each change (with flexible field names)
    const normalizedChanges: CodeChange[] = [];
    for (const change of parsed.changes) {
      const path = change.path || change.file || change.filename;
      const changeContent = change.content || change.code || change.source;
      const operation = change.operation || change.action || change.type || 'create';

      if (!path || !changeContent) {
        console.log('[BountyCodeGen] Change missing path or content, skipping');
        continue;
      }

      normalizedChanges.push({ path, content: changeContent, operation });
    }

    if (normalizedChanges.length === 0) {
      console.log('[BountyCodeGen] No valid changes in response');
      return null;
    }

    return { changes: normalizedChanges, description: parsed.description };
  }

  private async validateSolution(
    solution: { changes: CodeChange[]; description: string },
    bounty: Bounty,
  ): Promise<{ valid: boolean; confidence: number; error?: string }> {
    // Basic validation
    if (solution.changes.length === 0) {
      return { valid: false, confidence: 0, error: 'No changes generated' };
    }

    // v16.2.5: Use code validator for comprehensive checks
    const MIN_VALIDATION_SCORE = 70;
    let worstScore = 100;
    const allIssues: string[] = [];

    for (const change of solution.changes) {
      const result = validateCode(
        change.content,
        change.path,
        this.lastRepoContext || {
          primaryLanguage: 'Unknown',
          languages: [],
          existingFiles: [],
        }
      );

      if (result.score < worstScore) {
        worstScore = result.score;
      }

      // Collect all errors
      for (const issue of result.issues) {
        allIssues.push(`[${change.path}] ${issue.type}: ${issue.message}`);
      }

      // Log validation result
      if (!result.valid) {
        console.log(`[BountyCodeGen] Validation failed for ${change.path}:`);
        console.log(formatValidationResult(result));
      }
    }

    // v20.1: Hard block on language mismatch — never submit wrong-language code
    const hasLanguageError = allIssues.some(i =>
      i.includes('wrong_language') || i.includes('extension_language_mismatch')
    );
    if (hasLanguageError) {
      console.log(`[BountyCodeGen] ❌ HARD BLOCK: Language mismatch detected — will not submit`);
      allIssues.filter(i => i.includes('language')).forEach(i => console.log(`  - ${i}`));
      return {
        valid: false,
        confidence: 0,
        error: `Language mismatch: generated code doesn't match repo language (${this.lastRepoContext?.primaryLanguage || 'unknown'})`,
      };
    }

    // Block submission if score too low
    if (worstScore < MIN_VALIDATION_SCORE) {
      console.log(`[BountyCodeGen] ❌ Code validation failed (score: ${worstScore}/100, min: ${MIN_VALIDATION_SCORE})`);
      console.log(`[BountyCodeGen] Issues found:`);
      allIssues.slice(0, 5).forEach(i => console.log(`  - ${i}`));
      return {
        valid: false,
        confidence: 0,
        error: `Code validation failed (score: ${worstScore}/100). Issues: ${allIssues.slice(0, 3).join('; ')}`,
      };
    }

    console.log(`[BountyCodeGen] ✅ Code validation passed (score: ${worstScore}/100)`);

    // Check description quality
    if (solution.description.length < 50) {
      return { valid: false, confidence: 0, error: 'PR description too short' };
    }

    // v16.2: Estimate confidence based on bounty difficulty
    // Increased thresholds to allow more bounties to be attempted
    const difficultyConfidence: Record<string, number> = {
      easy: 0.9,       // Was 0.8
      medium: 0.75,    // Was 0.6
      hard: 0.6,       // Was 0.4
      critical: 0.45,  // Was 0.2 - now passes 0.3 threshold
    };

    const baseConfidence = difficultyConfidence[bounty.difficulty] || 0.6;

    // Adjust based on category (code bounties have highest confidence)
    const categoryMultiplier: Record<string, number> = {
      code: 1.0,
      content: 0.95,   // Was 0.9
      design: 0.85,    // Was 0.7
      audit: 0.75,     // Was 0.5
      research: 0.8,   // Was 0.6
      translation: 0.9, // Was 0.8
    };

    // v16.2.5: Factor in validation score
    const validationMultiplier = worstScore / 100;
    const confidence = baseConfidence * (categoryMultiplier[bounty.category] || 0.8) * validationMultiplier;

    return { valid: true, confidence };
  }
}

// ============================================================================
// Bounty Executor
// ============================================================================

export class BountyExecutor {
  private hunter = getBountyHunter();
  private codeGenerator = new BountyCodeGenerator();
  private prPipeline: PRPipeline;
  private revenueTracker = getRevenueTracker();
  private rsiFeedback = getBountyRSIFeedback();
  private config: BountyExecutorConfig;
  // v19.2: Intelligent learning system
  private learningEngine = getBountyLearning();
  // v19.3: Deep feedback analysis
  private feedbackAnalyzer = getFeedbackAnalyzer();
  // v19.4: Multi-model consensus validation
  private multiValidator = getMultiValidator();
  // v19.5: Advanced capabilities
  private styleLearner = getRepoStyleLearner();
  private testGenerator = getTestGenerator();
  private smartRetry = getSmartRetry();
  private successPatterns = getSuccessPatterns();
  // v19.6: Near-infallibility modules
  private maintainerProfiler = getMaintainerProfiler();
  private prTemplateMatcher = getPRTemplateMatcher();
  private commitOptimizer = getCommitOptimizer();
  private portfolioTracker = getPortfolioTracker();

  private activeExecutions = new Map<string, Promise<ExecutionResult>>();

  // v16.2.2: Track repos that are blocked (archived, no access, etc.)
  private blockedRepos = new Set<string>();

  // v16.2.3: Per-repo rejection tracking for learning
  private repoRejections = new Map<string, number>();
  private lowPriorityRepos = new Set<string>();

  // v16.2: Rate-limiting and circuit breaker state
  private dailySubmissionCount = 0;
  private dailyCountResetTime = Date.now();
  private lastSubmissionTime = 0;
  private consecutiveRejections = 0;
  private circuitBreakerPauseUntil = 0;

  constructor(config: Partial<BountyExecutorConfig> = {}) {
    this.config = {
      githubUsername: config.githubUsername || process.env.GITHUB_USERNAME || 'genesis-ai',
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 2,
      dryRun: config.dryRun ?? false,
      autoSubmit: config.autoSubmit ?? true,
      minConfidenceToSubmit: config.minConfidenceToSubmit ?? 0.3, // v16.2: Lowered from 0.5 to allow more bounties
      maxDailySubmissions: config.maxDailySubmissions ?? 3,
      minSubmissionIntervalMs: config.minSubmissionIntervalMs ?? 60 * 60 * 1000, // 60 min
      repoAllowlist: config.repoAllowlist ?? [],
    };

    this.prPipeline = new PRPipeline({
      githubUsername: this.config.githubUsername,
      dryRun: this.config.dryRun,
    });

    // v16.2.2: Load blocked repos from disk
    this.loadBlockedRepos();

    // v16.2.3: Load per-repo rejection data
    this.loadRepoRejections();

    // v16.2: Bot identity warning
    const username = this.config.githubUsername;
    if (!username.toLowerCase().includes('bot') && !username.toLowerCase().includes('ai')) {
      console.log(`[BountyExecutor] WARNING: Consider using a username that clearly identifies this as a bot (e.g. ${username}-bot)`);
    }
  }

  // v16.2.2: Persistence for blocked repos
  private loadBlockedRepos(): void {
    try {
      const fs = require('fs');
      const path = '.genesis/blocked-repos.json';
      if (fs.existsSync(path)) {
        const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
        if (Array.isArray(data)) {
          for (const repo of data) {
            this.blockedRepos.add(repo);
          }
          console.log(`[BountyExecutor] Loaded ${this.blockedRepos.size} blocked repos`);
        }
      }
    } catch (e) {
      // Ignore errors - file may not exist
    }
  }

  private saveBlockedRepos(): void {
    try {
      const fs = require('fs');
      const path = '.genesis/blocked-repos.json';
      const dir = require('path').dirname(path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path, JSON.stringify([...this.blockedRepos], null, 2));
    } catch (e) {
      console.error('[BountyExecutor] Failed to save blocked repos:', e);
    }
  }

  // v16.2.3: Per-repo rejection persistence
  private loadRepoRejections(): void {
    try {
      const fs = require('fs');
      const filePath = '.genesis/repo-rejections.json';
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.rejections) {
          for (const [repo, count] of Object.entries(data.rejections)) {
            this.repoRejections.set(repo, count as number);
            if ((count as number) >= 2) {
              this.blockedRepos.add(repo);
            } else if ((count as number) >= 1) {
              this.lowPriorityRepos.add(repo);
            }
          }
          console.log(`[BountyExecutor] Loaded rejections for ${this.repoRejections.size} repos (${this.lowPriorityRepos.size} low-priority, blocked via rejections: ${[...this.repoRejections.entries()].filter(([, c]) => c >= 2).length})`);
        }
      }
    } catch (err) {
      // File may not exist yet
      console.error('[bounty-executor] Repo rejections load failed:', err);
    }
  }

  private saveRepoRejections(): void {
    try {
      const fs = require('fs');
      const filePath = '.genesis/repo-rejections.json';
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const rejections: Record<string, number> = {};
      for (const [repo, count] of this.repoRejections) {
        rejections[repo] = count;
      }
      fs.writeFileSync(filePath, JSON.stringify({ rejections }, null, 2));
    } catch (e) {
      console.error('[BountyExecutor] Failed to save repo rejections:', e);
    }
  }

  /**
   * Execute a single bounty hunting cycle
   */
  async executeLoop(): Promise<ExecutionResult | null> {
    console.log('[BountyExecutor] Starting bounty execution cycle...');

    // v16.2: Reset daily count if new day
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (now - this.dailyCountResetTime > dayMs) {
      this.dailySubmissionCount = 0;
      this.dailyCountResetTime = now;
      console.log('[BountyExecutor] Daily submission count reset');
    }

    // v16.2: Circuit breaker — pause after 3 consecutive rejections
    if (this.circuitBreakerPauseUntil > now) {
      const remainingH = ((this.circuitBreakerPauseUntil - now) / (60 * 60 * 1000)).toFixed(1);
      console.log(`[BountyExecutor] CIRCUIT BREAKER ACTIVE: Paused for ${remainingH}h after ${this.consecutiveRejections} consecutive rejections`);
      return null;
    }

    // v16.2: Daily submission limit
    if (this.dailySubmissionCount >= this.config.maxDailySubmissions) {
      console.log(`[BountyExecutor] Daily submission limit reached: ${this.dailySubmissionCount}/${this.config.maxDailySubmissions}`);
      return null;
    }

    // v16.2: Cooldown between submissions
    const timeSinceLast = now - this.lastSubmissionTime;
    if (this.lastSubmissionTime > 0 && timeSinceLast < this.config.minSubmissionIntervalMs) {
      const remainingMin = ((this.config.minSubmissionIntervalMs - timeSinceLast) / 60000).toFixed(1);
      console.log(`[BountyExecutor] Cooldown active: ${remainingMin}min remaining`);
      return null;
    }

    // 1. Scan all platforms for bounties
    console.log('[BountyExecutor] Step 1: Scanning for bounties...');
    await this.hunter.scan();

    // v16.2.1: Get already-submitted bounty IDs to avoid duplicates
    const submittedBountyIds = new Set(
      this.prPipeline.getAllSubmissions().map(s => s.bountyId)
    );
    console.log(`[BountyExecutor] Already submitted: ${submittedBountyIds.size} bounties`);

    // 2. Select best bounty using intelligent ranking
    console.log('[BountyExecutor] Step 2: Selecting best bounty with AI intelligence...');

    // v19.2: Get all available bounties and rank them intelligently
    const allBounties = this.hunter.getAllBounties() || [];
    const availableBounties = allBounties.filter((b: Bounty) => !submittedBountyIds.has(b.id));

    // v19.2: Use intelligent ranking that considers AI capability, platform fit, and risk
    const rankedBounties = rankBountiesIntelligently(availableBounties);

    // v19.2: Apply learning-based filtering
    const filteredBounties = rankedBounties.filter(scored => {
      const b = scored.bounty;
      const repoKey = `${b.sourceMetadata?.org}/${b.sourceMetadata?.repo}`;

      // Check if repo is blocked by learning engine
      if (b.sourceMetadata?.org && b.sourceMetadata?.repo) {
        if (this.learningEngine.isRepoBlocked(b.sourceMetadata.org, b.sourceMetadata.repo)) {
          console.log(`[BountyExecutor] Skipping ${repoKey}: blocked by learning engine`);
          return false;
        }
      }

      // Check minimum confidence from learning
      const minConf = this.learningEngine.getMinConfidence(b.platform);
      if (scored.classification.aiSuitability < minConf) {
        console.log(`[BountyExecutor] Skipping ${b.title}: AI suitability ${(scored.classification.aiSuitability * 100).toFixed(0)}% below learned threshold ${(minConf * 100).toFixed(0)}%`);
        return false;
      }

      // Check recommendation
      if (scored.classification.recommendation === 'avoid') {
        console.log(`[BountyExecutor] Skipping ${b.title}: recommendation is AVOID`);
        return false;
      }

      return true;
    });

    // Log intelligence reasoning for top candidate
    if (filteredBounties.length > 0) {
      const top = filteredBounties[0];
      console.log(`[BountyExecutor] Top candidate: ${top.bounty.title}`);
      console.log(`  - Type: ${top.classification.type} (confidence: ${(top.classification.confidence * 100).toFixed(0)}%)`);
      console.log(`  - AI Suitability: ${(top.classification.aiSuitability * 100).toFixed(0)}%`);
      console.log(`  - Overall Score: ${top.overallScore.toFixed(1)}/100`);
      console.log(`  - Reasoning: ${top.reasoning.slice(0, 3).join('; ')}`);
    }

    // v16.2.2: Get bounty, filtering out blocked repos
    const prioritizeValue = submittedBountyIds.size >= 3;
    let bounty = filteredBounties.length > 0 ? filteredBounties[0].bounty : this.hunter.selectBest({
      excludeIds: submittedBountyIds,
      prioritizeValue,
    });

    // v16.2.2: Check if selected bounty's repo is blocked and try next ones
    let attempts = 0;
    const maxAttempts = 10;
    while (bounty && attempts < maxAttempts) {
      const repoKey = `${bounty.sourceMetadata?.org}/${bounty.sourceMetadata?.repo}`;
      if (!this.blockedRepos.has(repoKey)) {
        break; // Found a valid bounty
      }
      console.log(`[BountyExecutor] Skipping blocked repo: ${repoKey}`);
      // Add this bounty to excluded and try again
      submittedBountyIds.add(bounty.id);
      bounty = this.hunter.selectBest({
        excludeIds: submittedBountyIds,
        prioritizeValue,
      });
      attempts++;
    }

    if (!bounty) {
      console.log('[BountyExecutor] No suitable bounties found (all filtered or blocked)');
      return null;
    }

    // v16.2.3: If selected bounty is from a low-priority repo, try to find a better alternative
    const selectedRepoKey = `${bounty.sourceMetadata?.org}/${bounty.sourceMetadata?.repo}`;
    if (this.lowPriorityRepos.has(selectedRepoKey)) {
      console.log(`[BountyExecutor] Selected bounty is from low-priority repo: ${selectedRepoKey}`);
      // Try to find an alternative from a non-deprioritized repo
      const tempExclude = new Set(submittedBountyIds);
      tempExclude.add(bounty.id);
      const alternative = this.hunter.selectBest({
        excludeIds: tempExclude,
        prioritizeValue,
      });
      if (alternative) {
        const altRepoKey = `${alternative.sourceMetadata?.org}/${alternative.sourceMetadata?.repo}`;
        if (!this.lowPriorityRepos.has(altRepoKey) && !this.blockedRepos.has(altRepoKey)) {
          console.log(`[BountyExecutor] Found better alternative: ${alternative.title} from ${altRepoKey}`);
          bounty = alternative;
        } else {
          console.log(`[BountyExecutor] No better alternative found, proceeding with low-priority repo`);
        }
      }
    }

    // v20.1: Sanity check bounty value — flag unrealistic amounts
    if (bounty.reward > 10000) {
      console.log(`[BountyExecutor] ⚠️ BOUNTY VALUE SANITY CHECK: $${bounty.reward} seems unrealistic for ${bounty.sourceMetadata?.repo}`);
      console.log(`[BountyExecutor] Skipping — likely a parse error (grant proposals, token amounts, etc.)`);
      return null;
    }

    // v16.2.1: Also check if this exact bounty URL was submitted
    const bountyUrl = bounty.submissionUrl || bounty.sourceMetadata?.githubUrl;
    const alreadySubmittedUrl = this.prPipeline.getAllSubmissions()
      .some(s => s.prUrl?.includes(bounty!.sourceMetadata?.repo || 'NOMATCH'));

    // v16.2: Repo allowlist check
    if (this.config.repoAllowlist.length > 0) {
      const repoKey = `${bounty.sourceMetadata?.org}/${bounty.sourceMetadata?.repo}`;
      if (!this.config.repoAllowlist.includes(repoKey)) {
        console.log(`[BountyExecutor] Repo ${repoKey} not in allowlist, skipping`);
        return null;
      }
    }

    if (alreadySubmittedUrl && submittedBountyIds.size > 0) {
      // v16.2: Lowered per-repo limit from 5 to 2 (be respectful to maintainers)
      const repoSubmissions = this.prPipeline.getAllSubmissions()
        .filter(s => s.repo === `${bounty!.sourceMetadata?.org}/${bounty!.sourceMetadata?.repo}`);
      if (repoSubmissions.length >= 2) {
        console.log(`[BountyExecutor] Per-repo limit reached (2) for ${bounty.sourceMetadata?.repo}, skipping`);
        return null;
      }
    }

    console.log(`[BountyExecutor] Selected: ${bounty.title} ($${bounty.reward})`);

    // 3. Check if we're already executing this bounty
    if (this.activeExecutions.has(bounty.id)) {
      console.log('[BountyExecutor] Already executing this bounty');
      return null;
    }

    // 4. Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      console.log('[BountyExecutor] Max concurrent executions reached');
      return null;
    }

    // 5. Execute the bounty
    const executionPromise = this.executeBounty(bounty);
    this.activeExecutions.set(bounty.id, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this.activeExecutions.delete(bounty.id);
    }
  }

  /**
   * Execute a specific bounty
   */
  async executeBounty(bounty: Bounty): Promise<ExecutionResult> {
    const startTime = Date.now();

    console.log(`[BountyExecutor] Executing bounty: ${bounty.id}`);

    // v19.2: Classify bounty for learning and intelligence
    const classification = classifyBounty(bounty);
    console.log(`[BountyExecutor] Classification: ${classification.type} (AI suitability: ${(classification.aiSuitability * 100).toFixed(0)}%)`);

    try {
      // 1. Claim the bounty
      console.log('[BountyExecutor] Claiming bounty...');
      const claimed = await this.hunter.claim(bounty.id);
      if (!claimed) {
        // v19.2: Record outcome to learning engine
        this.recordLearningOutcome(bounty, classification, 'pr_failed', startTime, 0, 0);
        return {
          bountyId: bounty.id,
          status: 'failed',
          error: 'Failed to claim bounty',
          duration: Date.now() - startTime,
        };
      }

      // 2. Generate solution
      console.log('[BountyExecutor] Generating solution...');

      // v19.5: Get success pattern guidance for code generation
      const patternGuidance = this.successPatterns.generatePatternGuidance(bounty, classification);
      if (patternGuidance) {
        console.log('[BountyExecutor] Applying success patterns...');
      }

      const solution = await this.codeGenerator.generate(bounty);

      if (!solution.success) {
        // Record failure for RSI learning
        // v16.1.2: Fixed hours estimation (was reward/1000, now reward/100 assuming ~$100/hr)
        const estimatedHours = Math.max(0.5, bounty.reward / 100);
        await this.rsiFeedback.recordFailure(
          bounty as any,
          solution.error || 'Code generation failed',
          estimatedHours,
          bounty.reward,
        );

        // v19.2: Record to learning engine
        this.recordLearningOutcome(bounty, classification, 'validation_failed', startTime, 0, 0, solution.error);

        return {
          bountyId: bounty.id,
          status: 'failed',
          solution,
          error: solution.error,
          duration: Date.now() - startTime,
        };
      }

      // 2.5 v19.5: Apply repository style to generated code
      if (bounty.sourceMetadata?.org && bounty.sourceMetadata?.repo) {
        console.log('[BountyExecutor] Applying repository code style...');
        try {
          const styleProfile = await this.styleLearner.learnStyle(
            bounty.sourceMetadata.org,
            bounty.sourceMetadata.repo
          );
          console.log(`[BountyExecutor] Style learned: ${styleProfile.primaryLanguage} (${(styleProfile.style.confidence * 100).toFixed(0)}% confidence)`);

          // Apply style to each file
          for (let i = 0; i < solution.changes.length; i++) {
            const change = solution.changes[i];
            const styledContent = await this.styleLearner.applyStyle(change.content, styleProfile);
            solution.changes[i] = { ...change, content: styledContent };
          }
        } catch (styleError) {
          console.warn('[BountyExecutor] Style application failed, continuing:', styleError);
        }
      }

      // 2.6 v19.5: Generate tests if bounty requires them or repo expects them
      if (bounty.sourceMetadata?.org && bounty.sourceMetadata?.repo) {
        const shouldAddTests = classification.type === 'feature-small' ||
                               classification.type === 'feature-large' ||
                               classification.type === 'bug-fix-complex' ||
                               bounty.description.toLowerCase().includes('test');

        if (shouldAddTests) {
          console.log('[BountyExecutor] Generating tests...');
          try {
            const enhancedChanges = await this.testGenerator.enhanceWithTests(
              solution.changes,
              bounty.sourceMetadata.org,
              bounty.sourceMetadata.repo
            );

            const addedTests = enhancedChanges.length - solution.changes.length;
            if (addedTests > 0) {
              solution.changes = enhancedChanges;
              console.log(`[BountyExecutor] Added ${addedTests} test file(s)`);
            }
          } catch (testError) {
            console.warn('[BountyExecutor] Test generation failed, continuing:', testError);
          }
        }
      }

      // 2.7 v21.0: Run repo's test suite against our changes BEFORE submitting
      if (this.codeGenerator.getLastClonedRepo()?.success && this.codeGenerator.getLastRepoAnalysis()) {
        console.log('[BountyExecutor] Running pre-submission tests on local clone...');
        try {
          const tester = getPreSubmitTester();
          const testResult = await tester.runTests(
            this.codeGenerator.getLastClonedRepo()!,
            this.codeGenerator.getLastRepoAnalysis()!,
            solution.changes,
          );

          if (testResult.couldRun) {
            if (testResult.passed) {
              console.log(`[BountyExecutor] ✅ Tests passed (${testResult.passedTests}/${testResult.totalTests}) in ${testResult.durationMs}ms`);
            } else {
              console.log(`[BountyExecutor] ❌ Tests FAILED (${testResult.failedTests}/${testResult.totalTests} failed)`);
              if (testResult.failures.length > 0) {
                console.log(`[BountyExecutor] Failures:`);
                testResult.failures.slice(0, 3).forEach(f => console.log(`  - ${f}`));
              }

              // Record failure and abort
              this.recordLearningOutcome(
                bounty, classification, 'validation_failed', startTime, 0, solution.confidence,
                `Tests failed: ${testResult.failures[0] || 'unknown failure'}`
              );

              return {
                bountyId: bounty.id,
                status: 'failed',
                solution,
                error: `Pre-submission tests failed: ${testResult.failedTests} test(s) failed`,
                duration: Date.now() - startTime,
              };
            }
          } else {
            console.log(`[BountyExecutor] ⚠️ Could not run tests: ${testResult.skipReason}`);
          }
        } catch (testError) {
          console.warn('[BountyExecutor] Pre-submission test execution failed:', testError);
          // Don't block on test runner failures — continue with submission
        }
      }

      // 3. Check confidence threshold
      if (solution.confidence < this.config.minConfidenceToSubmit) {
        console.log(
          `[BountyExecutor] Confidence ${solution.confidence.toFixed(2)} below threshold ${this.config.minConfidenceToSubmit}`,
        );
        return {
          bountyId: bounty.id,
          status: 'skipped',
          solution,
          error: 'Confidence below threshold',
          duration: Date.now() - startTime,
        };
      }

      // 3.5 v19.3: Run pre-submission checks for near-infallibility
      console.log('[BountyExecutor] Running pre-submission checks...');
      for (const change of solution.changes) {
        const preCheck = await this.feedbackAnalyzer.runPreSubmissionChecks(
          change.content,
          change.path,
          bounty,
          classification
        );

        console.log(`[BountyExecutor] Pre-check ${change.path}: ${preCheck.overallScore.toFixed(0)}/100`);

        if (!preCheck.passed) {
          console.log(`[BountyExecutor] ❌ Pre-submission check FAILED for ${change.path}`);
          console.log(`[BountyExecutor] Blocking issues:`);
          preCheck.blockingIssues.slice(0, 5).forEach(i => console.log(`  - ${i}`));

          // Record failure
          this.recordLearningOutcome(
            bounty,
            classification,
            'validation_failed',
            startTime,
            preCheck.overallScore,
            solution.confidence,
            `Pre-submission failed: ${preCheck.blockingIssues.join('; ')}`
          );

          return {
            bountyId: bounty.id,
            status: 'failed',
            solution,
            error: `Pre-submission check failed: ${preCheck.blockingIssues[0]}`,
            duration: Date.now() - startTime,
          };
        }

        // Log warnings and recommendations
        if (preCheck.warnings.length > 0) {
          console.log(`[BountyExecutor] ⚠️ Warnings for ${change.path}:`);
          preCheck.warnings.slice(0, 3).forEach(w => console.log(`  - ${w}`));
        }
        if (preCheck.recommendations.length > 0) {
          console.log(`[BountyExecutor] 💡 Recommendations:`);
          preCheck.recommendations.slice(0, 3).forEach(r => console.log(`  - ${r}`));
        }
      }
      console.log('[BountyExecutor] ✅ Pre-submission checks passed');

      // 3.6 v19.4: Multi-model consensus validation for near-infallibility
      console.log('[BountyExecutor] Running multi-model validation...');
      const consensus = await this.multiValidator.validate(
        solution.changes,
        bounty,
        classification
      );

      console.log(`[BountyExecutor] Consensus: ${consensus.finalRecommendation} (${(consensus.confidence * 100).toFixed(0)}% confidence)`);

      // Log validation details
      for (const v of consensus.validations) {
        console.log(`  - ${v.model}: ${v.overallScore}/100 (${v.wouldApprove ? 'APPROVE' : 'REJECT'})`);
      }

      // Block if consensus is not to submit
      if (consensus.finalRecommendation === 'reject') {
        console.log(`[BountyExecutor] ❌ Multi-model validation REJECTED`);
        if (consensus.consensusIssues.length > 0) {
          console.log(`[BountyExecutor] Consensus issues:`);
          consensus.consensusIssues.slice(0, 3).forEach(i => console.log(`  - ${i}`));
        }
        if (consensus.requiredFixes.length > 0) {
          console.log(`[BountyExecutor] Required fixes:`);
          consensus.requiredFixes.slice(0, 3).forEach(f => console.log(`  - ${f}`));
        }

        this.recordLearningOutcome(
          bounty,
          classification,
          'validation_failed',
          startTime,
          Math.round(consensus.confidence * 100),
          solution.confidence,
          `Multi-model validation rejected: ${consensus.consensusIssues.join('; ')}`
        );

        return {
          bountyId: bounty.id,
          status: 'failed',
          solution,
          error: `Multi-model validation rejected (${consensus.consensusIssues[0] || 'consensus disagreement'})`,
          duration: Date.now() - startTime,
        };
      }

      // If recommendation is to revise, log warning but continue if confidence is acceptable
      if (consensus.finalRecommendation === 'revise') {
        console.log(`[BountyExecutor] ⚠️ Multi-model suggests revisions, but continuing with submission`);
        if (consensus.requiredFixes.length > 0) {
          console.log(`[BountyExecutor] Suggested fixes (not blocking):`);
          consensus.requiredFixes.slice(0, 3).forEach(f => console.log(`  - ${f}`));
        }
      }

      console.log('[BountyExecutor] ✅ Multi-model validation passed');

      // 3.7 v19.6: Learn maintainer preferences and get PR template
      let prDescription = solution.description;
      if (bounty.sourceMetadata?.org && bounty.sourceMetadata?.repo) {
        const owner = bounty.sourceMetadata.org;
        const repo = bounty.sourceMetadata.repo;
        const repoKey = `${owner}/${repo}`;

        // Profile repo maintainers
        console.log('[BountyExecutor] Profiling maintainers...');
        try {
          // Get a sample maintainer profile for the repo
          const maintainerProfile = await this.maintainerProfiler.getProfile(owner, repoKey);
          console.log(`[BountyExecutor] Maintainer profile: ${maintainerProfile.username} - ${maintainerProfile.reviewStyle.strictness} strictness`);

          // Check for deal-breakers we should avoid
          if (maintainerProfile.reviewStyle.dealBreakers.length > 0) {
            console.log(`[BountyExecutor] ⚠️ Deal-breakers: ${maintainerProfile.reviewStyle.dealBreakers.slice(0, 3).join(', ')}`);
          }

          // Log submission guidance
          const guidance = this.maintainerProfiler.generateSubmissionGuidance(maintainerProfile);
          console.log(`[BountyExecutor] Guidance: ${maintainerProfile.reviewStyle.focusAreas.slice(0, 2).join(', ') || 'general quality'}`);
        } catch (profileError) {
          console.warn('[BountyExecutor] Maintainer profiling failed:', profileError);
        }

        // Get and match PR template
        console.log('[BountyExecutor] Matching PR template...');
        try {
          const template = await this.prTemplateMatcher.getTemplate(owner, repo);
          if (template) {
            console.log(`[BountyExecutor] Found PR template with ${template.sections.length} sections`);
            const filledDescription = await this.prTemplateMatcher.generateDescription(
              template,
              bounty,
              solution.changes,
              solution.description,
              bounty.sourceMetadata.issueNumber
            );
            prDescription = filledDescription.body;
            console.log(`[BountyExecutor] Generated compliant PR description (${(filledDescription.confidence * 100).toFixed(0)}% confidence)`);
          }
        } catch (templateError) {
          console.warn('[BountyExecutor] PR template matching failed:', templateError);
        }

        // Optimize commit message
        console.log('[BountyExecutor] Optimizing commit message...');
        try {
          const commitStyle = await this.commitOptimizer.learnStyle(owner, repo);
          console.log(`[BountyExecutor] Commit style: ${commitStyle.format.type} format (${(commitStyle.confidence * 100).toFixed(0)}% confidence)`);
          // Commit message optimization would be passed to PRPipeline
        } catch (commitError) {
          console.warn('[BountyExecutor] Commit optimization failed:', commitError);
        }
      }

      // 3.8 v19.6: Record bounty start in portfolio
      const portfolioRecordId = this.portfolioTracker.recordBountyStart(bounty, classification);
      console.log(`[BountyExecutor] Portfolio record: ${portfolioRecordId}`);

      // 4. Submit PR (if autoSubmit enabled and not dry run)
      if (this.config.autoSubmit && !this.config.dryRun) {
        console.log('[BountyExecutor] Submitting PR...');
        const submission = await this.prPipeline.submitBounty(
          bounty,
          solution.changes,
          prDescription, // v19.6: Use template-matched description
          {
            confidence: solution.confidence,
            validationScore: Math.round(solution.confidence * 100),
            dailyCount: this.dailySubmissionCount + 1,
            maxDaily: this.config.maxDailySubmissions,
          },
        );

        if (submission) {
          // Revenue is recorded only at PR merge by PRPipeline.checkPRStatus()
          // to avoid double-counting (submission != accepted)
          console.log(`[BountyExecutor] PR submitted: ${submission.prUrl}`);

          // v16.2: Update rate-limiting counters
          this.dailySubmissionCount++;
          this.lastSubmissionTime = Date.now();
          this.consecutiveRejections = 0; // Reset on successful submission
          console.log(`[BountyExecutor] Submissions today: ${this.dailySubmissionCount}/${this.config.maxDailySubmissions}`);

          // v19.2: Record submission to learning (final outcome recorded when PR status checked)
          this.recordLearningOutcome(
            bounty,
            classification,
            'success', // Provisional - will be updated when PR is merged/rejected
            startTime,
            Math.round(solution.confidence * 100),
            solution.confidence,
            undefined,
            submission.prUrl
          );

          return {
            bountyId: bounty.id,
            status: 'success',
            solution,
            submission,
            duration: Date.now() - startTime,
          };
        } else {
          // v16.2.2: Check if this was due to blocked repo (error from pipeline)
          const repoKey = `${bounty.sourceMetadata?.org}/${bounty.sourceMetadata?.repo}`;
          const lastError = this.prPipeline.getLastError?.() || '';
          if (lastError.includes('archived') || lastError.includes('read-only') ||
              lastError.includes('Repository not found') || lastError.includes('403')) {
            console.log(`[BountyExecutor] Blocking repo ${repoKey}: ${lastError}`);
            this.blockedRepos.add(repoKey);
            this.saveBlockedRepos();
          }

          // v19.2: Record PR submission failure
          this.recordLearningOutcome(bounty, classification, 'pr_failed', startTime, 0, solution.confidence, 'PR submission failed');

          return {
            bountyId: bounty.id,
            status: 'failed',
            solution,
            error: 'PR submission failed',
            duration: Date.now() - startTime,
          };
        }
      }

      // Dry run or no auto-submit
      return {
        bountyId: bounty.id,
        status: 'success',
        solution,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[BountyExecutor] Error executing bounty:`, error);

      // v16.1.2: Fixed hours estimation (was reward/1000, now reward/100 assuming ~$100/hr)
      const estimatedHours = Math.max(0.5, bounty.reward / 100);
      await this.rsiFeedback.recordFailure(
        bounty as any,
        String(error),
        estimatedHours,
        bounty.reward,
      );

      // v19.2: Record to learning engine
      this.recordLearningOutcome(bounty, classification, 'pr_failed', startTime, 0, 0, String(error));

      return {
        bountyId: bounty.id,
        status: 'failed',
        error: String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    activeExecutions: number;
    hunterStats: BountyHunterStats;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      hunterStats: this.hunter.getStats(),
    };
  }

  /**
   * v16.2: Get submission stats for monitoring and transparency
   */
  getSubmissionStats(): {
    dailySubmissionCount: number;
    maxDailySubmissions: number;
    lastSubmissionTime: number;
    consecutiveRejections: number;
    circuitBreakerActive: boolean;
    circuitBreakerPauseUntil: number;
    repoAllowlist: string[];
    minSubmissionIntervalMs: number;
  } {
    return {
      dailySubmissionCount: this.dailySubmissionCount,
      maxDailySubmissions: this.config.maxDailySubmissions,
      lastSubmissionTime: this.lastSubmissionTime,
      consecutiveRejections: this.consecutiveRejections,
      circuitBreakerActive: this.circuitBreakerPauseUntil > Date.now(),
      circuitBreakerPauseUntil: this.circuitBreakerPauseUntil,
      repoAllowlist: this.config.repoAllowlist,
      minSubmissionIntervalMs: this.config.minSubmissionIntervalMs,
    };
  }

  /**
   * v16.2.3: Get PR pipeline for external access
   */
  getPRPipeline(): PRPipeline {
    return this.prPipeline;
  }

  /**
   * v19.3: Start email integration for real-time feedback
   */
  startEmailIntegration(): void {
    this.feedbackAnalyzer.startEmailIntegration();
    console.log('[BountyExecutor] Email integration started - monitoring for PR updates');
  }

  /**
   * v19.3: Get improvement report
   */
  getImprovementReport(): string {
    return this.feedbackAnalyzer.generateImprovementReport();
  }

  /**
   * v19.3: Get weak skill areas
   */
  getWeakSkills(): SkillProfile[] {
    return this.feedbackAnalyzer.getWeakSkills();
  }

  /**
   * v19.6: Get portfolio analytics
   */
  getPortfolioStats() {
    return this.portfolioTracker.getStats();
  }

  /**
   * v19.6: Get portfolio report
   */
  getPortfolioReport(): string {
    return this.portfolioTracker.generateReport();
  }

  /**
   * v19.6: Set portfolio goals
   */
  setPortfolioGoal(type: 'revenue' | 'bounties' | 'streak' | 'reputation', target: number, deadline?: Date): string {
    return this.portfolioTracker.setGoal(type, target, deadline);
  }

  /**
   * v19.2: Record outcome to learning engine for causal analysis
   */
  private recordLearningOutcome(
    bounty: Bounty,
    classification: BountyClassification,
    outcome: BountyOutcome['outcome'],
    startTime: number,
    validationScore: number,
    confidence: number,
    rejectionReason?: string,
    prUrl?: string
  ): void {
    try {
      this.learningEngine.recordOutcome({
        bountyId: bounty.id,
        bounty,
        classification,
        outcome,
        prUrl,
        rejectionReason,
        duration: Date.now() - startTime,
        validationScore,
        confidenceAtSubmit: confidence,
        timestamp: new Date(),
      });
    } catch (error) {
      console.warn('[BountyExecutor] Failed to record learning outcome:', error);
    }
  }

  /**
   * v16.2.3: Check all submitted PRs for merges and record revenue
   * Should be called periodically to capture revenue from merged PRs
   */
  async checkAndRecordRevenue(): Promise<{ merged: number; revenue: number }> {
    console.log('[BountyExecutor] Checking PR statuses for merged bounties...');

    const submissions = this.prPipeline.getAllSubmissions();
    let mergedCount = 0;
    let totalRevenue = 0;

    for (const sub of submissions) {
      if (sub.status === 'merged' && sub.revenueRecorded) continue; // Already recorded
      if (sub.status === 'closed') continue; // Rejected, skip

      try {
        const updated = await this.prPipeline.checkPRStatus(sub.bountyId);
        if (updated && updated.status === 'merged' && updated.revenueRecorded) {
          mergedCount++;
          totalRevenue += updated.bountyValue;
          // v16.2: Reset rejection counter on merge (positive signal)
          this.consecutiveRejections = 0;

          // v19.5: Learn from success - extract patterns
          try {
            console.log(`[BountyExecutor] 🎉 PR merged! Learning from success...`);
            // Get all bounties and find the matching one
            const allBounties = this.hunter.getAllBounties();
            const bounty = allBounties.find((b: Bounty) => b.id === updated.bountyId);
            if (bounty) {
              const classification = classifyBounty(bounty);
              // Get changes from somewhere (would need to store or re-fetch)
              // For now, just record the success with empty changes
              await this.successPatterns.learnFromSuccess(
                updated,
                [], // Would need stored changes
                bounty,
                classification
              );

              // v19.6: Record completion in portfolio tracker
              this.portfolioTracker.recordOutcomeByBountyId(
                updated.bountyId,
                'paid',
                updated.bountyValue
              );
              console.log(`[BountyExecutor] Portfolio updated: ${(this.portfolioTracker.getStats().successRate * 100).toFixed(0)}% success rate`);
            }
          } catch (learnError) {
            console.warn('[BountyExecutor] Failed to learn from success:', learnError);
          }
        } else if (updated && updated.status === 'closed') {
          // v16.2: Track consecutive rejections for circuit breaker
          this.consecutiveRejections++;
          console.log(`[BountyExecutor] PR rejected: ${sub.prUrl} (consecutive rejections: ${this.consecutiveRejections})`);

          // v19.6: Record failure in portfolio tracker
          try {
            this.portfolioTracker.recordOutcomeByBountyId(
              updated.bountyId,
              'rejected',
              0
            );
          } catch (portfolioErr) {
            console.warn('[BountyExecutor] Failed to record rejection in portfolio:', portfolioErr);
          }

          // v19.3: Deep analyze rejection feedback
          try {
            console.log(`[BountyExecutor] Analyzing rejection feedback for ${sub.prUrl}...`);
            const analysis = await this.feedbackAnalyzer.analyzePRFeedback(updated);
            console.log(`[BountyExecutor] Analysis: ${analysis.overallSentiment} sentiment, ${analysis.issues.length} issues`);
            if (analysis.issues.length > 0) {
              console.log(`[BountyExecutor] Top issues:`);
              analysis.issues.slice(0, 3).forEach(i => console.log(`  - [${i.severity}] ${i.type}: ${i.description.slice(0, 60)}`));
            }
            if (analysis.suggestedImprovements.length > 0) {
              console.log(`[BountyExecutor] Improvements needed:`);
              analysis.suggestedImprovements.slice(0, 3).forEach(s => console.log(`  - ${s}`));
            }
            if (analysis.skillGaps.length > 0) {
              console.log(`[BountyExecutor] Skill gaps identified: ${analysis.skillGaps.join(', ')}`);
            }

            // v19.5: Check if smart retry is possible
            const retryAnalysis = await this.smartRetry.analyzeForRetry(updated, []);
            if (retryAnalysis.canRetry) {
              console.log(`[BountyExecutor] 🔄 Smart retry possible: ${retryAnalysis.reason}`);
              console.log(`[BountyExecutor] Retry attempt: ${retryAnalysis.attemptNumber}`);
              console.log(`[BountyExecutor] Strategy: ${retryAnalysis.strategy?.name || 'none'}`);
            } else {
              console.log(`[BountyExecutor] ❌ No retry possible: ${retryAnalysis.reason}`);
            }
          } catch (analysisErr) {
            console.warn(`[BountyExecutor] Failed to analyze feedback:`, analysisErr);
          }

          if (this.consecutiveRejections >= 3) {
            this.circuitBreakerPauseUntil = Date.now() + 24 * 60 * 60 * 1000; // 24h pause
            console.log(`[BountyExecutor] CIRCUIT BREAKER TRIGGERED: 3 consecutive rejections. Pausing for 24h.`);
            // v19.3: Generate improvement report on circuit breaker
            console.log(`\n${this.feedbackAnalyzer.generateImprovementReport()}\n`);
          }

          // v16.2.3: Per-repo rejection tracking
          const rejectedRepo = sub.repo;
          if (rejectedRepo) {
            const prevCount = this.repoRejections.get(rejectedRepo) || 0;
            const newCount = prevCount + 1;
            this.repoRejections.set(rejectedRepo, newCount);

            if (newCount >= 2) {
              this.blockedRepos.add(rejectedRepo);
              this.lowPriorityRepos.delete(rejectedRepo);
              this.saveBlockedRepos();
              console.log(`[BountyExecutor] Repo ${rejectedRepo} BLOCKED after ${newCount} rejections`);
            } else if (newCount >= 1) {
              this.lowPriorityRepos.add(rejectedRepo);
              console.log(`[BountyExecutor] Repo ${rejectedRepo} deprioritized after ${newCount} rejection(s)`);
            }
            this.saveRepoRejections();
          }
        }
      } catch (e) {
        console.warn(`[BountyExecutor] Failed to check PR ${sub.prUrl}:`, e);
      }
    }

    if (mergedCount > 0) {
      console.log(`[BountyExecutor] Found ${mergedCount} merged PRs, $${totalRevenue} revenue recorded`);
    }

    return { merged: mergedCount, revenue: totalRevenue };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let bountyExecutorInstance: BountyExecutor | null = null;

export function getBountyExecutor(config?: Partial<BountyExecutorConfig>): BountyExecutor {
  if (!bountyExecutorInstance) {
    bountyExecutorInstance = new BountyExecutor(config);
  }
  return bountyExecutorInstance;
}

export function resetBountyExecutor(): void {
  bountyExecutorInstance = null;
}
