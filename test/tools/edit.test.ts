/**
 * Tests for Genesis Diff-Based File Editor
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  EditTool,
  getEditTool,
  resetEditTool,
  edit,
  writeFile,
  isUnique,
  validatePath,
  DEFAULT_EDIT_CONFIG,
} from '../../src/tools/edit.js';

// Test directory
const TEST_DIR = '/tmp/genesis-edit-test-' + Date.now();

describe('EditTool', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    resetEditTool();
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    resetEditTool();
  });

  beforeEach(() => {
    // Clean test directory before each test
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      fs.rmSync(path.join(TEST_DIR, file), { force: true, recursive: true });
    }
  });

  // ==========================================================================
  // Path Validation Tests
  // ==========================================================================

  describe('Path Validation', () => {
    it('should accept absolute paths', () => {
      const result = validatePath('/tmp/test.txt');
      assert.strictEqual(result.valid, true);
    });

    it('should reject relative paths', () => {
      const result = validatePath('relative/path.txt');
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason?.includes('absolute'));
    });

    it('should block .git directory', () => {
      const result = validatePath('/project/.git/config');
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason?.includes('blocked'));
    });

    it('should block node_modules', () => {
      const result = validatePath('/project/node_modules/package/index.js');
      assert.strictEqual(result.valid, false);
    });

    it('should block .env files', () => {
      const result = validatePath('/project/.env');
      assert.strictEqual(result.valid, false);
    });

    it('should block secrets files', () => {
      const result = validatePath('/project/secrets.json');
      assert.strictEqual(result.valid, false);
    });

    it('should allow normal project files', () => {
      assert.strictEqual(validatePath('/project/src/index.ts').valid, true);
      assert.strictEqual(validatePath('/project/package.json').valid, true);
      assert.strictEqual(validatePath('/project/README.md').valid, true);
    });
  });

  // ==========================================================================
  // Edit Tests
  // ==========================================================================

  describe('Edit Operations', () => {
    it('should replace unique string', async () => {
      const filePath = path.join(TEST_DIR, 'test1.txt');
      fs.writeFileSync(filePath, 'Hello World');

      const result = await edit({
        file_path: filePath,
        old_string: 'World',
        new_string: 'Genesis',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.replacements, 1);

      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(content, 'Hello Genesis');
    });

    it('should fail when old_string not found', async () => {
      const filePath = path.join(TEST_DIR, 'test2.txt');
      fs.writeFileSync(filePath, 'Hello World');

      const result = await edit({
        file_path: filePath,
        old_string: 'NotFound',
        new_string: 'Replacement',
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'));
    });

    it('should fail when old_string is not unique without replace_all', async () => {
      const filePath = path.join(TEST_DIR, 'test3.txt');
      fs.writeFileSync(filePath, 'Hello Hello Hello');

      const result = await edit({
        file_path: filePath,
        old_string: 'Hello',
        new_string: 'Hi',
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('3 times'));
    });

    it('should replace all when replace_all is true', async () => {
      const filePath = path.join(TEST_DIR, 'test4.txt');
      fs.writeFileSync(filePath, 'Hello Hello Hello');

      const result = await edit({
        file_path: filePath,
        old_string: 'Hello',
        new_string: 'Hi',
        replace_all: true,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.replacements, 3);

      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(content, 'Hi Hi Hi');
    });

    it('should preserve indentation', async () => {
      const filePath = path.join(TEST_DIR, 'test5.txt');
      const original = '    function hello() {\n        console.log("hi");\n    }';
      fs.writeFileSync(filePath, original);

      const result = await edit({
        file_path: filePath,
        old_string: 'console.log("hi");',
        new_string: 'console.log("hello world!");',
      });

      assert.strictEqual(result.success, true);

      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('        console.log("hello world!");'));
    });

    it('should create backup', async () => {
      const filePath = path.join(TEST_DIR, 'test6.txt');
      fs.writeFileSync(filePath, 'Original content');

      const result = await edit({
        file_path: filePath,
        old_string: 'Original',
        new_string: 'Modified',
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.backup);
      assert.ok(fs.existsSync(result.backup));

      const backupContent = fs.readFileSync(result.backup, 'utf-8');
      assert.strictEqual(backupContent, 'Original content');
    });

    it('should fail when old_string equals new_string', async () => {
      const filePath = path.join(TEST_DIR, 'test7.txt');
      fs.writeFileSync(filePath, 'Hello World');

      const result = await edit({
        file_path: filePath,
        old_string: 'Hello',
        new_string: 'Hello',
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('different'));
    });

    it('should fail for non-existent file', async () => {
      const result = await edit({
        file_path: path.join(TEST_DIR, 'nonexistent.txt'),
        old_string: 'test',
        new_string: 'replacement',
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'));
    });

    it('should handle multi-line replacements', async () => {
      const filePath = path.join(TEST_DIR, 'test8.txt');
      fs.writeFileSync(filePath, 'function hello() {\n  return 1;\n}');

      const result = await edit({
        file_path: filePath,
        old_string: 'function hello() {\n  return 1;\n}',
        new_string: 'const hello = () => 2;',
      });

      assert.strictEqual(result.success, true);

      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(content, 'const hello = () => 2;');
    });

    it('should generate diff preview', async () => {
      const filePath = path.join(TEST_DIR, 'test9.txt');
      fs.writeFileSync(filePath, 'Hello World');

      const result = await edit({
        file_path: filePath,
        old_string: 'World',
        new_string: 'Genesis',
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.diff);
      assert.ok(result.diff.includes('- World'));
      assert.ok(result.diff.includes('+ Genesis'));
    });
  });

  // ==========================================================================
  // Write Tests
  // ==========================================================================

  describe('Write Operations', () => {
    it('should write new file', async () => {
      const filePath = path.join(TEST_DIR, 'new-file.txt');

      const result = await writeFile({
        file_path: filePath,
        content: 'New content',
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.bytes_written > 0);

      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(content, 'New content');
    });

    it('should overwrite existing file with backup', async () => {
      const filePath = path.join(TEST_DIR, 'existing.txt');
      fs.writeFileSync(filePath, 'Old content');

      const result = await writeFile({
        file_path: filePath,
        content: 'New content',
        backup: true,
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.backup);
      assert.ok(fs.existsSync(result.backup));

      const backupContent = fs.readFileSync(result.backup, 'utf-8');
      assert.strictEqual(backupContent, 'Old content');
    });

    it('should create parent directories', async () => {
      const filePath = path.join(TEST_DIR, 'deep', 'nested', 'dir', 'file.txt');

      const result = await writeFile({
        file_path: filePath,
        content: 'Nested content',
      });

      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(filePath));
    });

    it('should reject blocked paths', async () => {
      const result = await writeFile({
        file_path: '/project/.env',
        content: 'SECRET=value',
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('blocked'));
    });
  });

  // ==========================================================================
  // Utility Tests
  // ==========================================================================

  describe('Utilities', () => {
    it('isUnique should return true for unique string', () => {
      const filePath = path.join(TEST_DIR, 'unique.txt');
      fs.writeFileSync(filePath, 'Hello World');

      assert.strictEqual(isUnique(filePath, 'World'), true);
    });

    it('isUnique should return false for repeated string', () => {
      const filePath = path.join(TEST_DIR, 'repeated.txt');
      fs.writeFileSync(filePath, 'Hello Hello');

      assert.strictEqual(isUnique(filePath, 'Hello'), false);
    });

    it('isUnique should return false for non-existent file', () => {
      assert.strictEqual(isUnique('/nonexistent.txt', 'test'), false);
    });

    it('findOccurrences should return correct positions', () => {
      const tool = getEditTool();
      const content = 'line1 test\nline2 test\nline3';

      const occurrences = tool.findOccurrences(content, 'test');

      assert.strictEqual(occurrences.length, 2);
      assert.strictEqual(occurrences[0].line, 1);
      assert.strictEqual(occurrences[1].line, 2);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should have sensible defaults', () => {
      assert.strictEqual(DEFAULT_EDIT_CONFIG.createBackups, true);
      assert.strictEqual(DEFAULT_EDIT_CONFIG.backupSuffix, '.bak');
      assert.strictEqual(DEFAULT_EDIT_CONFIG.maxFileSize, 10 * 1024 * 1024);
    });

    it('should allow custom configuration', () => {
      const tool = new EditTool({ createBackups: false });
      const config = tool.getConfig();

      assert.strictEqual(config.createBackups, false);
    });

    it('should update configuration', () => {
      const tool = getEditTool();
      tool.updateConfig({ backupSuffix: '.backup' });

      const config = tool.getConfig();
      assert.strictEqual(config.backupSuffix, '.backup');
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should be in tool registry', async () => {
      const { toolRegistry } = await import('../../src/tools/index.js');

      assert.ok(toolRegistry.has('edit'));
      assert.ok(toolRegistry.has('write'));

      const editTool = toolRegistry.get('edit');
      assert.ok(editTool);
      assert.strictEqual(editTool.name, 'edit');

      const writeTool = toolRegistry.get('write');
      assert.ok(writeTool);
      assert.strictEqual(writeTool.name, 'write');
    });

    it('should execute via tool registry', async () => {
      const { toolRegistry } = await import('../../src/tools/index.js');
      const filePath = path.join(TEST_DIR, 'registry-test.txt');
      fs.writeFileSync(filePath, 'Hello Registry');

      const editTool = toolRegistry.get('edit');
      const result = await editTool?.execute({
        file_path: filePath,
        old_string: 'Registry',
        new_string: 'World',
      }) as { success: boolean };

      assert.ok(result);
      assert.strictEqual(result.success, true);
    });
  });
});
