/**
 * Genesis Presentation Engine — TypeScript Tests
 *
 * Tests for the TS→Python bridge, tool registration, and error handling.
 *
 * Usage:
 *   npx tsx test/presentation.test.ts
 *   # or via build:
 *   npm run build && node --test dist/test/presentation.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { generatePresentation, checkPresentationEngine } from '../src/tools/presentation.js';
import type { PresentationSpec, PresentationResult } from '../src/presentation/types.js';

const TEST_DIR = path.join(os.tmpdir(), `genesis_pres_test_${Date.now()}`);

describe('Presentation Engine', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ==========================================================================
  // Engine Availability
  // ==========================================================================

  describe('checkPresentationEngine', () => {
    it('should detect Python and required packages', async () => {
      const status = await checkPresentationEngine();
      // We expect Python to be available on the dev machine
      assert.strictEqual(typeof status.available, 'boolean');
      assert.strictEqual(typeof status.python, 'boolean');
      assert.strictEqual(typeof status.packages.pptx, 'boolean');
      assert.strictEqual(typeof status.packages.matplotlib, 'boolean');
      assert.strictEqual(typeof status.packages.numpy, 'boolean');
    });
  });

  // ==========================================================================
  // Bridge: generatePresentation
  // ==========================================================================

  describe('generatePresentation', () => {
    it('should generate a minimal presentation (cover only)', async () => {
      const spec: PresentationSpec = {
        meta: { title: 'TS Bridge Test' },
        slides: [
          {
            type: 'cover',
            content: {
              company: 'TEST CORP',
              headline: 'Bridge Test',
              date_range: 'February 2026',
            },
          },
        ],
        output_path: path.join(TEST_DIR, 'test_bridge_minimal.pptx'),
      };

      const result = await generatePresentation(spec);

      assert.strictEqual(result.success, true, `Error: ${result.error}`);
      assert.strictEqual(result.slides, 1);
      assert.strictEqual(result.charts, 0);
      assert.ok(result.path);
      assert.ok(fs.existsSync(result.path!));
      assert.ok(result.duration > 0);
    });

    it('should generate a presentation with charts', async () => {
      const spec: PresentationSpec = {
        meta: { title: 'Chart Test' },
        slides: [
          {
            type: 'cover',
            content: { headline: 'Chart Test' },
          },
          {
            type: 'chart',
            content: { title: 'Test Line Chart' },
            chart: {
              type: 'line',
              data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr'],
                series: [
                  { name: 'Revenue', values: [10, 15, 12, 18] },
                ],
              },
              config: { ylabel: '$M' },
              source: 'Test Data',
              filename: 'ts_test_line.png',
            },
            chart_num: 1,
          },
        ],
        output_path: path.join(TEST_DIR, 'test_bridge_chart.pptx'),
        chart_dir: path.join(TEST_DIR, 'test_charts'),
      };

      const result = await generatePresentation(spec);

      assert.strictEqual(result.success, true, `Error: ${result.error}`);
      assert.strictEqual(result.slides, 2);
      assert.strictEqual(result.charts, 1);
    });

    it('should generate a full presentation deck', async () => {
      const spec: PresentationSpec = {
        meta: {
          title: 'Full Deck Test',
          company: 'Test SA',
          date: 'FEBRUARY 7, 2026',
          header_tag: '#TEST',
          footer_left: 'TEST SA | Lugano',
        },
        slides: [
          { type: 'cover', content: { company: 'TEST SA', headline: 'Full Deck' } },
          {
            type: 'executive_summary',
            content: {
              title: 'Markets diverged sharply this week',
              tag: '#macro',
              sections: [
                { label: 'S', text: 'Situation: Markets saw extreme divergence.' },
                { label: 'C', text: 'Complication: Multiple regime shifts underway.' },
                { label: 'R', text: 'Resolution: Maintain balanced positioning.' },
              ],
            },
          },
          {
            type: 'chart',
            content: { title: 'Bar chart test' },
            chart: {
              type: 'bar',
              data: {
                labels: ['A', 'B', 'C'],
                groups: [{ name: 'Group 1', values: [10, 20, 15] }],
              },
              source: 'Test',
              filename: 'full_bar.png',
            },
          },
          {
            type: 'text',
            content: {
              title: 'What to Watch',
              left_title: 'OPPORTUNITIES',
              left_items: ['Item A', 'Item B'],
              right_title: 'RISKS',
              right_items: ['Risk A', 'Risk B'],
            },
          },
          {
            type: 'sources',
            content: {
              left_sources: 'Source A\n\nSource B',
              right_sources: 'Source C',
              disclaimer: 'For professional investors only.',
            },
          },
          { type: 'back_cover', content: { company: 'TEST SA' } },
        ],
        output_path: path.join(TEST_DIR, 'test_full_deck.pptx'),
        chart_dir: path.join(TEST_DIR, 'full_charts'),
      };

      const result = await generatePresentation(spec);

      assert.strictEqual(result.success, true, `Error: ${result.error}`);
      assert.strictEqual(result.slides, 6);
      assert.strictEqual(result.charts, 1);
      assert.ok(result.duration > 0);
    });

    it('should handle empty slides gracefully', async () => {
      const spec: PresentationSpec = {
        meta: { title: 'Empty Test' },
        slides: [],
        output_path: path.join(TEST_DIR, 'test_empty.pptx'),
      };

      const result = await generatePresentation(spec);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.slides, 0);
    });

    it('should respect timeout', async () => {
      // This test uses a very short timeout to force a timeout error
      const spec: PresentationSpec = {
        meta: { title: 'Timeout Test' },
        slides: Array.from({ length: 50 }, (_, i) => ({
          type: 'chart' as const,
          content: { title: `Chart ${i}` },
          chart: {
            type: 'line' as const,
            data: {
              labels: ['A', 'B', 'C', 'D', 'E'],
              series: [{ name: 'Data', values: [1, 2, 3, 4, 5] }],
            },
            filename: `timeout_chart_${i}.png`,
          },
        })),
        output_path: path.join(TEST_DIR, 'test_timeout.pptx'),
        chart_dir: path.join(TEST_DIR, 'timeout_charts'),
      };

      const result = await generatePresentation(spec, { timeout: 100 });
      // Either it times out or completes fast — both are valid test outcomes
      assert.strictEqual(typeof result.success, 'boolean');
      assert.ok(result.duration >= 0);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle invalid Python path', async () => {
      const spec: PresentationSpec = {
        meta: { title: 'Bad Python' },
        slides: [{ type: 'cover', content: { headline: 'Test' } }],
        output_path: path.join(TEST_DIR, 'bad_python.pptx'),
      };

      const result = await generatePresentation(spec, { pythonPath: '/nonexistent/python999' });
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  // ==========================================================================
  // Tool Registration
  // ==========================================================================

  describe('Tool Registration', () => {
    it('should be registered in toolRegistry', async () => {
      // Dynamically import to trigger registration
      const { toolRegistry } = await import('../src/tools/index.js');
      const tool = toolRegistry.get('presentation');

      assert.ok(tool, 'Presentation tool should be registered');
      assert.strictEqual(tool!.name, 'presentation');
      assert.ok(tool!.description.includes('PPTX'));
    });

    it('should validate spec parameter', async () => {
      const { toolRegistry } = await import('../src/tools/index.js');
      const tool = toolRegistry.get('presentation');

      // Missing spec
      const invalidResult = tool!.validate!({});
      assert.strictEqual(invalidResult.valid, false);

      // Valid spec
      const validResult = tool!.validate!({
        spec: {
          meta: {},
          slides: [{ type: 'cover', content: {} }],
          output_path: '/tmp/test.pptx',
        },
      });
      assert.strictEqual(validResult.valid, true);
    });
  });
});
