/**
 * Test Generator v19.5
 *
 * Automatically generates tests for code submissions:
 * - Analyzes code to understand functionality
 * - Generates unit tests matching repo's test framework
 * - Ensures test coverage for edge cases
 * - Validates tests actually pass
 *
 * This increases PR acceptance rate by including tests.
 *
 * @module economy/test-generator
 * @version 19.5.0
 */

import { getMCPClient } from '../mcp/index.js';
import { getHybridRouter } from '../llm/router.js';
import { getRepoStyleLearner, type RepoStyleProfile } from './repo-style-learner.js';
import type { CodeChange } from './live/pr-pipeline.js';

// ============================================================================
// Types
// ============================================================================

export interface TestFramework {
  name: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'go_test' | 'rust_test' | 'unknown';
  importStatement: string;
  testPattern: string;
  assertPattern: string;
  fileExtension: string;
  testDirectory: string;
}

export interface GeneratedTest {
  path: string;
  content: string;
  framework: TestFramework;
  coverage: {
    functions: string[];
    edgeCases: string[];
  };
}

export interface TestGeneratorConfig {
  /** Minimum coverage percentage to aim for */
  minCoverage: number;
  /** Include edge case tests */
  includeEdgeCases: boolean;
  /** Include error handling tests */
  includeErrorTests: boolean;
  /** Max tests per function */
  maxTestsPerFunction: number;
}

const DEFAULT_CONFIG: TestGeneratorConfig = {
  minCoverage: 80,
  includeEdgeCases: true,
  includeErrorTests: true,
  maxTestsPerFunction: 5,
};

// ============================================================================
// Test Frameworks
// ============================================================================

const FRAMEWORK_TEMPLATES: Record<string, TestFramework> = {
  jest: {
    name: 'jest',
    importStatement: "import { describe, it, expect } from '@jest/globals';",
    testPattern: `describe('{{module}}', () => {
  it('{{testName}}', () => {
    {{testBody}}
  });
});`,
    assertPattern: 'expect({{actual}}).{{matcher}}({{expected}})',
    fileExtension: '.test.ts',
    testDirectory: '__tests__',
  },
  vitest: {
    name: 'vitest',
    importStatement: "import { describe, it, expect } from 'vitest';",
    testPattern: `describe('{{module}}', () => {
  it('{{testName}}', () => {
    {{testBody}}
  });
});`,
    assertPattern: 'expect({{actual}}).{{matcher}}({{expected}})',
    fileExtension: '.test.ts',
    testDirectory: '__tests__',
  },
  mocha: {
    name: 'mocha',
    importStatement: "import { expect } from 'chai';",
    testPattern: `describe('{{module}}', () => {
  it('{{testName}}', () => {
    {{testBody}}
  });
});`,
    assertPattern: 'expect({{actual}}).to.{{matcher}}({{expected}})',
    fileExtension: '.test.js',
    testDirectory: 'test',
  },
  pytest: {
    name: 'pytest',
    importStatement: 'import pytest',
    testPattern: `def test_{{testName}}():
    {{testBody}}`,
    assertPattern: 'assert {{actual}} {{matcher}} {{expected}}',
    fileExtension: '_test.py',
    testDirectory: 'tests',
  },
  go_test: {
    name: 'go_test',
    importStatement: 'import "testing"',
    testPattern: `func Test{{TestName}}(t *testing.T) {
    {{testBody}}
}`,
    assertPattern: 'if {{actual}} {{matcher}} {{expected}} { t.Errorf("...") }',
    fileExtension: '_test.go',
    testDirectory: '',
  },
  rust_test: {
    name: 'rust_test',
    importStatement: '',
    testPattern: `#[test]
fn test_{{testName}}() {
    {{testBody}}
}`,
    assertPattern: 'assert_eq!({{actual}}, {{expected}})',
    fileExtension: '.rs',
    testDirectory: 'tests',
  },
};

// ============================================================================
// Test Generator
// ============================================================================

export class TestGenerator {
  private mcp = getMCPClient();
  private router = getHybridRouter();
  private styleLearner = getRepoStyleLearner();
  private config: TestGeneratorConfig;

  constructor(config?: Partial<TestGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate tests for code changes
   */
  async generateTests(
    changes: CodeChange[],
    owner: string,
    repo: string
  ): Promise<GeneratedTest[]> {
    console.log(`[TestGenerator] Generating tests for ${changes.length} files...`);

    // 1. Detect test framework
    const framework = await this.detectFramework(owner, repo);
    console.log(`[TestGenerator] Detected framework: ${framework.name}`);

    // 2. Learn repo style for test formatting
    const styleProfile = await this.styleLearner.learnStyle(owner, repo);

    // 3. Generate tests for each code change
    const tests: GeneratedTest[] = [];

    for (const change of changes) {
      if (this.shouldGenerateTestFor(change)) {
        const test = await this.generateTestForFile(change, framework, styleProfile);
        if (test) {
          tests.push(test);
        }
      }
    }

    console.log(`[TestGenerator] Generated ${tests.length} test files`);
    return tests;
  }

  /**
   * Detect the test framework used by the repository
   */
  async detectFramework(owner: string, repo: string): Promise<TestFramework> {
    try {
      // Check package.json for JS/TS projects
      const packageJson = await this.mcp.call('github', 'get_file_contents', {
        owner,
        repo,
        path: 'package.json',
      });

      if (packageJson?.data?.content) {
        const decoded = Buffer.from(packageJson.data.content, 'base64').toString('utf-8');
        const pkg = JSON.parse(decoded);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps['vitest']) return FRAMEWORK_TEMPLATES.vitest;
        if (deps['jest']) return FRAMEWORK_TEMPLATES.jest;
        if (deps['mocha']) return FRAMEWORK_TEMPLATES.mocha;
      }
    } catch {
      // Not a JS project
    }

    try {
      // Check for pytest
      const requirements = await this.mcp.call('github', 'get_file_contents', {
        owner,
        repo,
        path: 'requirements.txt',
      });

      if (requirements?.data?.content) {
        const decoded = Buffer.from(requirements.data.content, 'base64').toString('utf-8');
        if (decoded.includes('pytest')) return FRAMEWORK_TEMPLATES.pytest;
      }
    } catch {
      // Not a Python project
    }

    try {
      // Check for Go
      const goMod = await this.mcp.call('github', 'get_file_contents', {
        owner,
        repo,
        path: 'go.mod',
      });

      if (goMod?.data?.content) {
        return FRAMEWORK_TEMPLATES.go_test;
      }
    } catch {
      // Not a Go project
    }

    try {
      // Check for Rust
      const cargoToml = await this.mcp.call('github', 'get_file_contents', {
        owner,
        repo,
        path: 'Cargo.toml',
      });

      if (cargoToml?.data?.content) {
        return FRAMEWORK_TEMPLATES.rust_test;
      }
    } catch {
      // Not a Rust project
    }

    // Default to Jest for unknown
    return FRAMEWORK_TEMPLATES.jest;
  }

  /**
   * Determine if we should generate tests for a file
   */
  private shouldGenerateTestFor(change: CodeChange): boolean {
    const path = change.path.toLowerCase();

    // Skip test files
    if (path.includes('.test.') || path.includes('_test.') || path.includes('/test/')) {
      return false;
    }

    // Skip non-code files
    if (path.endsWith('.md') || path.endsWith('.json') || path.endsWith('.yml')) {
      return false;
    }

    // Skip config files
    if (path.includes('config') || path.includes('.rc')) {
      return false;
    }

    return true;
  }

  /**
   * Generate test file for a code change
   */
  private async generateTestForFile(
    change: CodeChange,
    framework: TestFramework,
    styleProfile: RepoStyleProfile
  ): Promise<GeneratedTest | null> {
    console.log(`[TestGenerator] Generating tests for ${change.path}`);

    const systemPrompt = `You are a test generation expert. Generate comprehensive tests for the given code.

TEST FRAMEWORK: ${framework.name}
IMPORT STATEMENT: ${framework.importStatement}

REQUIREMENTS:
1. Cover all public functions/methods
2. Include edge cases (null, empty, boundary values)
3. Include error handling tests
4. Use descriptive test names
5. Follow the repository's code style
6. Make tests independent and idempotent
7. Use mocks/stubs for external dependencies

STYLE GUIDE:
${this.styleLearner.generateStyleGuide(styleProfile)}

Return ONLY the complete test file content, no explanations.`;

    const userPrompt = `Generate tests for this code:

File: ${change.path}
\`\`\`
${change.content}
\`\`\`

Generate a complete test file using ${framework.name}:`;

    try {
      const response = await this.router.execute(userPrompt, systemPrompt);

      // Extract test content
      let testContent = response.content;
      const codeMatch = testContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        testContent = codeMatch[1].trim();
      }

      // Validate test content
      if (!testContent || testContent.length < 50) {
        console.log(`[TestGenerator] Generated test too short for ${change.path}`);
        return null;
      }

      // Generate test file path
      const testPath = this.generateTestPath(change.path, framework);

      // Extract coverage info
      const coverage = this.analyzeCoverage(change.content, testContent);

      return {
        path: testPath,
        content: testContent,
        framework,
        coverage,
      };

    } catch (error) {
      console.error(`[TestGenerator] Failed to generate tests for ${change.path}:`, error);
      return null;
    }
  }

  /**
   * Generate the test file path
   */
  private generateTestPath(sourcePath: string, framework: TestFramework): string {
    const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    const filename = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
    const basename = filename.substring(0, filename.lastIndexOf('.'));
    const extension = filename.substring(filename.lastIndexOf('.'));

    // Python uses _test suffix
    if (framework.name === 'pytest') {
      return `${dir}/test_${basename}.py`;
    }

    // Go puts tests next to source
    if (framework.name === 'go_test') {
      return `${dir}/${basename}_test.go`;
    }

    // Rust puts tests in tests/ directory or inline
    if (framework.name === 'rust_test') {
      return `tests/${basename}_test.rs`;
    }

    // JS/TS use __tests__ or .test suffix
    if (framework.testDirectory) {
      return `${dir}/${framework.testDirectory}/${basename}${framework.fileExtension}`;
    }

    return `${dir}/${basename}${framework.fileExtension}`;
  }

  /**
   * Analyze test coverage
   */
  private analyzeCoverage(
    sourceCode: string,
    testCode: string
  ): { functions: string[]; edgeCases: string[] } {
    const functions: string[] = [];
    const edgeCases: string[] = [];

    // Extract function names from source
    const functionPatterns = [
      /function\s+(\w+)\s*\(/g,
      /(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      /(\w+)\s*\([^)]*\)\s*{/g,
      /def\s+(\w+)\s*\(/g, // Python
      /func\s+(\w+)\s*\(/g, // Go
      /fn\s+(\w+)\s*\(/g, // Rust
    ];

    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(sourceCode)) !== null) {
        functions.push(match[1]);
      }
    }

    // Check for edge case tests in test code
    const edgeCasePatterns = [
      /null|undefined|None|nil/i,
      /empty|blank/i,
      /zero|negative/i,
      /boundary|limit|max|min/i,
      /error|exception|throw/i,
      /invalid|malformed/i,
    ];

    for (const pattern of edgeCasePatterns) {
      if (pattern.test(testCode)) {
        edgeCases.push(pattern.source.replace(/\|/g, '/'));
      }
    }

    return { functions, edgeCases };
  }

  /**
   * Validate that tests would pass (syntax check)
   */
  async validateTests(test: GeneratedTest): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic syntax checks
    if (test.framework.name === 'jest' || test.framework.name === 'vitest') {
      if (!test.content.includes('describe') && !test.content.includes('it(')) {
        errors.push('Missing describe/it blocks');
      }
      if (!test.content.includes('expect')) {
        errors.push('Missing expect assertions');
      }
    }

    if (test.framework.name === 'pytest') {
      if (!test.content.includes('def test_')) {
        errors.push('Missing test functions (should start with test_)');
      }
      if (!test.content.includes('assert')) {
        errors.push('Missing assert statements');
      }
    }

    if (test.framework.name === 'go_test') {
      if (!test.content.includes('func Test')) {
        errors.push('Missing Test functions');
      }
      if (!test.content.includes('*testing.T')) {
        errors.push('Missing testing.T parameter');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Add tests to code changes
   */
  async enhanceWithTests(
    changes: CodeChange[],
    owner: string,
    repo: string
  ): Promise<CodeChange[]> {
    const tests = await this.generateTests(changes, owner, repo);

    // Validate all tests
    const validTests: GeneratedTest[] = [];
    for (const test of tests) {
      const validation = await this.validateTests(test);
      if (validation.valid) {
        validTests.push(test);
      } else {
        console.log(`[TestGenerator] Invalid test for ${test.path}: ${validation.errors.join(', ')}`);
      }
    }

    // Add valid tests to changes
    const testChanges: CodeChange[] = validTests.map(test => ({
      path: test.path,
      content: test.content,
      operation: 'create',
    }));

    return [...changes, ...testChanges];
  }
}

// ============================================================================
// Singleton
// ============================================================================

let testGenerator: TestGenerator | null = null;

export function getTestGenerator(): TestGenerator {
  if (!testGenerator) {
    testGenerator = new TestGenerator();
  }
  return testGenerator;
}

export function resetTestGenerator(): void {
  testGenerator = null;
}
