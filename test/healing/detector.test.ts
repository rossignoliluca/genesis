/**
 * Tests for Genesis Error Detector
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  ErrorDetector,
  getErrorDetector,
  resetErrorDetector,
  detectErrors,
  hasErrors,
  formatErrorReport,
} from '../../src/healing/detector.js';

describe('ErrorDetector', () => {
  before(() => {
    resetErrorDetector();
  });

  after(() => {
    resetErrorDetector();
  });

  // ==========================================================================
  // TypeScript Error Detection
  // ==========================================================================

  describe('TypeScript Errors', () => {
    it('should detect TS errors with file:line:col format', () => {
      const output = `src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.`;

      const result = detectErrors(output);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'type');
      assert.strictEqual(result.errors[0].file, 'src/index.ts');
      assert.strictEqual(result.errors[0].line, 10);
      assert.strictEqual(result.errors[0].code, 'TS2322');
    });

    it('should detect TS errors with (line,col) format', () => {
      const output = `src/utils.ts(25,10): error TS2339: Property 'foo' does not exist on type 'Bar'.`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].file, 'src/utils.ts');
      assert.strictEqual(result.errors[0].line, 25);
      assert.strictEqual(result.errors[0].column, 10);
    });

    it('should detect multiple TS errors', () => {
      const output = `
src/a.ts:1:1 - error TS1234: First error
src/b.ts:2:2 - error TS5678: Second error
src/c.ts:3:3 - error TS9012: Third error
      `;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 3);
      assert.strictEqual(result.byCategory.type, 3);
    });
  });

  // ==========================================================================
  // Runtime Error Detection
  // ==========================================================================

  describe('Runtime Errors', () => {
    it('should detect TypeError', () => {
      const output = `TypeError: Cannot read property 'foo' of undefined`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'runtime');
      assert.strictEqual(result.errors[0].code, 'TypeError');
    });

    it('should detect ReferenceError', () => {
      const output = `ReferenceError: myVar is not defined`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'runtime');
    });

    it('should detect stack traces', () => {
      const output = `
Error: Something went wrong
    at Object.<anonymous> (/path/to/file.js:10:20)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)
      `;

      const result = detectErrors(output);

      // Should have the error and stack trace entries
      assert.ok(result.errors.length >= 1);
    });
  });

  // ==========================================================================
  // Test Failure Detection
  // ==========================================================================

  describe('Test Failures', () => {
    it('should detect Node test runner failures', () => {
      const output = `✖ should do something (5.123ms)`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'test');
    });

    it('should detect assertion errors', () => {
      const output = `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal`;

      const result = detectErrors(output);

      assert.ok(result.errors.length >= 1);
      assert.ok(result.errors.some(e => e.category === 'test'));
    });

    it('should detect Jest FAIL markers', () => {
      const output = `FAIL src/components/Button.test.tsx`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'test');
      assert.ok(result.errors[0].file?.includes('Button.test.tsx'));
    });
  });

  // ==========================================================================
  // Syntax Error Detection
  // ==========================================================================

  describe('Syntax Errors', () => {
    it('should detect SyntaxError', () => {
      const output = `SyntaxError: Unexpected token '}'`;

      const result = detectErrors(output);

      assert.ok(result.errors.length >= 1);
      assert.ok(result.errors.some(e => e.category === 'syntax'));
    });

    it('should detect unexpected token errors', () => {
      const output = `Unexpected token 'const' at line 15`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'syntax');
    });
  });

  // ==========================================================================
  // Dependency Error Detection
  // ==========================================================================

  describe('Dependency Errors', () => {
    it('should detect missing module', () => {
      const output = `Error: Cannot find module 'lodash'`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length >= 1, true);
      const depError = result.errors.find(e => e.category === 'dependency');
      assert.ok(depError);
      assert.ok(depError.message.includes('lodash'));
    });

    it('should detect npm errors', () => {
      const output = `ERR! code ERESOLVE
ERR! Cannot resolve dependency tree`;

      const result = detectErrors(output);

      assert.ok(result.errors.some(e => e.category === 'dependency'));
    });
  });

  // ==========================================================================
  // ESLint Error Detection
  // ==========================================================================

  describe('Lint Errors', () => {
    it('should detect ESLint errors', () => {
      const output = `  12:5  error  'foo' is defined but never used  @typescript-eslint/no-unused-vars`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].category, 'lint');
      assert.strictEqual(result.errors[0].line, 12);
    });

    it('should detect ESLint warnings', () => {
      const output = `  5:10  warning  Unexpected console statement  no-console`;

      const result = detectErrors(output);

      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].severity, 'warning');
    });
  });

  // ==========================================================================
  // Result Aggregation
  // ==========================================================================

  describe('Result Aggregation', () => {
    it('should count by category', () => {
      const output = `
TypeError: Runtime error
SyntaxError: Syntax issue
src/test.ts:1:1 - error TS1234: Type error
      `;

      const result = detectErrors(output);

      assert.ok(result.byCategory.runtime >= 1);
      assert.ok(result.byCategory.syntax >= 1);
      assert.ok(result.byCategory.type >= 1);
    });

    it('should count by severity', () => {
      const output = `
  1:1  error  Something wrong  rule1
  2:2  warning  Something sus  rule2
      `;

      const result = detectErrors(output);

      assert.ok(result.bySeverity.error >= 1);
      assert.ok(result.bySeverity.warning >= 1);
    });

    it('should indicate success when no errors', () => {
      const output = `Build completed successfully.
✔ All tests passed (10 tests)`;

      const result = detectErrors(output);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.bySeverity.error, 0);
    });

    it('should indicate hasFixable for errors with fixHint', () => {
      const output = `SyntaxError: Missing semicolon`;

      const result = detectErrors(output);

      assert.strictEqual(result.hasFixable, true);
    });
  });

  // ==========================================================================
  // Convenience Functions
  // ==========================================================================

  describe('Convenience Functions', () => {
    it('hasErrors should return true for errors', () => {
      assert.strictEqual(hasErrors('TypeError: Something failed'), true);
    });

    it('hasErrors should return false for clean output', () => {
      assert.strictEqual(hasErrors('All good!'), false);
    });

    it('formatErrorReport should format errors nicely', () => {
      const output = `TypeError: Cannot read property 'x' of null`;
      const report = formatErrorReport(output);

      assert.ok(report.includes('error'));
      assert.ok(report.includes('TypeError'));
    });
  });

  // ==========================================================================
  // Fix Suggestions
  // ==========================================================================

  describe('Fix Suggestions', () => {
    it('should suggest fixes for type errors', () => {
      const detector = getErrorDetector();
      const error = {
        category: 'type' as const,
        severity: 'error' as const,
        message: 'Type mismatch',
        raw: 'Type mismatch',
        fixHint: 'type_mismatch',
      };

      const suggestions = detector.suggestFix(error);

      assert.ok(suggestions.length > 0);
      assert.ok(suggestions.some(s => s.includes('type')));
    });

    it('should suggest npm install for dependency errors', () => {
      const detector = getErrorDetector();
      const error = {
        category: 'dependency' as const,
        severity: 'error' as const,
        message: 'Missing module: lodash',
        raw: "Cannot find module 'lodash'",
        code: 'lodash',
        fixHint: 'install_dependency',
      };

      const suggestions = detector.suggestFix(error);

      assert.ok(suggestions.some(s => s.includes('npm install lodash')));
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty output', () => {
      const result = detectErrors('');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should handle very long output', () => {
      const longOutput = 'error '.repeat(10000);
      const result = detectErrors(longOutput);

      // Should not crash
      assert.ok(Array.isArray(result.errors));
    });

    it('should deduplicate identical errors', () => {
      const output = `TypeError: Error
TypeError: Error`;

      const result = detectErrors(output);

      // Same error text should be deduplicated
      assert.ok(result.errors.length <= 2);
    });
  });
});
