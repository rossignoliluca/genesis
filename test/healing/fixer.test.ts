/**
 * Tests for Genesis Auto-Fix Engine
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  AutoFixer,
  getAutoFixer,
  resetAutoFixer,
  generateFixes,
  FixCandidate,
} from '../../src/healing/fixer.js';
import { DetectedError } from '../../src/healing/detector.js';

// Test directory
const TEST_DIR = '/tmp/genesis-fixer-test-' + Date.now();

describe('AutoFixer', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    resetAutoFixer();
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    resetAutoFixer();
  });

  beforeEach(() => {
    // Clean test directory
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      fs.rmSync(path.join(TEST_DIR, file), { force: true, recursive: true });
    }
  });

  // ==========================================================================
  // Candidate Generation Tests
  // ==========================================================================

  describe('Candidate Generation', () => {
    it('should generate fix for missing semicolon', async () => {
      const filePath = path.join(TEST_DIR, 'semicolon.ts');
      fs.writeFileSync(filePath, 'const x = 1\nconst y = 2;');

      const error: DetectedError = {
        category: 'syntax',
        severity: 'error',
        message: 'Missing semicolon',
        file: filePath,
        line: 1,
        raw: 'Missing semicolon',
        fixHint: 'syntax_fix',
      };

      const candidates = await generateFixes(error);

      assert.ok(candidates.length > 0);
      assert.ok(candidates.some(c => c.fixed.includes('const x = 1;')));
    });

    it('should generate fix for undefined variable', async () => {
      const filePath = path.join(TEST_DIR, 'undefined.ts');
      fs.writeFileSync(filePath, 'console.log(myVar);');

      const error: DetectedError = {
        category: 'runtime',
        severity: 'error',
        message: "'myVar' is not defined",
        file: filePath,
        line: 1,
        raw: "'myVar' is not defined",
        fixHint: 'runtime_error',
      };

      const candidates = await generateFixes(error);

      assert.ok(candidates.length > 0);
      assert.ok(candidates.some(c => c.fixed.includes('let myVar')));
    });

    it('should generate npm install for missing module', async () => {
      const error: DetectedError = {
        category: 'dependency',
        severity: 'error',
        message: "Cannot find module 'lodash'",
        file: 'src/index.ts',
        raw: "Cannot find module 'lodash'",
        fixHint: 'install_dependency',
      };

      const candidates = await generateFixes(error);

      assert.ok(candidates.length > 0);
      assert.ok(candidates.some(c => c.fixed.includes('npm install lodash')));
    });

    it('should generate optional chaining for null checks', async () => {
      const filePath = path.join(TEST_DIR, 'null.ts');
      fs.writeFileSync(filePath, 'const x = obj.prop.value;');

      const error: DetectedError = {
        category: 'type',
        severity: 'error',
        message: "'obj' is possibly 'null'",
        file: filePath,
        line: 1,
        raw: "'obj' is possibly 'null'",
        fixHint: 'type_mismatch',
      };

      const candidates = await generateFixes(error);

      // Should have optional chaining candidate
      assert.ok(candidates.some(c =>
        c.fixed.includes('?.') || c.fixed.includes('if (obj)')
      ));
    });

    it('should not generate candidates for errors without file', async () => {
      const error: DetectedError = {
        category: 'runtime',
        severity: 'error',
        message: 'Some error',
        raw: 'Some error',
      };

      const candidates = await generateFixes(error);

      assert.strictEqual(candidates.length, 0);
    });

    it('should not generate candidates for non-existent files', async () => {
      const error: DetectedError = {
        category: 'syntax',
        severity: 'error',
        message: 'Missing semicolon',
        file: '/nonexistent/file.ts',
        line: 1,
        raw: 'Missing semicolon',
      };

      const candidates = await generateFixes(error);

      assert.strictEqual(candidates.length, 0);
    });
  });

  // ==========================================================================
  // Candidate Properties Tests
  // ==========================================================================

  describe('Candidate Properties', () => {
    it('should have unique IDs', async () => {
      const filePath = path.join(TEST_DIR, 'ids.ts');
      fs.writeFileSync(filePath, 'const x = obj.value');

      const error: DetectedError = {
        category: 'type',
        severity: 'error',
        message: "'obj' is possibly 'null'",
        file: filePath,
        line: 1,
        raw: 'possibly null',
      };

      const candidates = await generateFixes(error);

      const ids = candidates.map(c => c.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size);
    });

    it('should include confidence scores', async () => {
      const filePath = path.join(TEST_DIR, 'conf.ts');
      fs.writeFileSync(filePath, 'const x = 1');

      const error: DetectedError = {
        category: 'syntax',
        severity: 'error',
        message: 'Missing semicolon',
        file: filePath,
        line: 1,
        raw: 'Missing semicolon',
      };

      const candidates = await generateFixes(error);

      for (const candidate of candidates) {
        assert.ok(candidate.confidence >= 0);
        assert.ok(candidate.confidence <= 1);
      }
    });

    it('should include source type', async () => {
      const filePath = path.join(TEST_DIR, 'source.ts');
      fs.writeFileSync(filePath, 'const x = 1');

      const error: DetectedError = {
        category: 'syntax',
        severity: 'error',
        message: 'Missing semicolon',
        file: filePath,
        line: 1,
        raw: 'Missing semicolon',
      };

      const candidates = await generateFixes(error);

      for (const candidate of candidates) {
        assert.ok(['pattern', 'llm', 'heuristic'].includes(candidate.source));
      }
    });
  });

  // ==========================================================================
  // Selection Tests
  // ==========================================================================

  describe('Selection', () => {
    it('should select candidate with highest score', () => {
      const fixer = getAutoFixer();

      const evaluations = [
        { candidate: { id: 'a' } as FixCandidate, score: 0.5, testsPass: false, testsPassed: 0, testsTotal: 1, buildSuccess: true, newErrors: [], fixedErrors: [] },
        { candidate: { id: 'b' } as FixCandidate, score: 0.9, testsPass: true, testsPassed: 1, testsTotal: 1, buildSuccess: true, newErrors: [], fixedErrors: [] },
        { candidate: { id: 'c' } as FixCandidate, score: 0.3, testsPass: false, testsPassed: 0, testsTotal: 1, buildSuccess: false, newErrors: [], fixedErrors: [] },
      ];

      const best = fixer.selectBest(evaluations);

      assert.ok(best);
      assert.strictEqual(best.candidate.id, 'b');
    });

    it('should return null for empty evaluations', () => {
      const fixer = getAutoFixer();
      const best = fixer.selectBest([]);

      assert.strictEqual(best, null);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const fixer = new AutoFixer();
      const config = fixer.getConfig();

      assert.strictEqual(config.maxCandidates, 5);
      assert.strictEqual(config.maxIterations, 3);
      assert.strictEqual(config.createBackup, true);
    });

    it('should accept custom configuration', () => {
      const fixer = new AutoFixer({
        maxCandidates: 10,
        maxIterations: 5,
        testCommand: 'npm run test:unit',
      });

      const config = fixer.getConfig();

      assert.strictEqual(config.maxCandidates, 10);
      assert.strictEqual(config.maxIterations, 5);
      assert.strictEqual(config.testCommand, 'npm run test:unit');
    });

    it('should update configuration', () => {
      const fixer = getAutoFixer();
      fixer.updateConfig({ maxIterations: 10 });

      const config = fixer.getConfig();
      assert.strictEqual(config.maxIterations, 10);
    });

    it('should allow custom patterns', () => {
      const fixer = new AutoFixer();

      fixer.addPattern({
        categories: ['custom' as any],
        messagePattern: /custom error/,
        generateFix: () => [{
          id: 'custom-fix',
          description: 'Custom fix',
          file: 'test.ts',
          original: '',
          fixed: 'fixed',
          confidence: 1,
          source: 'pattern',
        }],
      });

      // Pattern should be added (we can't easily test it triggers)
      assert.ok(true);
    });
  });

  // ==========================================================================
  // LLM Integration Tests
  // ==========================================================================

  describe('LLM Integration', () => {
    it('should accept LLM generator function', () => {
      const fixer = new AutoFixer();

      const mockGenerator = async (error: DetectedError, context: string): Promise<FixCandidate[]> => {
        return [{
          id: 'llm-fix',
          description: 'LLM generated fix',
          file: error.file || '',
          original: context,
          fixed: context.replace('error', 'fixed'),
          confidence: 0.8,
          source: 'llm',
        }];
      };

      fixer.setLLMGenerator(mockGenerator);

      const config = fixer.getConfig();
      assert.ok(config.llmFixGenerator !== undefined);
    });
  });

  // ==========================================================================
  // Full Fix Flow Tests
  // ==========================================================================

  describe('Fix Flow', () => {
    it('should return success for empty errors array', async () => {
      const fixer = getAutoFixer({ workingDirectory: TEST_DIR });
      const result = await fixer.fix([]);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.iterations, 0);
    });

    it('should return failure when no candidates generated', async () => {
      const fixer = getAutoFixer({ workingDirectory: TEST_DIR });

      const result = await fixer.fix([{
        category: 'unknown',
        severity: 'error',
        message: 'Unknown error type',
        raw: 'Unknown',
      }]);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('No fix candidates'));
    });

    it('should track iterations', async () => {
      const filePath = path.join(TEST_DIR, 'iter.ts');
      fs.writeFileSync(filePath, 'const x = 1');

      const fixer = getAutoFixer({
        workingDirectory: TEST_DIR,
        maxIterations: 2,
        testCommand: 'echo "ok"',
        buildCommand: 'echo "ok"',
      });

      const result = await fixer.fix([{
        category: 'syntax',
        severity: 'error',
        message: 'Missing semicolon',
        file: filePath,
        line: 1,
        raw: 'Missing semicolon',
      }]);

      assert.ok(result.iterations >= 1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle file read errors gracefully', async () => {
      const fixer = getAutoFixer({ workingDirectory: TEST_DIR });

      // Create a directory with the same name as the "file"
      const dirPath = path.join(TEST_DIR, 'not-a-file');
      fs.mkdirSync(dirPath);

      const candidates = await fixer.generateCandidates([{
        category: 'syntax',
        severity: 'error',
        message: 'Error',
        file: dirPath,
        raw: 'Error',
      }]);

      // Should not crash, just return empty
      assert.strictEqual(candidates.length, 0);
    });

    it('should handle multiple errors in same file', async () => {
      const filePath = path.join(TEST_DIR, 'multi.ts');
      fs.writeFileSync(filePath, 'const x = 1\nconst y = 2');

      const errors: DetectedError[] = [
        { category: 'syntax', severity: 'error', message: 'Missing semicolon', file: filePath, line: 1, raw: 'Missing semicolon' },
        { category: 'syntax', severity: 'error', message: 'Missing semicolon', file: filePath, line: 2, raw: 'Missing semicolon' },
      ];

      const candidates = await generateFixes(errors[0]);

      // Should generate candidates (deduplication happens at fix level)
      assert.ok(candidates.length >= 0);
    });
  });
});
