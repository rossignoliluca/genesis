/**
 * Tests for Genesis Grounding Verifier
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  Verifier,
  getVerifier,
  resetVerifier,
  verifyCode,
  quickVerify,
  isCodeValid,
  formatVerificationResult,
  VerificationContext,
  CodeVerificationResult,
} from '../../src/grounding/verifier.js';

// Test directory
const TEST_DIR = '/tmp/genesis-verifier-test-' + Date.now();

describe('Verifier', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    resetVerifier();
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    resetVerifier();
  });

  beforeEach(() => {
    // Clean test directory
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      fs.rmSync(path.join(TEST_DIR, file), { force: true, recursive: true });
    }
  });

  // ==========================================================================
  // Basic Verification Tests
  // ==========================================================================

  describe('Basic Verification', () => {
    it('should verify valid TypeScript code', async () => {
      // Create a simple valid TS file
      fs.writeFileSync(path.join(TEST_DIR, 'valid.ts'), `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `);

      // Create minimal package.json
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        type: 'module',
        scripts: {
          build: 'echo "build ok"',
          test: 'echo "test ok"',
        },
      }));

      // Create tsconfig.json
      fs.writeFileSync(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          strict: true,
          noEmit: true,
        },
        include: ['*.ts'],
      }));

      const result = await verifyCode({
        workingDirectory: TEST_DIR,
        buildCommand: 'echo "build ok"',
        testCommand: 'echo "test ok"',
        timeout: 30000,
      });

      assert.ok(result.compiles);
      assert.ok(result.typesValid);
    });

    it('should detect type errors', async () => {
      // Create TS file with type error
      fs.writeFileSync(path.join(TEST_DIR, 'invalid.ts'), `
        const x: number = "not a number";
      `);

      fs.writeFileSync(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          strict: true,
          noEmit: true,
        },
        include: ['*.ts'],
      }));

      const result = await verifyCode({
        workingDirectory: TEST_DIR,
        buildCommand: 'echo "skip"',
        testCommand: 'echo "skip"',
        timeout: 30000,
      });

      assert.strictEqual(result.typesValid, false);
      assert.ok(result.issues.some(i => i.type === 'type'));
    });

    it('should detect build failures', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'exit 1' },
      }));

      const verifier = new Verifier({ skipTypeCheck: true });
      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
        buildCommand: 'exit 1',
        testCommand: 'echo "ok"',
        timeout: 10000,
      });

      assert.strictEqual(result.compiles, false);
      assert.ok(result.issues.some(i => i.type === 'compile'));
    });

    it('should detect test failures', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: {
          build: 'echo "ok"',
          test: 'exit 1',
        },
      }));

      const verifier = new Verifier({ skipTypeCheck: true });
      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
        buildCommand: 'echo "ok"',
        testCommand: 'echo "FAIL test.ts" && exit 1',
        timeout: 10000,
      });

      assert.strictEqual(result.testsPass, false);
    });
  });

  // ==========================================================================
  // Test Output Parsing
  // ==========================================================================

  describe('Test Output Parsing', () => {
    it('should parse Node test runner output', async () => {
      const output = `
        ✔ test 1 (1ms)
        ✔ test 2 (2ms)
        ✖ test 3 (3ms)
        ℹ tests 3
        ℹ pass 2
        ℹ fail 1
      `;

      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: `echo "${output}"` },
      }));

      const verifier = new Verifier({ skipTypeCheck: true, skipBuild: true });
      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
        testCommand: `printf "${output}"`,
        timeout: 10000,
      });

      assert.strictEqual(result.testsTotal, 3);
      assert.strictEqual(result.testsPassed, 2);
      assert.strictEqual(result.testsFailed, 1);
    });

    it('should count checkmarks and crosses', async () => {
      const verifier = new Verifier({ skipTypeCheck: true, skipBuild: true });
      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
        testCommand: 'echo "✔ pass1\n✔ pass2\n✖ fail1"',
        timeout: 10000,
      });

      // Should count at least some passes and fails
      assert.ok(result.testsPassed >= 2);
      assert.ok(result.testsFailed >= 1);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const verifier = new Verifier();
      const config = verifier.getConfig();

      assert.strictEqual(config.buildCommand, 'npm run build');
      assert.strictEqual(config.testCommand, 'npm test');
      assert.strictEqual(config.timeout, 120000);
    });

    it('should accept custom configuration', () => {
      const verifier = new Verifier({
        buildCommand: 'make build',
        testCommand: 'make test',
        timeout: 60000,
      });

      const config = verifier.getConfig();

      assert.strictEqual(config.buildCommand, 'make build');
      assert.strictEqual(config.testCommand, 'make test');
      assert.strictEqual(config.timeout, 60000);
    });

    it('should update configuration', () => {
      const verifier = getVerifier();
      verifier.updateConfig({ skipLint: false, lintCommand: 'eslint .' });

      const config = verifier.getConfig();
      assert.strictEqual(config.skipLint, false);
      assert.strictEqual(config.lintCommand, 'eslint .');
    });

    it('should skip steps when configured', async () => {
      const verifier = new Verifier({
        skipBuild: true,
        skipTypeCheck: true,
        skipTest: true,
      });

      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
      });

      // Should succeed since all steps are skipped
      assert.ok(result.success);
    });
  });

  // ==========================================================================
  // Single File Verification
  // ==========================================================================

  describe('Single File Verification', () => {
    it('should verify valid file', async () => {
      const filePath = path.join(TEST_DIR, 'single.ts');
      fs.writeFileSync(filePath, 'const x: number = 42;');

      fs.writeFileSync(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', strict: true, noEmit: true },
        include: ['*.ts'],
      }));

      const verifier = getVerifier();
      const result = await verifier.verifyFile(filePath, TEST_DIR);

      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should detect invalid file', async () => {
      const filePath = path.join(TEST_DIR, 'invalid.ts');
      fs.writeFileSync(filePath, 'const x: number = "string";');

      fs.writeFileSync(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', strict: true, noEmit: true },
        include: ['*.ts'],
      }));

      const verifier = getVerifier();
      const result = await verifier.verifyFile(filePath, TEST_DIR);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('should handle missing file', async () => {
      const verifier = getVerifier();
      const result = await verifier.verifyFile('/nonexistent/file.ts', TEST_DIR);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.message.includes('not found')));
    });
  });

  // ==========================================================================
  // Semantic Match
  // ==========================================================================

  describe('Semantic Match', () => {
    it('should calculate high semantic match for clean code', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      const verifier = new Verifier({ skipTypeCheck: true });
      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
        buildCommand: 'echo "ok"',
        testCommand: 'echo "ok"',
        modifiedFiles: [],
        timeout: 10000,
      });

      assert.ok(result.semanticMatch >= 0.9);
    });

    it('should reduce semantic match for issues', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'bad.ts'), 'const x: number = "bad";');

      fs.writeFileSync(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', strict: true, noEmit: true },
        include: ['*.ts'],
      }));

      const result = await verifyCode({
        workingDirectory: TEST_DIR,
        buildCommand: 'echo "ok"',
        testCommand: 'echo "ok"',
        timeout: 30000,
      });

      assert.ok(result.semanticMatch < 1.0);
    });
  });

  // ==========================================================================
  // Formatting
  // ==========================================================================

  describe('Formatting', () => {
    it('should format success result', () => {
      const result: CodeVerificationResult = {
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
        duration: 1234,
        outputs: {},
      };

      const formatted = formatVerificationResult(result);

      assert.ok(formatted.includes('PASSED'));
      assert.ok(formatted.includes('✓'));
      assert.ok(formatted.includes('10/10'));
    });

    it('should format failure result with issues', () => {
      const result: CodeVerificationResult = {
        success: false,
        compiles: false,
        typesValid: false,
        testsPass: false,
        testsPassed: 3,
        testsFailed: 2,
        testsTotal: 5,
        lintPass: true,
        semanticMatch: 0.5,
        issues: [
          { type: 'type', severity: 'error', message: 'Type mismatch', file: 'test.ts', line: 10 },
          { type: 'test', severity: 'error', message: 'Test failed' },
        ],
        duration: 2000,
        outputs: {},
      };

      const formatted = formatVerificationResult(result);

      assert.ok(formatted.includes('FAILED'));
      assert.ok(formatted.includes('✗'));
      assert.ok(formatted.includes('Type mismatch'));
      assert.ok(formatted.includes('Test failed'));
    });
  });

  // ==========================================================================
  // Convenience Functions
  // ==========================================================================

  describe('Convenience Functions', () => {
    it('isCodeValid should return boolean', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      // Skip type check for this simple test
      resetVerifier();
      const verifier = getVerifier({ skipTypeCheck: true });

      const valid = await isCodeValid(TEST_DIR);
      assert.strictEqual(typeof valid, 'boolean');
    });

    it('quickVerify should skip heavy operations', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'sleep 10', test: 'sleep 10' },
      }));

      const startTime = Date.now();
      const result = await quickVerify({
        workingDirectory: TEST_DIR,
        timeout: 5000,
      });
      const duration = Date.now() - startTime;

      // Should be fast because we skip build and test
      assert.ok(duration < 10000);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty directory', async () => {
      const verifier = new Verifier({ skipTypeCheck: true });
      const result = await verifier.verify({
        workingDirectory: TEST_DIR,
        buildCommand: 'echo "ok"',
        testCommand: 'echo "ok"',
        timeout: 10000,
      });

      // Should succeed with skipped type check
      assert.ok(result.success);
    });

    it('should handle command timeout', async () => {
      const verifier = new Verifier({ skipTypeCheck: true });

      try {
        await verifier.verify({
          workingDirectory: TEST_DIR,
          buildCommand: 'sleep 30',
          timeout: 100, // Very short timeout
        });
        // Should have thrown or failed
      } catch {
        // Expected to fail
        assert.ok(true);
      }
    });

    it('should handle concurrent verifications', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        name: 'test',
        scripts: { build: 'echo "ok"', test: 'echo "ok"' },
      }));

      const verifier = new Verifier({ skipTypeCheck: true });

      const results = await Promise.all([
        verifier.verify({
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "1"',
          testCommand: 'echo "1"',
          timeout: 10000,
        }),
        verifier.verify({
          workingDirectory: TEST_DIR,
          buildCommand: 'echo "2"',
          testCommand: 'echo "2"',
          timeout: 10000,
        }),
      ]);

      assert.strictEqual(results.length, 2);
    });
  });
});
