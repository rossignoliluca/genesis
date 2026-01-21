/**
 * Genesis v10.1 - Code Quality Analyzer
 *
 * Extends Genesis self-analysis to include static code quality metrics.
 * Results are stored in semantic memory for learning and improvement.
 *
 * Analyzes:
 * - Test coverage (which modules have tests)
 * - Type safety (any types, as casts)
 * - Code complexity (file sizes, function counts)
 * - TODO/FIXME tracking
 * - Error handling patterns
 *
 * Scientific grounding:
 * - FEP: Reduce uncertainty about code quality
 * - Autopoiesis: Self-awareness enables self-improvement
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface TestCoverageResult {
  module: string;
  hasTest: boolean;
  testFile?: string;
  coverage: 'full' | 'partial' | 'none';
}

export interface TypeSafetyIssue {
  file: string;
  line: number;
  type: 'any_declaration' | 'as_cast' | 'as_unknown' | 'ts_ignore';
  content: string;
  severity: 'high' | 'medium' | 'low';
}

export interface TodoItem {
  file: string;
  line: number;
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  content: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface FileComplexity {
  file: string;
  lines: number;
  functions: number;
  classes: number;
  exports: number;
  imports: number;
  complexity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CodeQualityReport {
  generatedAt: Date;
  version: string;
  summary: {
    totalFiles: number;
    totalLines: number;
    testCoverage: number;        // 0-100%
    typeSafetyScore: number;     // 0-100
    avgComplexity: number;       // 0-100
    todoCount: number;
    criticalIssues: number;
  };
  testCoverage: TestCoverageResult[];
  typeSafetyIssues: TypeSafetyIssue[];
  todoItems: TodoItem[];
  fileComplexity: FileComplexity[];
  recommendations: Recommendation[];
}

export interface Recommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'testing' | 'types' | 'complexity' | 'maintainability';
  title: string;
  description: string;
  files: string[];
  estimatedEffort: string;
}

export interface CodeQualityConfig {
  rootPath: string;
  srcPattern: string;
  testPattern: string;
  excludePatterns: string[];
  maxFileLines: number;
  maxFunctionCount: number;
}

const DEFAULT_CONFIG: CodeQualityConfig = {
  rootPath: process.cwd(),
  srcPattern: 'src/**/*.ts',
  testPattern: 'test/**/*.test.ts',
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
  maxFileLines: 500,
  maxFunctionCount: 20,
};

// ============================================================================
// Code Quality Analyzer
// ============================================================================

export class CodeQualityAnalyzer {
  private config: CodeQualityConfig;

  constructor(config: Partial<CodeQualityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run full code quality analysis
   */
  async analyze(): Promise<CodeQualityReport> {
    const srcFiles = await this.findFiles(this.config.srcPattern);
    const testFiles = await this.findFiles(this.config.testPattern);

    const testCoverage = this.analyzeTestCoverage(srcFiles, testFiles);
    const typeSafetyIssues = await this.analyzeTypeSafety(srcFiles);
    const todoItems = await this.analyzeTodos(srcFiles);
    const fileComplexity = await this.analyzeComplexity(srcFiles);

    const totalLines = fileComplexity.reduce((sum, f) => sum + f.lines, 0);
    const testedModules = testCoverage.filter(t => t.hasTest).length;
    const coveragePercent = testCoverage.length > 0
      ? (testedModules / testCoverage.length) * 100
      : 0;

    const typeSafetyScore = this.calculateTypeSafetyScore(typeSafetyIssues, totalLines);
    const avgComplexity = this.calculateAvgComplexity(fileComplexity);

    const recommendations = this.generateRecommendations({
      testCoverage,
      typeSafetyIssues,
      todoItems,
      fileComplexity,
    });

    return {
      generatedAt: new Date(),
      version: '10.1.0',
      summary: {
        totalFiles: srcFiles.length,
        totalLines,
        testCoverage: coveragePercent,
        typeSafetyScore,
        avgComplexity,
        todoCount: todoItems.length,
        criticalIssues: recommendations.filter(r => r.priority === 'critical').length,
      },
      testCoverage,
      typeSafetyIssues,
      todoItems,
      fileComplexity,
      recommendations,
    };
  }

  // ==========================================================================
  // Test Coverage Analysis
  // ==========================================================================

  private analyzeTestCoverage(srcFiles: string[], testFiles: string[]): TestCoverageResult[] {
    const results: TestCoverageResult[] = [];
    const testSet = new Set(testFiles.map(t => this.getModuleName(t)));

    for (const srcFile of srcFiles) {
      // Skip test files in src
      if (srcFile.includes('.test.ts')) continue;

      const moduleName = this.getModuleName(srcFile);
      const hasTest = testSet.has(moduleName) ||
                      testFiles.some(t => t.includes(moduleName));

      results.push({
        module: moduleName,
        hasTest,
        testFile: hasTest ? testFiles.find(t => t.includes(moduleName)) : undefined,
        coverage: hasTest ? 'partial' : 'none', // Would need actual coverage tool for 'full'
      });
    }

    return results;
  }

  private getModuleName(filePath: string): string {
    return path.basename(filePath, '.ts')
      .replace('.test', '')
      .replace('.spec', '');
  }

  // ==========================================================================
  // Type Safety Analysis
  // ==========================================================================

  private async analyzeTypeSafety(files: string[]): Promise<TypeSafetyIssue[]> {
    const issues: TypeSafetyIssue[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // Check for 'any' declarations
          if (/:\s*any\b/.test(line) || /\bas\s+any\b/.test(line)) {
            issues.push({
              file: path.relative(this.config.rootPath, file),
              line: lineNum,
              type: 'any_declaration',
              content: line.trim(),
              severity: 'medium',
            });
          }

          // Check for 'as unknown as' casts (higher risk)
          if (/as\s+unknown\s+as\b/.test(line)) {
            issues.push({
              file: path.relative(this.config.rootPath, file),
              line: lineNum,
              type: 'as_unknown',
              content: line.trim(),
              severity: 'high',
            });
          }

          // Check for @ts-ignore or @ts-nocheck
          if (/@ts-ignore|@ts-nocheck/.test(line)) {
            issues.push({
              file: path.relative(this.config.rootPath, file),
              line: lineNum,
              type: 'ts_ignore',
              content: line.trim(),
              severity: 'high',
            });
          }
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }

    return issues;
  }

  // ==========================================================================
  // TODO Analysis
  // ==========================================================================

  private async analyzeTodos(files: string[]): Promise<TodoItem[]> {
    const items: TodoItem[] = [];
    const patterns = [
      { regex: /\/\/\s*TODO:\s*(.+)$/i, type: 'TODO' as const },
      { regex: /\/\/\s*FIXME:\s*(.+)$/i, type: 'FIXME' as const },
      { regex: /\/\/\s*HACK:\s*(.+)$/i, type: 'HACK' as const },
      { regex: /\/\/\s*XXX:\s*(.+)$/i, type: 'XXX' as const },
    ];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
              items.push({
                file: path.relative(this.config.rootPath, file),
                line: lineNum,
                type: pattern.type,
                content: match[1].trim(),
                priority: this.inferTodoPriority(pattern.type, match[1]),
              });
            }
          }
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }

    return items;
  }

  private inferTodoPriority(type: string, content: string): TodoItem['priority'] {
    const lowerContent = content.toLowerCase();
    if (type === 'FIXME' || type === 'XXX') return 'high';
    if (type === 'HACK') return 'medium';
    if (lowerContent.includes('critical') || lowerContent.includes('urgent')) return 'critical';
    if (lowerContent.includes('important')) return 'high';
    return 'medium';
  }

  // ==========================================================================
  // Complexity Analysis
  // ==========================================================================

  private async analyzeComplexity(files: string[]): Promise<FileComplexity[]> {
    const results: FileComplexity[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        const functions = (content.match(/\bfunction\s+\w+|=>\s*{|async\s+\(/g) || []).length;
        const classes = (content.match(/\bclass\s+\w+/g) || []).length;
        const exports = (content.match(/\bexport\s+(const|function|class|interface|type|default)/g) || []).length;
        const imports = (content.match(/\bimport\s+/g) || []).length;

        let complexity: FileComplexity['complexity'] = 'low';
        if (lines.length > this.config.maxFileLines * 2 || functions > this.config.maxFunctionCount * 2) {
          complexity = 'critical';
        } else if (lines.length > this.config.maxFileLines || functions > this.config.maxFunctionCount) {
          complexity = 'high';
        } else if (lines.length > this.config.maxFileLines / 2 || functions > this.config.maxFunctionCount / 2) {
          complexity = 'medium';
        }

        results.push({
          file: path.relative(this.config.rootPath, file),
          lines: lines.length,
          functions,
          classes,
          exports,
          imports,
          complexity,
        });
      } catch (err) {
        // Skip files that can't be read
      }
    }

    return results;
  }

  // ==========================================================================
  // Scoring
  // ==========================================================================

  private calculateTypeSafetyScore(issues: TypeSafetyIssue[], totalLines: number): number {
    if (totalLines === 0) return 100;

    // Weight by severity
    const weightedIssues = issues.reduce((sum, issue) => {
      const weight = issue.severity === 'high' ? 3 : issue.severity === 'medium' ? 2 : 1;
      return sum + weight;
    }, 0);

    // Score based on issues per 1000 lines
    const issuesPerKLines = (weightedIssues / totalLines) * 1000;
    const score = Math.max(0, 100 - issuesPerKLines * 5);
    return Math.round(score);
  }

  private calculateAvgComplexity(files: FileComplexity[]): number {
    if (files.length === 0) return 100;

    const complexityScore = files.reduce((sum, f) => {
      const score = f.complexity === 'low' ? 100 :
                    f.complexity === 'medium' ? 70 :
                    f.complexity === 'high' ? 40 : 10;
      return sum + score;
    }, 0);

    return Math.round(complexityScore / files.length);
  }

  // ==========================================================================
  // Recommendations
  // ==========================================================================

  private generateRecommendations(data: {
    testCoverage: TestCoverageResult[];
    typeSafetyIssues: TypeSafetyIssue[];
    todoItems: TodoItem[];
    fileComplexity: FileComplexity[];
  }): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Test coverage recommendations
    const untestedModules = data.testCoverage.filter(t => !t.hasTest);
    if (untestedModules.length > 0) {
      const criticalModules = untestedModules.filter(m =>
        m.module.includes('payment') ||
        m.module.includes('auth') ||
        m.module.includes('a2a')
      );

      if (criticalModules.length > 0) {
        recommendations.push({
          id: 'test-critical',
          priority: 'critical',
          category: 'testing',
          title: 'Add tests for critical modules',
          description: `Critical modules without tests: ${criticalModules.map(m => m.module).join(', ')}`,
          files: criticalModules.map(m => m.module),
          estimatedEffort: `${criticalModules.length * 2}h`,
        });
      }

      if (untestedModules.length > 5) {
        recommendations.push({
          id: 'test-coverage',
          priority: 'high',
          category: 'testing',
          title: 'Improve test coverage',
          description: `${untestedModules.length} modules without tests (${Math.round((untestedModules.length / data.testCoverage.length) * 100)}% untested)`,
          files: untestedModules.slice(0, 10).map(m => m.module),
          estimatedEffort: `${Math.ceil(untestedModules.length * 1.5)}h`,
        });
      }
    }

    // Type safety recommendations
    const highSeverityIssues = data.typeSafetyIssues.filter(i => i.severity === 'high');
    if (highSeverityIssues.length > 0) {
      recommendations.push({
        id: 'type-safety-high',
        priority: 'high',
        category: 'types',
        title: 'Fix high-severity type issues',
        description: `${highSeverityIssues.length} high-severity type safety issues (as unknown, @ts-ignore)`,
        files: [...new Set(highSeverityIssues.map(i => i.file))],
        estimatedEffort: `${Math.ceil(highSeverityIssues.length * 0.25)}h`,
      });
    }

    const anyIssues = data.typeSafetyIssues.filter(i => i.type === 'any_declaration');
    if (anyIssues.length > 50) {
      recommendations.push({
        id: 'type-any',
        priority: 'medium',
        category: 'types',
        title: 'Reduce any type usage',
        description: `${anyIssues.length} explicit 'any' declarations reduce type safety`,
        files: [...new Set(anyIssues.map(i => i.file))].slice(0, 10),
        estimatedEffort: `${Math.ceil(anyIssues.length * 0.1)}h`,
      });
    }

    // Complexity recommendations
    const criticalFiles = data.fileComplexity.filter(f => f.complexity === 'critical');
    if (criticalFiles.length > 0) {
      recommendations.push({
        id: 'complexity-critical',
        priority: 'high',
        category: 'complexity',
        title: 'Refactor oversized files',
        description: `${criticalFiles.length} files exceed complexity limits (>${this.config.maxFileLines * 2} lines)`,
        files: criticalFiles.map(f => f.file),
        estimatedEffort: `${criticalFiles.length * 4}h`,
      });
    }

    // TODO recommendations
    const criticalTodos = data.todoItems.filter(t => t.priority === 'critical' || t.type === 'FIXME');
    if (criticalTodos.length > 0) {
      recommendations.push({
        id: 'todo-critical',
        priority: 'medium',
        category: 'maintainability',
        title: 'Address critical TODOs',
        description: `${criticalTodos.length} critical/FIXME items need attention`,
        files: [...new Set(criticalTodos.map(t => t.file))],
        estimatedEffort: `${criticalTodos.length}h`,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private async findFiles(pattern: string): Promise<string[]> {
    // Use native recursive directory walking (no external dependencies)
    const isTestPattern = pattern.includes('.test.') || pattern.includes('.spec.');
    return this.findFilesRecursive(this.config.rootPath, isTestPattern);
  }

  private findFilesRecursive(dir: string, testFilesOnly: boolean): string[] {
    const results: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip excluded patterns
        if (this.config.excludePatterns.some(p => fullPath.includes(p.replace('**/', '').replace('/**', '')))) {
          continue;
        }

        if (entry.isDirectory()) {
          results.push(...this.findFilesRecursive(fullPath, testFilesOnly));
        } else if (entry.name.endsWith('.ts')) {
          const isTestFile = entry.name.includes('.test.') || entry.name.includes('.spec.');
          if (testFilesOnly === isTestFile) {
            results.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }

    return results;
  }
}

// ============================================================================
// Memory Integration
// ============================================================================

/**
 * Store analysis results in Genesis semantic memory for learning
 */
export async function storeAnalysisInMemory(
  report: CodeQualityReport,
  semanticStore: { createFact: (opts: any) => any }
): Promise<void> {
  // Store summary as semantic fact
  semanticStore.createFact({
    concept: `code_quality_analysis_${report.generatedAt.toISOString().split('T')[0]}`,
    definition: `Code quality analysis with ${report.summary.testCoverage.toFixed(1)}% test coverage, ${report.summary.typeSafetyScore} type safety score`,
    category: 'self_analysis',
    properties: {
      totalFiles: report.summary.totalFiles,
      totalLines: report.summary.totalLines,
      testCoverage: report.summary.testCoverage,
      typeSafetyScore: report.summary.typeSafetyScore,
      avgComplexity: report.summary.avgComplexity,
      todoCount: report.summary.todoCount,
      criticalIssues: report.summary.criticalIssues,
    },
    confidence: 1.0,
    importance: 0.9,
    tags: ['self-analysis', 'code-quality', 'improvement'],
  });

  // Store each recommendation as a fact for future reference
  for (const rec of report.recommendations) {
    semanticStore.createFact({
      concept: `improvement_${rec.id}`,
      definition: rec.description,
      category: 'self_improvement',
      properties: {
        priority: rec.priority,
        category: rec.category,
        files: rec.files,
        effort: rec.estimatedEffort,
      },
      confidence: 0.9,
      importance: rec.priority === 'critical' ? 1.0 : rec.priority === 'high' ? 0.8 : 0.6,
      tags: ['recommendation', rec.category, rec.priority],
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCodeQualityAnalyzer(config?: Partial<CodeQualityConfig>): CodeQualityAnalyzer {
  return new CodeQualityAnalyzer(config);
}

// ============================================================================
// CLI Integration
// ============================================================================

export async function runCodeQualityAnalysis(rootPath: string = process.cwd()): Promise<CodeQualityReport> {
  const analyzer = createCodeQualityAnalyzer({ rootPath });
  return analyzer.analyze();
}

// ============================================================================
// MCP Memory Graph Integration (v10.1)
// ============================================================================

/**
 * Entity type for MCP Memory graph (re-exported from self-model.ts)
 */
export interface MemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
}

/**
 * Relation type for MCP Memory graph
 */
export interface MemoryRelation {
  from: string;
  to: string;
  relationType: string;
}

/**
 * Convert code quality report to MCP Memory graph format
 * This allows Genesis to persistently remember analysis results
 */
export function codeQualityToMemoryGraph(report: CodeQualityReport): {
  entities: MemoryEntity[];
  relations: MemoryRelation[];
} {
  const entities: MemoryEntity[] = [];
  const relations: MemoryRelation[] = [];
  const dateStr = report.generatedAt.toISOString().split('T')[0];

  // Root entity: Analysis itself
  entities.push({
    name: `CodeAnalysis:${dateStr}`,
    entityType: 'CodeQualityAnalysis',
    observations: [
      `Version: ${report.version}`,
      `Generated: ${report.generatedAt.toISOString()}`,
      `Files analyzed: ${report.summary.totalFiles}`,
      `Lines of code: ${report.summary.totalLines}`,
      `Test coverage: ${report.summary.testCoverage.toFixed(1)}%`,
      `Type safety score: ${report.summary.typeSafetyScore}/100`,
      `Average complexity: ${report.summary.avgComplexity.toFixed(1)}`,
      `TODOs pending: ${report.summary.todoCount}`,
      `Critical issues: ${report.summary.criticalIssues}`,
    ],
  });

  // Relation to Genesis
  relations.push({
    from: `CodeAnalysis:${dateStr}`,
    to: 'Genesis',
    relationType: 'analyzes',
  });

  // Entities for recommendations (most important for learning)
  for (const rec of report.recommendations) {
    entities.push({
      name: `Improvement:${rec.id}`,
      entityType: 'ImprovementOpportunity',
      observations: [
        rec.title,
        rec.description,
        `Priority: ${rec.priority}`,
        `Category: ${rec.category}`,
        `Estimated effort: ${rec.estimatedEffort}`,
        rec.files.length > 0 ? `Files: ${rec.files.slice(0, 5).join(', ')}${rec.files.length > 5 ? '...' : ''}` : '',
      ].filter(Boolean),
    });

    relations.push({
      from: `CodeAnalysis:${dateStr}`,
      to: `Improvement:${rec.id}`,
      relationType: 'identifies',
    });
  }

  // Entities for untested modules (critical gaps)
  const untested = report.testCoverage.filter(t => !t.hasTest).slice(0, 20);
  for (const mod of untested) {
    entities.push({
      name: `UntestedModule:${mod.module}`,
      entityType: 'TestGap',
      observations: [
        `Module '${mod.module}' has no test coverage`,
        `Coverage level: ${mod.coverage}`,
      ],
    });

    relations.push({
      from: `CodeAnalysis:${dateStr}`,
      to: `UntestedModule:${mod.module}`,
      relationType: 'identifies_gap',
    });
  }

  // Entities for high-severity type issues
  const highSeverity = report.typeSafetyIssues.filter(i => i.severity === 'high').slice(0, 10);
  for (const issue of highSeverity) {
    const issueId = path.basename(issue.file) + ':' + issue.line;
    entities.push({
      name: `TypeIssue:${issueId}`,
      entityType: 'TypeSafetyIssue',
      observations: [
        `Type: ${issue.type}`,
        `File: ${issue.file}`,
        `Line: ${issue.line}`,
        `Content: ${issue.content.slice(0, 100)}`,
        `Severity: ${issue.severity}`,
      ],
    });

    relations.push({
      from: `CodeAnalysis:${dateStr}`,
      to: `TypeIssue:${issueId}`,
      relationType: 'identifies_issue',
    });
  }

  return { entities, relations };
}

/**
 * Persist code quality analysis to local storage
 * Graph can be synced to MCP Memory via CLI
 */
export async function persistCodeQualityToMemory(report?: CodeQualityReport): Promise<{
  success: boolean;
  entitiesCreated: number;
  relationsCreated: number;
  graphPath: string;
  error?: string;
}> {
  try {
    // Run analysis if not provided
    const analysisReport = report || await runCodeQualityAnalysis();

    // Convert to graph format
    const { entities, relations } = codeQualityToMemoryGraph(analysisReport);

    // Store locally in .genesis/
    const cacheDir = path.join(process.cwd(), '.genesis');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const dateStr = analysisReport.generatedAt.toISOString().split('T')[0];
    const graphPath = path.join(cacheDir, `code-quality-${dateStr}.json`);

    fs.writeFileSync(graphPath, JSON.stringify({
      version: analysisReport.version,
      generatedAt: analysisReport.generatedAt.toISOString(),
      summary: analysisReport.summary,
      entities,
      relations,
      stats: {
        entityCount: entities.length,
        relationCount: relations.length,
        entityTypes: [...new Set(entities.map(e => e.entityType))],
        relationTypes: [...new Set(relations.map(r => r.relationType))],
      },
    }, null, 2));

    return {
      success: true,
      entitiesCreated: entities.length,
      relationsCreated: relations.length,
      graphPath,
    };
  } catch (error) {
    return {
      success: false,
      entitiesCreated: 0,
      relationsCreated: 0,
      graphPath: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load code quality analysis graph from local storage
 */
export function loadCodeQualityGraph(date?: string): {
  entities: MemoryEntity[];
  relations: MemoryRelation[];
  summary?: CodeQualityReport['summary'];
} | null {
  try {
    const cacheDir = path.join(process.cwd(), '.genesis');

    // Find the most recent analysis if date not specified
    if (!date && fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir)
        .filter(f => f.startsWith('code-quality-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > 0) {
        date = files[0].replace('code-quality-', '').replace('.json', '');
      }
    }

    if (!date) return null;

    const graphPath = path.join(cacheDir, `code-quality-${date}.json`);
    if (fs.existsSync(graphPath)) {
      const data = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
      return {
        entities: data.entities,
        relations: data.relations,
        summary: data.summary,
      };
    }

    return null;
  } catch {
    return null;
  }
}
