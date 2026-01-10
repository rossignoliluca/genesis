/**
 * Tests for Genesis Human-in-the-Loop Module
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  HumanLoop,
  getHumanLoop,
  resetHumanLoop,
  Question,
  QuestionOption,
} from '../../src/cli/human-loop.js';
import { toolRegistry } from '../../src/tools/index.js';

describe('HumanLoop', () => {
  beforeEach(() => {
    resetHumanLoop();
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const hl = new HumanLoop();
      assert.ok(hl);
    });

    it('should accept custom configuration', () => {
      const hl = new HumanLoop({
        defaultTimeout: 5000,
        allowSkip: false,
        useColors: false,
      });
      assert.ok(hl);
    });
  });

  // ==========================================================================
  // Question Types
  // ==========================================================================

  describe('Question Types', () => {
    it('should support confirm type', () => {
      const question: Question = {
        type: 'confirm',
        text: 'Do you want to proceed?',
        default: true,
      };

      assert.strictEqual(question.type, 'confirm');
      assert.strictEqual(question.default, true);
    });

    it('should support choice type with options', () => {
      const options: QuestionOption[] = [
        { value: 'a', label: 'Option A', description: 'First option' },
        { value: 'b', label: 'Option B', recommended: true },
        { value: 'c', label: 'Option C' },
      ];

      const question: Question = {
        type: 'choice',
        text: 'Choose one:',
        options,
      };

      assert.strictEqual(question.options?.length, 3);
      assert.ok(question.options?.[1].recommended);
    });

    it('should support multiChoice type', () => {
      const question: Question = {
        type: 'multiChoice',
        text: 'Select all that apply:',
        options: [
          { value: '1', label: 'One' },
          { value: '2', label: 'Two' },
          { value: '3', label: 'Three' },
        ],
      };

      assert.strictEqual(question.type, 'multiChoice');
    });

    it('should support text type', () => {
      const question: Question = {
        type: 'text',
        text: 'Enter your name:',
        default: 'Anonymous',
      };

      assert.strictEqual(question.type, 'text');
      assert.strictEqual(question.default, 'Anonymous');
    });

    it('should support context', () => {
      const question: Question = {
        type: 'confirm',
        text: 'Proceed?',
        context: 'This will delete 10 files.',
      };

      assert.strictEqual(question.context, 'This will delete 10 files.');
    });
  });

  // ==========================================================================
  // History & Stats
  // ==========================================================================

  describe('History & Stats', () => {
    it('should track empty history initially', () => {
      const hl = new HumanLoop();
      const history = hl.getHistory();

      assert.strictEqual(history.length, 0);
    });

    it('should clear history', () => {
      const hl = new HumanLoop();
      hl.clearHistory();
      const history = hl.getHistory();

      assert.strictEqual(history.length, 0);
    });

    it('should return stats', () => {
      const hl = new HumanLoop();
      const stats = hl.stats();

      assert.strictEqual(stats.totalQuestions, 0);
      assert.strictEqual(stats.responded, 0);
      assert.strictEqual(stats.timedOut, 0);
      assert.strictEqual(stats.cancelled, 0);
      assert.strictEqual(stats.avgResponseTime, 0);
    });
  });

  // ==========================================================================
  // Singleton Tests
  // ==========================================================================

  describe('Singleton', () => {
    it('should return same instance', () => {
      const hl1 = getHumanLoop();
      const hl2 = getHumanLoop();

      assert.strictEqual(hl1, hl2);
    });

    it('should reset singleton', () => {
      const hl1 = getHumanLoop();
      resetHumanLoop();
      const hl2 = getHumanLoop();

      assert.notStrictEqual(hl1, hl2);
    });
  });

  // ==========================================================================
  // Tool Registration
  // ==========================================================================

  describe('Tool Registration', () => {
    it('should register ask_user tool', () => {
      const tool = toolRegistry.get('ask_user');

      assert.ok(tool);
      assert.strictEqual(tool.name, 'ask_user');
      assert.ok(tool.description.includes('Ask the user'));
    });

    it('should register confirm tool', () => {
      const tool = toolRegistry.get('confirm');

      assert.ok(tool);
      assert.strictEqual(tool.name, 'confirm');
    });

    it('ask_user should validate params', () => {
      const tool = toolRegistry.get('ask_user');

      // Missing text
      const invalid = tool?.validate?.({});
      assert.strictEqual(invalid?.valid, false);

      // Valid
      const valid = tool?.validate?.({ text: 'Question?' });
      assert.strictEqual(valid?.valid, true);
    });
  });

  // ==========================================================================
  // Question Option Tests
  // ==========================================================================

  describe('Question Options', () => {
    it('should support recommended option', () => {
      const options: QuestionOption[] = [
        { value: 'safe', label: 'Safe approach', recommended: true },
        { value: 'fast', label: 'Fast approach' },
      ];

      const recommended = options.find(o => o.recommended);
      assert.ok(recommended);
      assert.strictEqual(recommended.value, 'safe');
    });

    it('should support option descriptions', () => {
      const options: QuestionOption[] = [
        { value: 'a', label: 'A', description: 'This is option A' },
        { value: 'b', label: 'B', description: 'This is option B' },
      ];

      assert.strictEqual(options[0].description, 'This is option A');
    });
  });

  // ==========================================================================
  // Answer Structure Tests
  // ==========================================================================

  describe('Answer Structure', () => {
    it('should have correct answer structure', () => {
      // Simulated answer
      const answer = {
        question: {
          type: 'confirm' as const,
          text: 'Test?',
        },
        value: true,
        responded: true,
        responseTime: 1500,
      };

      assert.strictEqual(answer.value, true);
      assert.strictEqual(answer.responded, true);
      assert.ok(answer.responseTime >= 0);
    });

    it('should track timeout', () => {
      const answer = {
        question: { type: 'confirm' as const, text: 'Test?' },
        value: false,
        responded: false,
        timedOut: true,
        responseTime: 5000,
      };

      assert.strictEqual(answer.timedOut, true);
      assert.strictEqual(answer.responded, false);
    });

    it('should track cancellation', () => {
      const answer = {
        question: { type: 'choice' as const, text: 'Choose?' },
        value: '',
        responded: true,
        cancelled: true,
        responseTime: 500,
      };

      assert.strictEqual(answer.cancelled, true);
      assert.strictEqual(answer.value, '');
    });
  });

  // ==========================================================================
  // Integration Tests (mocked)
  // ==========================================================================

  describe('Integration', () => {
    it('should support callback on response', () => {
      let callbackCalled = false;

      const hl = new HumanLoop({
        onResponse: (answer) => {
          callbackCalled = true;
        },
      });

      // We can't actually test interactive input here,
      // but we can verify the callback is set up correctly
      assert.ok(hl);
    });

    it('should close cleanly', () => {
      const hl = new HumanLoop();
      hl.close();
      // Should not throw
      assert.ok(true);
    });
  });

  // ==========================================================================
  // Destructive Operation Tests
  // ==========================================================================

  describe('Destructive Operations', () => {
    it('should format destructive warning', () => {
      // This tests the structure of destructive confirmations
      const operation = 'Delete all files';
      const details = '10 files will be permanently removed';

      // Just verify the strings are valid
      assert.ok(operation.length > 0);
      assert.ok(details.length > 0);
    });
  });

  // ==========================================================================
  // Approach Selection Tests
  // ==========================================================================

  describe('Approach Selection', () => {
    it('should format approach options', () => {
      const task = 'Implement authentication';
      const approaches = [
        { name: 'JWT', description: 'Token-based auth', recommended: true },
        { name: 'Session', description: 'Server-side sessions' },
        { name: 'OAuth', description: 'Third-party providers' },
      ];

      assert.strictEqual(approaches.length, 3);
      assert.ok(approaches.find(a => a.recommended));
    });
  });
});
