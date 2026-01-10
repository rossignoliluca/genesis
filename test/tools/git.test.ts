/**
 * Tests for Genesis Native Git Operations
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  GitTool,
  getGitTool,
  resetGitTool,
  gitStatus,
  gitDiff,
  gitLog,
  gitAdd,
  gitCommit,
  DEFAULT_GIT_CONFIG,
} from '../../src/tools/git.js';

// Test directory
const TEST_DIR = '/tmp/genesis-git-test-' + Date.now();

// Helper to run git commands directly
function git(cmd: string, cwd = TEST_DIR): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8' }).trim();
}

describe('GitTool', () => {
  before(() => {
    // Create test repository
    fs.mkdirSync(TEST_DIR, { recursive: true });
    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test User"');

    // Create initial commit
    fs.writeFileSync(path.join(TEST_DIR, 'README.md'), '# Test Repo');
    git('add README.md');
    git('commit -m "Initial commit"');

    resetGitTool();
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    resetGitTool();
  });

  // ==========================================================================
  // Status Tests
  // ==========================================================================

  describe('Status', () => {
    beforeEach(() => {
      // Reset to clean state
      git('checkout -- .');
      git('clean -fd');
    });

    it('should get status of clean repo', async () => {
      const result = await gitStatus(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.strictEqual(result.data.isClean, true);
      assert.strictEqual(result.data.staged.length, 0);
      assert.strictEqual(result.data.unstaged.length, 0);
      assert.strictEqual(result.data.untracked.length, 0);
    });

    it('should detect untracked files', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'new-file.txt'), 'content');

      const result = await gitStatus(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.untracked.includes('new-file.txt'));

      fs.unlinkSync(path.join(TEST_DIR, 'new-file.txt'));
    });

    it('should detect staged files', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'staged.txt'), 'content');
      git('add staged.txt');

      const result = await gitStatus(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.staged.includes('staged.txt'));

      git('reset HEAD staged.txt');
      fs.unlinkSync(path.join(TEST_DIR, 'staged.txt'));
    });

    it('should detect modified files', async () => {
      fs.appendFileSync(path.join(TEST_DIR, 'README.md'), '\nNew line');

      const result = await gitStatus(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.unstaged.includes('README.md'));

      git('checkout -- README.md');
    });

    it('should get current branch', async () => {
      const result = await gitStatus(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(['main', 'master'].includes(result.data?.branch || ''));
    });

    it('should fail for non-git directory', async () => {
      const result = await gitStatus('/tmp');

      assert.strictEqual(result.success, false);
    });
  });

  // ==========================================================================
  // Diff Tests
  // ==========================================================================

  describe('Diff', () => {
    beforeEach(() => {
      git('checkout -- .');
    });

    it('should get diff of modified file', async () => {
      fs.appendFileSync(path.join(TEST_DIR, 'README.md'), '\nNew content');

      const result = await gitDiff({}, TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.raw.includes('New content'));

      git('checkout -- README.md');
    });

    it('should get staged diff', async () => {
      fs.appendFileSync(path.join(TEST_DIR, 'README.md'), '\nStaged content');
      git('add README.md');

      const result = await gitDiff({ staged: true }, TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.raw.includes('Staged content'));

      git('reset HEAD README.md');
      git('checkout -- README.md');
    });

    it('should get diff stats', async () => {
      fs.appendFileSync(path.join(TEST_DIR, 'README.md'), '\nLine 1\nLine 2\nLine 3');

      const result = await gitDiff({}, TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.stats && result.data.stats.insertions > 0);

      git('checkout -- README.md');
    });
  });

  // ==========================================================================
  // Log Tests
  // ==========================================================================

  describe('Log', () => {
    it('should get commit log', async () => {
      const result = await gitLog({ count: 5 }, TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.ok(result.data.length > 0);
      assert.ok(result.data[0].message.includes('Initial commit'));
    });

    it('should get commit details', async () => {
      const result = await gitLog({ count: 1 }, TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.[0].hash);
      assert.ok(result.data?.[0].shortHash);
      assert.ok(result.data?.[0].author);
      assert.ok(result.data?.[0].date);
    });
  });

  // ==========================================================================
  // Add/Stage Tests
  // ==========================================================================

  describe('Add/Stage', () => {
    afterEach(() => {
      git('checkout -- .');
      git('clean -fd');
    });

    it('should stage a file', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'to-stage.txt'), 'content');

      const result = await gitAdd(['to-stage.txt'], TEST_DIR);

      assert.strictEqual(result.success, true);

      const status = await gitStatus(TEST_DIR);
      assert.ok(status.data?.staged.includes('to-stage.txt'));
    });

    it('should stage multiple files', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(TEST_DIR, 'file2.txt'), 'content2');

      const result = await gitAdd(['file1.txt', 'file2.txt'], TEST_DIR);

      assert.strictEqual(result.success, true);

      const status = await gitStatus(TEST_DIR);
      assert.ok(status.data?.staged.includes('file1.txt'));
      assert.ok(status.data?.staged.includes('file2.txt'));
    });

    it('should fail with empty files array', async () => {
      const result = await gitAdd([], TEST_DIR);
      assert.strictEqual(result.success, false);
    });
  });

  // ==========================================================================
  // Commit Tests
  // ==========================================================================

  describe('Commit', () => {
    afterEach(() => {
      // Reset to initial commit
      try {
        git('reset --hard HEAD~1');
      } catch {
        // Ignore if no commits to reset
      }
    });

    it('should create a commit', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'commit-test.txt'), 'content');
      git('add commit-test.txt');

      const result = await gitCommit({ message: 'Test commit' }, TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.message.includes('Test commit'));
    });

    it('should add signature to commit message', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'signed.txt'), 'content');
      git('add signed.txt');

      const result = await gitCommit({ message: 'Signed commit' }, TEST_DIR);

      assert.strictEqual(result.success, true);

      const log = git('log -1 --format=%B');
      assert.ok(log.includes('Genesis'));
    });

    it('should commit with files parameter', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'auto-add.txt'), 'content');

      const result = await gitCommit({
        message: 'Auto-add commit',
        files: ['auto-add.txt'],
      }, TEST_DIR);

      assert.strictEqual(result.success, true);
    });

    it('should fail with no staged changes', async () => {
      const tool = getGitTool();

      const result = await tool.commit({ message: 'Empty commit' }, TEST_DIR);

      assert.strictEqual(result.success, false);
    });
  });

  // ==========================================================================
  // Push Tests
  // ==========================================================================

  describe('Push', () => {
    it('should require confirmation for push', async () => {
      const tool = getGitTool();

      const result = await tool.push({}, TEST_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('confirmation'));
    });

    it('should block force push by default', async () => {
      const tool = getGitTool();

      const result = await tool.push({ force: true, confirmed: true }, TEST_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('blocked'));
    });
  });

  // ==========================================================================
  // Branch Tests
  // ==========================================================================

  describe('Branch', () => {
    afterEach(() => {
      try {
        git('checkout master || git checkout main');
        git('branch -D test-branch 2>/dev/null || true');
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should get current branch', async () => {
      const tool = getGitTool();
      const result = await tool.branch(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(['main', 'master'].includes(result.data || ''));
    });

    it('should list branches', async () => {
      const tool = getGitTool();
      const result = await tool.listBranches(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.branches && result.data.branches.length > 0);
    });

    it('should create new branch', async () => {
      const tool = getGitTool();

      const result = await tool.createBranch('test-branch', {}, TEST_DIR);

      assert.strictEqual(result.success, true);

      const branches = await tool.listBranches(TEST_DIR);
      assert.ok(branches.data?.branches.some(b => b.includes('test-branch')));
    });

    it('should create and checkout branch', async () => {
      const tool = getGitTool();

      const result = await tool.createBranch('test-branch', { checkout: true }, TEST_DIR);

      assert.strictEqual(result.success, true);

      const branch = await tool.branch(TEST_DIR);
      assert.strictEqual(branch.data, 'test-branch');
    });
  });

  // ==========================================================================
  // Utility Tests
  // ==========================================================================

  describe('Utilities', () => {
    it('should check if directory is repo', async () => {
      const tool = getGitTool();

      assert.strictEqual(await tool.isRepo(TEST_DIR), true);
      assert.strictEqual(await tool.isRepo('/tmp'), false);
    });

    it('should generate commit message', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'gen-msg.txt'), 'content');
      git('add gen-msg.txt');

      const tool = getGitTool();
      const result = await tool.generateCommitMessage(TEST_DIR);

      assert.strictEqual(result.success, true);
      assert.ok(result.data?.includes('file'));

      git('reset HEAD gen-msg.txt');
      fs.unlinkSync(path.join(TEST_DIR, 'gen-msg.txt'));
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should have sensible defaults', () => {
      assert.strictEqual(DEFAULT_GIT_CONFIG.blockForcePush, true);
      assert.strictEqual(DEFAULT_GIT_CONFIG.blockHardReset, true);
      assert.strictEqual(DEFAULT_GIT_CONFIG.requirePushConfirmation, true);
    });

    it('should allow custom configuration', () => {
      const tool = new GitTool({ blockForcePush: false });
      const config = tool.getConfig();

      assert.strictEqual(config.blockForcePush, false);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should be in tool registry', async () => {
      const { toolRegistry } = await import('../../src/tools/index.js');

      assert.ok(toolRegistry.has('git_status'));
      assert.ok(toolRegistry.has('git_diff'));
      assert.ok(toolRegistry.has('git_log'));
      assert.ok(toolRegistry.has('git_add'));
      assert.ok(toolRegistry.has('git_commit'));
      assert.ok(toolRegistry.has('git_push'));
    });
  });
});
