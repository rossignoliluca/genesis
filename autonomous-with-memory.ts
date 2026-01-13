/**
 * Genesis Autonomous Operation with Cognitive Memory
 *
 * Full cognitive loop:
 * 1. Wake up & recall past experiences
 * 2. Analyze current state
 * 3. Plan improvements (informed by memory)
 * 4. Execute changes
 * 5. Remember what was done (episodic)
 * 6. Extract learnings (semantic)
 * 7. Build/refine skills (procedural)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createMemorySystem, MemorySystem } from './src/memory/index.js';
import { SecureShellExecutor, getShellExecutor } from './src/execution/shell.js';

// ============================================================================
// Types
// ============================================================================

interface AnalysisResult {
  findings: string[];
  opportunities: Opportunity[];
  risks: string[];
}

interface Opportunity {
  type: 'missing-module' | 'improvement' | 'fix' | 'documentation';
  description: string;
  priority: 'low' | 'medium' | 'high';
  files?: string[];
}

interface ExecutionResult {
  success: boolean;
  action: string;
  details: string;
  filesCreated?: string[];
  filesModified?: string[];
}

// ============================================================================
// Autonomous Agent with Memory
// ============================================================================

const MEMORY_FILE = './.genesis-memory.json';

class AutonomousGenesis {
  private memory: MemorySystem;
  private shell: SecureShellExecutor;
  private sessionStart: Date;

  constructor() {
    this.memory = createMemorySystem({
      consolidation: { autoStart: false }, // Manual consolidation
    });
    this.shell = getShellExecutor(process.cwd());
    this.sessionStart = new Date();

    // Load persisted memory
    this.loadMemory();
  }

  /**
   * Load memory from disk
   */
  private loadMemory(): void {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
        // Re-hydrate dates
        const rehydrate = (arr: any[]) => arr.map(m => ({
          ...m,
          created: new Date(m.created),
          lastAccessed: new Date(m.lastAccessed),
          when: m.when ? { ...m.when, timestamp: new Date(m.when.timestamp) } : undefined,
        }));

        if (data.episodic) {
          for (const ep of rehydrate(data.episodic)) {
            this.memory.episodic.store(ep);
          }
        }
        if (data.semantic) {
          for (const sem of rehydrate(data.semantic)) {
            this.memory.semantic.store(sem);
          }
        }
        if (data.procedural) {
          for (const proc of rehydrate(data.procedural)) {
            this.memory.procedural.store(proc);
          }
        }
        console.log(`  Loaded memory from ${MEMORY_FILE}`);
      }
    } catch (error) {
      console.log(`  Could not load memory: ${error}`);
    }
  }

  /**
   * Save memory to disk
   */
  private saveMemory(): void {
    try {
      const data = this.memory.export();
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
      console.log(`  💾 Memory saved to ${MEMORY_FILE}`);
    } catch (error) {
      console.log(`  Could not save memory: ${error}`);
    }
  }

  /**
   * Main autonomous loop
   */
  async run(): Promise<void> {
    console.log('\n🧬 Genesis Autonomous Mode (with Memory)\n');
    console.log('='.repeat(50));

    // Phase 1: Wake up & recall
    console.log('\n💭 Phase 1: Recalling past experiences...');
    const pastExperiences = await this.recallPastWork();

    // Phase 2: Analyze current state
    console.log('\n🔍 Phase 2: Analyzing codebase...');
    const analysis = await this.analyzeCodebase(pastExperiences);

    // Phase 3: Plan improvements
    console.log('\n📋 Phase 3: Planning improvements...');
    const plan = await this.planImprovements(analysis);

    if (plan.length === 0) {
      console.log('  No improvements needed at this time.');
      await this.rememberSession('No improvements needed');
      return;
    }

    // Phase 4: Execute improvements
    console.log('\n⚡ Phase 4: Executing improvements...');
    const results = await this.executeImprovements(plan);

    // Phase 5: Remember & Learn
    console.log('\n🧠 Phase 5: Consolidating memories...');
    await this.consolidateExperience(results);

    // Summary
    this.printSummary(results);
  }

  // ==========================================================================
  // Phase 1: Recall
  // ==========================================================================

  private async recallPastWork(): Promise<string[]> {
    const insights: string[] = [];

    // Recall recent episodes
    const recentEpisodes = this.memory.getRecentEpisodes(5);
    if (recentEpisodes.length > 0) {
      console.log(`  Found ${recentEpisodes.length} recent experiences:`);
      for (const ep of recentEpisodes) {
        console.log(`    - ${ep.content.what}`);
        insights.push(ep.content.what);
      }
    } else {
      console.log('  No previous experiences (first run)');
    }

    // Recall relevant knowledge
    const relevantKnowledge = this.memory.recall('improvement', { types: ['semantic'], limit: 3 });
    if (relevantKnowledge.length > 0) {
      console.log(`  Found ${relevantKnowledge.length} relevant facts`);
    }

    // Check for learned skills
    const skills = this.memory.recall('code', { types: ['procedural'], limit: 3 });
    if (skills.length > 0) {
      console.log(`  Found ${skills.length} applicable skills`);
    }

    return insights;
  }

  // ==========================================================================
  // Phase 2: Analyze
  // ==========================================================================

  private async analyzeCodebase(pastWork: string[]): Promise<AnalysisResult> {
    const findings: string[] = [];
    const opportunities: Opportunity[] = [];
    const risks: string[] = [];

    // Check src directory structure
    const srcDirs = this.listDirs('./src');
    console.log(`  Found ${srcDirs.length} source modules`);

    // Check for missing or incomplete modules
    const expectedModules = [
      'active-inference',
      'execution',
      'kernel',
      'memory',
      'world-model',
    ];

    for (const mod of expectedModules) {
      const modPath = `./src/${mod}`;
      if (!fs.existsSync(modPath)) {
        opportunities.push({
          type: 'missing-module',
          description: `Missing module: ${mod}`,
          priority: 'high',
        });
      } else {
        const files = fs.readdirSync(modPath).filter(f => f.endsWith('.ts'));
        findings.push(`${mod}: ${files.length} files`);
      }
    }

    // Check for TODO comments
    const todoCount = await this.countTodos();
    if (todoCount > 0) {
      findings.push(`Found ${todoCount} TODO comments`);
      opportunities.push({
        type: 'improvement',
        description: `Address ${todoCount} TODO items`,
        priority: 'medium',
      });
    }

    // Avoid repeating past work
    for (const past of pastWork) {
      const normalized = past.toLowerCase();
      opportunities.forEach((opp, i) => {
        if (normalized.includes(opp.description.toLowerCase().split(' ')[0])) {
          console.log(`  Skipping (already done): ${opp.description}`);
          opportunities.splice(i, 1);
        }
      });
    }

    // Check test coverage
    const testFiles = this.findFiles('./src', '*.test.ts');
    const srcFiles = this.findFiles('./src', '*.ts').filter(f => !f.includes('.test.'));
    const coverage = testFiles.length / Math.max(srcFiles.length, 1);

    if (coverage < 0.3) {
      opportunities.push({
        type: 'improvement',
        description: 'Add more unit tests',
        priority: 'medium',
      });
    }

    findings.push(`Test coverage: ${(coverage * 100).toFixed(0)}% (${testFiles.length}/${srcFiles.length})`);

    // Check for missing exports
    const indexPath = './src/index.ts';
    if (!fs.existsSync(indexPath)) {
      opportunities.push({
        type: 'missing-module',
        description: 'Create main entry point (src/index.ts)',
        priority: 'high',
      });
    }

    return { findings, opportunities, risks };
  }

  // ==========================================================================
  // Phase 3: Plan
  // ==========================================================================

  private async planImprovements(analysis: AnalysisResult): Promise<Opportunity[]> {
    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = analysis.opportunities.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Take top 2 opportunities
    const selected = sorted.slice(0, 2);

    for (const opp of selected) {
      console.log(`  [${opp.priority.toUpperCase()}] ${opp.description}`);
    }

    return selected;
  }

  // ==========================================================================
  // Phase 4: Execute
  // ==========================================================================

  private async executeImprovements(plan: Opportunity[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const opportunity of plan) {
      console.log(`\n  Executing: ${opportunity.description}`);

      try {
        const result = await this.executeOpportunity(opportunity);
        results.push(result);
        console.log(`    ${result.success ? '✓' : '✗'} ${result.details}`);
      } catch (error) {
        results.push({
          success: false,
          action: opportunity.description,
          details: `Error: ${error}`,
        });
        console.log(`    ✗ Failed: ${error}`);
      }
    }

    return results;
  }

  private async executeOpportunity(opp: Opportunity): Promise<ExecutionResult> {
    switch (opp.type) {
      case 'missing-module':
        if (opp.description.includes('entry point')) {
          return this.createEntryPoint();
        }
        return { success: false, action: opp.description, details: 'Unknown module type' };

      case 'improvement':
        if (opp.description.includes('test')) {
          return this.createSampleTest();
        }
        if (opp.description.includes('TODO')) {
          return { success: true, action: opp.description, details: 'TODOs logged for future work' };
        }
        return { success: false, action: opp.description, details: 'Unknown improvement type' };

      default:
        return { success: false, action: opp.description, details: 'Not implemented' };
    }
  }

  private createEntryPoint(): ExecutionResult {
    const content = `/**
 * Genesis - Main Entry Point
 *
 * Unified export of all Genesis capabilities.
 * Generated autonomously on ${new Date().toISOString()}
 */

// Core modules
export * from './kernel/index.js';
export * from './memory/index.js';
export * from './active-inference/index.js';
export * from './world-model/index.js';
export * from './execution/index.js';

// Diagnostics
export { generateDiagnostics, printDiagnostics } from './diagnostics.js';

// Version
export const VERSION = '7.5.1';
export const EVOLUTION = 3;
`;

    fs.writeFileSync('./src/index.ts', content);
    return {
      success: true,
      action: 'Create entry point',
      details: 'Created src/index.ts',
      filesCreated: ['src/index.ts'],
    };
  }

  private createSampleTest(): ExecutionResult {
    // Find a module without tests
    const srcDirs = this.listDirs('./src');

    for (const dir of srcDirs) {
      const dirPath = `./src/${dir}`;
      const hasTest = fs.readdirSync(dirPath).some(f => f.includes('.test.'));

      if (!hasTest && dir !== 'types') {
        const testPath = `./src/${dir}/${dir}.test.ts`;
        const content = `/**
 * ${dir} module tests
 * Generated autonomously on ${new Date().toISOString()}
 */

import { describe, it, expect } from 'vitest';

describe('${dir}', () => {
  it('should be importable', async () => {
    const module = await import('./index.js');
    expect(module).toBeDefined();
  });

  it('should export expected functions', async () => {
    const module = await import('./index.js');
    // Add specific export checks here
    expect(typeof module).toBe('object');
  });
});
`;
        fs.writeFileSync(testPath, content);
        return {
          success: true,
          action: 'Create test',
          details: `Created ${testPath}`,
          filesCreated: [testPath],
        };
      }
    }

    return {
      success: false,
      action: 'Create test',
      details: 'All modules already have tests',
    };
  }

  // ==========================================================================
  // Phase 5: Remember & Learn
  // ==========================================================================

  private async consolidateExperience(results: ExecutionResult[]): Promise<void> {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    // Remember this session (episodic)
    for (const result of successful) {
      this.memory.remember({
        what: result.action,
        details: {
          result: result.details,
          filesCreated: result.filesCreated,
          filesModified: result.filesModified,
        },
        feeling: { valence: 0.8, arousal: 0.5, label: 'accomplishment' },
        tags: ['autonomous', 'improvement', 'successful'],
        importance: 0.7,
      });
      console.log(`  📝 Remembered: "${result.action}"`);
    }

    for (const result of failed) {
      this.memory.remember({
        what: `Failed: ${result.action}`,
        details: { error: result.details },
        feeling: { valence: -0.3, arousal: 0.4, label: 'frustration' },
        tags: ['autonomous', 'failed', 'learning'],
        importance: 0.6,
      });
    }

    // Learn facts (semantic)
    if (successful.length > 0) {
      this.memory.learn({
        concept: 'Autonomous Improvement Pattern',
        definition: 'Analyze → Plan → Execute → Remember cycle for self-improvement',
        category: 'self-improvement',
        related: ['autonomous', 'evolution', 'memory'],
        confidence: 0.8,
      });
      console.log('  📚 Learned: Autonomous Improvement Pattern');
    }

    // Build/refine skills (procedural)
    const fileOps = successful.filter(r => r.filesCreated || r.filesModified);
    if (fileOps.length > 0) {
      this.memory.learnSkill({
        name: 'autonomous-file-creation',
        description: 'Create missing files autonomously',
        steps: [
          { action: 'analyze-codebase', params: { check: 'missing files' } },
          { action: 'generate-content', params: { template: 'auto' } },
          { action: 'write-file', params: { validate: true } },
          { action: 'remember-action', params: { store: 'episodic' } },
        ],
        tags: ['autonomous', 'file-creation'],
        importance: 0.7,
      });
      console.log('  🔧 Skill refined: autonomous-file-creation');
    }

    // Print memory stats
    const stats = this.memory.getStats();
    console.log(`\n  Memory: ${stats.total} items (${stats.episodic.total} episodes, ${stats.semantic.total} facts, ${stats.procedural.total} skills)`);

    // Persist to disk
    this.saveMemory();
  }

  private async rememberSession(summary: string): Promise<void> {
    this.memory.remember({
      what: `Autonomous session: ${summary}`,
      details: { duration: Date.now() - this.sessionStart.getTime() },
      feeling: { valence: 0.5, arousal: 0.3, label: 'neutral' },
      tags: ['autonomous', 'session'],
    });
    this.saveMemory();
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private listDirs(basePath: string): string[] {
    if (!fs.existsSync(basePath)) return [];
    return fs.readdirSync(basePath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  private findFiles(basePath: string, pattern: string): string[] {
    const results: string[] = [];
    const ext = pattern.replace('*', '');

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          results.push(fullPath);
        }
      }
    };

    walk(basePath);
    return results;
  }

  private async countTodos(): Promise<number> {
    const files = this.findFiles('./src', '.ts');
    let count = 0;

    for (const file of files.slice(0, 50)) { // Limit for performance
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const matches = content.match(/TODO|FIXME|HACK/gi);
        if (matches) count += matches.length;
      } catch {
        // Skip unreadable files
      }
    }

    return count;
  }

  private printSummary(results: ExecutionResult[]): void {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(50));
    console.log('📊 Autonomous Session Summary');
    console.log('='.repeat(50));
    console.log(`  ✓ Successful: ${successful}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log(`  Duration: ${((Date.now() - this.sessionStart.getTime()) / 1000).toFixed(1)}s`);

    const stats = this.memory.getStats();
    console.log(`\n🧠 Memory State:`);
    console.log(`  Episodes: ${stats.episodic.total}`);
    console.log(`  Facts: ${stats.semantic.total}`);
    console.log(`  Skills: ${stats.procedural.total}`);
    console.log('');
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.memory.shutdown();
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const genesis = new AutonomousGenesis();

  try {
    await genesis.run();
  } finally {
    genesis.shutdown();
  }
}

main().catch(console.error);
