/**
 * Tests for Genesis Tool Dispatcher
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  ToolDispatcher,
  getDispatcher,
  resetDispatcher,
  dispatchTools,
  executeTool,
  listAllTools,
  ToolCall,
  LLMToolCall,
} from '../../src/cli/dispatcher.js';

describe('ToolDispatcher', () => {
  beforeEach(() => {
    resetDispatcher();
  });

  // ==========================================================================
  // Parsing Tests
  // ==========================================================================

  describe('Parsing', () => {
    it('should parse OpenAI-style tool calls', () => {
      const dispatcher = getDispatcher();

      const llmCalls: LLMToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'bash',
            arguments: '{"command": "ls -la"}',
          },
        },
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'edit',
            arguments: '{"file_path": "test.ts", "old_string": "foo", "new_string": "bar"}',
          },
        },
      ];

      const calls = dispatcher.parseToolCalls(llmCalls);

      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0].name, 'bash');
      assert.strictEqual(calls[0].params.command, 'ls -la');
      assert.strictEqual(calls[1].name, 'edit');
      assert.strictEqual(calls[1].params.file_path, 'test.ts');
    });

    it('should parse XML-style tool calls', () => {
      const dispatcher = getDispatcher();

      const text = `
        Let me run a command for you.
        <tool_use name="bash">
          <param name="command">echo "hello"</param>
        </tool_use>
      `;

      const calls = dispatcher.parseToolCalls(text);

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].name, 'bash');
      assert.strictEqual(calls[0].params.command, 'echo "hello"');
    });

    it('should parse invoke-style tool calls', () => {
      const dispatcher = getDispatcher();

      const text = `
        <invoke name="git_status">
          <param name="cwd">/tmp</param>
        </invoke>
      `;

      const calls = dispatcher.parseToolCalls(text);

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].name, 'git_status');
      assert.strictEqual(calls[0].params.cwd, '/tmp');
    });

    it('should parse JSON-style tool calls', () => {
      const dispatcher = getDispatcher();

      const text = `
        I'll run this tool:
        {"tool": "bash", "params": {"command": "pwd"}}
      `;

      const calls = dispatcher.parseToolCalls(text);

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].name, 'bash');
      assert.strictEqual(calls[0].params.command, 'pwd');
    });

    it('should handle multiple tool calls in one response', () => {
      const dispatcher = getDispatcher();

      const text = `
        <tool_use name="bash">
          <param name="command">ls</param>
        </tool_use>
        <tool_use name="bash">
          <param name="command">pwd</param>
        </tool_use>
      `;

      const calls = dispatcher.parseToolCalls(text);

      assert.strictEqual(calls.length, 2);
    });

    it('should handle empty response', () => {
      const dispatcher = getDispatcher();
      const calls = dispatcher.parseToolCalls('Just a plain response with no tools.');

      assert.strictEqual(calls.length, 0);
    });

    it('should handle malformed tool calls gracefully', () => {
      const dispatcher = getDispatcher();

      const text = `
        <tool_use name="bash">
          invalid xml content without params
        </tool_use>
      `;

      // Should not throw
      const calls = dispatcher.parseToolCalls(text);
      assert.ok(Array.isArray(calls));
    });
  });

  // ==========================================================================
  // Routing Tests
  // ==========================================================================

  describe('Routing', () => {
    it('should route local tools correctly', () => {
      const dispatcher = getDispatcher();

      const calls = dispatcher.parseToolCalls([
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'bash', arguments: '{}' },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'edit', arguments: '{}' },
        },
        {
          id: 'call_3',
          type: 'function',
          function: { name: 'git_status', arguments: '{}' },
        },
      ]);

      assert.strictEqual(calls[0].source, 'local');
      assert.strictEqual(calls[1].source, 'local');
      assert.strictEqual(calls[2].source, 'local');
    });

    it('should route MCP tools correctly', () => {
      const dispatcher = getDispatcher();

      const calls = dispatcher.parseToolCalls([
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'search_arxiv', arguments: '{}' },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'wolfram_query', arguments: '{}' },
        },
      ]);

      assert.strictEqual(calls[0].source, 'mcp');
      assert.strictEqual(calls[0].mcpServer, 'arxiv');
      assert.strictEqual(calls[1].source, 'mcp');
      assert.strictEqual(calls[1].mcpServer, 'wolfram');
    });

    it('should default unknown tools to local', () => {
      const dispatcher = getDispatcher();

      const calls = dispatcher.parseToolCalls([
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'unknown_tool', arguments: '{}' },
        },
      ]);

      assert.strictEqual(calls[0].source, 'local');
    });
  });

  // ==========================================================================
  // Execution Tests
  // ==========================================================================

  describe('Execution', () => {
    it('should execute local tools successfully', async () => {
      const dispatcher = getDispatcher();

      const calls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'bash',
          params: { command: 'echo "test"' },
          source: 'local',
        },
      ];

      const result = await dispatcher.dispatch(calls);

      assert.ok(result.results.length > 0);
      assert.strictEqual(result.results[0].name, 'bash');
      // May or may not succeed depending on sandbox
    });

    it('should handle failed validation', async () => {
      const dispatcher = getDispatcher();

      const calls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'edit',
          params: {}, // Missing required params
          source: 'local',
        },
      ];

      const result = await dispatcher.dispatch(calls);

      assert.strictEqual(result.results[0].success, false);
      assert.ok(result.results[0].error);
    });

    it('should handle unknown tools gracefully', async () => {
      const dispatcher = getDispatcher();

      const calls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'nonexistent_tool',
          params: {},
          source: 'local',
        },
      ];

      const result = await dispatcher.dispatch(calls);

      assert.strictEqual(result.results[0].success, false);
      assert.ok(result.results[0].error?.includes('Unknown tool'));
    });

    it('should track execution duration', async () => {
      const dispatcher = getDispatcher();

      const calls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'bash',
          params: { command: 'echo "test"' },
          source: 'local',
        },
      ];

      const result = await dispatcher.dispatch(calls);

      assert.ok(result.totalDuration >= 0);
      assert.ok(result.results[0].duration >= 0);
    });

    it('should support parallel execution', async () => {
      const dispatcher = getDispatcher({ maxParallel: 3 });

      const calls: ToolCall[] = [
        { id: 'call_1', name: 'bash', params: { command: 'echo 1' }, source: 'local' },
        { id: 'call_2', name: 'bash', params: { command: 'echo 2' }, source: 'local' },
        { id: 'call_3', name: 'bash', params: { command: 'echo 3' }, source: 'local' },
      ];

      const result = await dispatcher.dispatch(calls);

      assert.strictEqual(result.results.length, 3);
      assert.ok(result.parallelExecutions >= 1);
    });
  });

  // ==========================================================================
  // History Tests
  // ==========================================================================

  describe('History', () => {
    it('should track execution history', async () => {
      const dispatcher = getDispatcher();

      await dispatcher.dispatch([
        { id: 'call_1', name: 'bash', params: { command: 'echo 1' }, source: 'local' },
      ]);

      await dispatcher.dispatch([
        { id: 'call_2', name: 'bash', params: { command: 'echo 2' }, source: 'local' },
      ]);

      const history = dispatcher.getHistory();

      assert.strictEqual(history.length, 2);
    });

    it('should clear history', async () => {
      const dispatcher = getDispatcher();

      await dispatcher.dispatch([
        { id: 'call_1', name: 'bash', params: { command: 'echo 1' }, source: 'local' },
      ]);

      dispatcher.clearHistory();

      assert.strictEqual(dispatcher.getHistory().length, 0);
    });
  });

  // ==========================================================================
  // Formatting Tests
  // ==========================================================================

  describe('Formatting', () => {
    it('should format results for LLM context', async () => {
      const dispatcher = getDispatcher();

      const result = await dispatcher.dispatch([
        { id: 'call_1', name: 'bash', params: { command: 'echo "hello"' }, source: 'local' },
      ]);

      const formatted = dispatcher.formatResultsForLLM(result.results);

      assert.ok(formatted.includes('<tool_results>'));
      assert.ok(formatted.includes('</tool_results>'));
      assert.ok(formatted.includes('name="bash"'));
    });
  });

  // ==========================================================================
  // Tool Listing Tests
  // ==========================================================================

  describe('Tool Listing', () => {
    it('should list available tools', () => {
      const tools = listAllTools();

      assert.ok(tools.local.includes('bash'));
      assert.ok(tools.local.includes('edit'));
      assert.ok(Object.keys(tools.mcp).includes('arxiv'));
    });
  });

  // ==========================================================================
  // Convenience Functions
  // ==========================================================================

  describe('Convenience Functions', () => {
    it('dispatchTools should work with string input', async () => {
      const text = `
        <tool_use name="bash">
          <param name="command">echo test</param>
        </tool_use>
      `;

      const result = await dispatchTools(text);

      assert.ok(result.results.length > 0);
    });

    it('executeTool should work', async () => {
      const result = await executeTool('bash', { command: 'echo "hello"' });

      assert.strictEqual(result.name, 'bash');
      // Success depends on sandbox config
    });
  });

  // ==========================================================================
  // Progress Callback Tests
  // ==========================================================================

  describe('Progress Callback', () => {
    it('should call progress callback', async () => {
      const progressCalls: string[] = [];

      const dispatcher = new ToolDispatcher({
        onProgress: (status) => {
          progressCalls.push(status.phase);
        },
      });

      await dispatcher.dispatch([
        { id: 'call_1', name: 'bash', params: { command: 'echo 1' }, source: 'local' },
      ]);

      assert.ok(progressCalls.includes('validating'));
      assert.ok(progressCalls.includes('executing'));
      assert.ok(progressCalls.includes('complete'));
    });
  });
});
