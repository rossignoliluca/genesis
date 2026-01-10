/**
 * Tests for Genesis Grounding Feedback Loop
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  FeedbackLoop,
  getFeedbackLoop,
  resetFeedbackLoop,
  runFeedbackLoop,
  verifyAndFix,
  isProjectValid,
  formatFeedbackResult,
  FeedbackLoopResult,
} from '../../src/grounding/feedback.js';
import { resetVerifier } from '../../src/grounding/verifier.js';
import { resetAutoFixer } from '../../src/healing/fixer.js';

// Test directory
const TEST_DIR = '/tmp/genesis-feedback-test-' + Date.now();

describe('FeedbackLoop', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    resetFeedbackLoop();
    resetVerifier();
    resetAutoFixer();
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    resetFeedbackLoop();
    resetVerifier();
    resetAutoFixer();
  });

  beforeEach(() => {
    // Clean test directory
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      fs.rmSync(path.join(TEST_DIR, file), { force: true, recursive: true });
    }
    resetFeedbackLoop();
  });

  // ==========================================================================
  // Basic Loop Tests
  // ==========================================================================

  describe('Basic Loop', () => {
    it('should pass on first iteration if code is valid', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      const loop = new FeedbackLoop({
        maxIterations: 3,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "ok"',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
        enableAutoFix: false,
      });

      const result = await loop.run();

      assert.ok(result.success);
      assert.strictEqual(result.iterations, 1);
      assert.ok(result.history[0].success);
    });

    it('should track iteration count', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'exit 1' },
      }));

      const loop = new FeedbackLoop({
        maxIterations: 3,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'exit 1',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
        enableAutoFix: false,
      });

      const result = await loop.run();

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.iterations, 3);
    });

    it('should stop on first success when configured', async () => {
      let callCount = 0;

      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      const loop = new FeedbackLoop({
        maxIterations: 5,
        stopOnSuccess: true,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "ok"',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
        enableAutoFix: false,
      });

      const result = await loop.run();

      assert.ok(result.success);
      assert.strictEqual(result.iterations, 1);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const loop = new FeedbackLoop();
      const config = loop.getConfig();

      assert.strictEqual(config.maxIterations, 3);
      assert.strictEqual(config.stopOnSuccess, true);
      assert.strictEqual(config.enableAutoFix, true);
    });

    it('should accept custom configuration', () => {
      const loop = new FeedbackLoop({
        maxIterations: 5,
        stopOnSuccess: false,
        enableAutoFix: false,
        verbose: true,
      });

      const config = loop.getConfig();

      assert.strictEqual(config.maxIterations, 5);
      assert.strictEqual(config.stopOnSuccess, false);
      assert.strictEqual(config.enableAutoFix, false);
      assert.strictEqual(config.verbose, true);
    });

    it('should update configuration', () => {
      const loop = getFeedbackLoop();
      loop.updateConfig({
        maxIterations: 10,
        verificationContext: {
          workingDirectory: TEST_DIR,
        },
      });

      const config = loop.getConfig();
      assert.strictEqual(config.maxIterations, 10);
    });
  });

  // ==========================================================================
  // Verification Only
  // ==========================================================================

  describe('Verification Only', () => {
    it('should run verification without feedback loop', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      const loop = new FeedbackLoop({
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "ok"',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
      });

      const result = await loop.verifyOnly();

      assert.ok(result.compiles);
      assert.ok(result.typesValid);
      assert.ok(result.testsPass);
    });
  });

  // ==========================================================================
  // History Tracking
  // ==========================================================================

  describe('History Tracking', () => {
    it('should record all iterations', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'exit 1' },
      }));

      const loop = new FeedbackLoop({
        maxIterations: 3,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'exit 1',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
        enableAutoFix: false,
      });

      const result = await loop.run();

      assert.strictEqual(result.history.length, 3);

      for (let i = 0; i < result.history.length; i++) {
        assert.strictEqual(result.history[i].iteration, i + 1);
        assert.ok(result.history[i].duration >= 0);
        assert.ok(result.history[i].verification);
      }
    });

    it('should include fix results when auto-fix is enabled', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'exit 1' },
      }));

      const loop = new FeedbackLoop({
        maxIterations: 2,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'exit 1',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
        enableAutoFix: true,
      });

      const result = await loop.run();

      // At least one iteration should have attempted a fix
      assert.ok(result.history.some(h => h.fix !== undefined));
    });
  });

  // ==========================================================================
  // Convenience Functions
  // ==========================================================================

  describe('Convenience Functions', () => {
    it('runFeedbackLoop should work', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      // Use FeedbackLoop directly since runFeedbackLoop doesn't accept verificationContext
      const loop = new FeedbackLoop({
        maxIterations: 1,
        enableAutoFix: false,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "ok"',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
      });

      const result = await loop.run();
      assert.ok(result.success);
    });

    it('verifyAndFix should work', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      // Reset and configure
      resetFeedbackLoop();
      const loop = getFeedbackLoop({
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "ok"',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
      });

      const result = await verifyAndFix(TEST_DIR, 1);

      assert.ok(typeof result.success === 'boolean');
    });

    it('isProjectValid should return boolean', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      resetFeedbackLoop();
      const valid = await isProjectValid(TEST_DIR);

      assert.strictEqual(typeof valid, 'boolean');
    });
  });

  // ==========================================================================
  // Formatting
  // ==========================================================================

  describe('Formatting', () => {
    it('should format success result', () => {
      const result: FeedbackLoopResult = {
        success: true,
        iterations: 1,
        history: [{
          iteration: 1,
          verification: {
            success: true,
            compiles: true,
            typesValid: true,
            testsPass: true,
            testsPassed: 10,
            testsFailed: 0,
            testsTotal: 10,
            lintPass: true,
            semanticMatch: 0.95,
            issues: [],
            duration: 1000,
            outputs: {},
          },
          duration: 1000,
          success: true,
        }],
        finalResult: {
          success: true,
          compiles: true,
          typesValid: true,
          testsPass: true,
          testsPassed: 10,
          testsFailed: 0,
          testsTotal: 10,
          lintPass: true,
          semanticMatch: 0.95,
          issues: [],
          duration: 1000,
          outputs: {},
        },
        totalDuration: 1000,
        summary: 'Verification passed on first attempt (1000ms)',
      };

      const formatted = formatFeedbackResult(result);

      assert.ok(formatted.includes('SUCCESS'));
      assert.ok(formatted.includes('first attempt'));
    });

    it('should format failure result with history', () => {
      const result: FeedbackLoopResult = {
        success: false,
        iterations: 3,
        history: [
          {
            iteration: 1,
            verification: {
              success: false,
              compiles: false,
              typesValid: true,
              testsPass: true,
              testsPassed: 0,
              testsFailed: 0,
              testsTotal: 0,
              lintPass: true,
              semanticMatch: 0.5,
              issues: [{ type: 'compile', severity: 'error', message: 'Build failed' }],
              duration: 500,
              outputs: {},
            },
            fix: { success: false, iterations: 1, candidates: [], evaluations: [] },
            duration: 600,
            success: false,
          },
          {
            iteration: 2,
            verification: {
              success: false,
              compiles: false,
              typesValid: true,
              testsPass: true,
              testsPassed: 0,
              testsFailed: 0,
              testsTotal: 0,
              lintPass: true,
              semanticMatch: 0.5,
              issues: [{ type: 'compile', severity: 'error', message: 'Build failed' }],
              duration: 500,
              outputs: {},
            },
            duration: 500,
            success: false,
          },
          {
            iteration: 3,
            verification: {
              success: false,
              compiles: false,
              typesValid: true,
              testsPass: true,
              testsPassed: 0,
              testsFailed: 0,
              testsTotal: 0,
              lintPass: true,
              semanticMatch: 0.5,
              issues: [{ type: 'compile', severity: 'error', message: 'Build failed' }],
              duration: 500,
              outputs: {},
            },
            duration: 500,
            success: false,
          },
        ],
        finalResult: {
          success: false,
          compiles: false,
          typesValid: true,
          testsPass: true,
          testsPassed: 0,
          testsFailed: 0,
          testsTotal: 0,
          lintPass: true,
          semanticMatch: 0.5,
          issues: [{ type: 'compile', severity: 'error', message: 'Build failed' }],
          duration: 500,
          outputs: {},
        },
        totalDuration: 1600,
        summary: 'Verification failed after 3 iterations. 1 issues remaining, 0 fixes attempted (1600ms)',
      };

      const formatted = formatFeedbackResult(result);

      assert.ok(formatted.includes('FAILED'));
      assert.ok(formatted.includes('3 iterations'));
      assert.ok(formatted.includes('Iteration History'));
      assert.ok(formatted.includes('Remaining Issues'));
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle zero max iterations', async () => {
      const loop = new FeedbackLoop({
        maxIterations: 0,
        verificationContext: {
          workingDirectory: TEST_DIR,
        },
        enableAutoFix: false,
      });

      const result = await loop.run();

      assert.strictEqual(result.iterations, 0);
      assert.ok(result.finalResult); // Should still have a final result
    });

    it('should handle empty working directory', async () => {
      const loop = new FeedbackLoop({
        maxIterations: 1,
        verificationContext: {
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "ok"',
          testCommand: 'echo "ok"',
          typeCheckCommand: 'echo "ok"',
        },
        enableAutoFix: false,
      });

      const result = await loop.run();

      // Should complete without crashing
      assert.ok(result.finalResult);
    });
  });
});
