/**
 * Genesis Presentation Tool — TypeScript Bridge
 *
 * Spawns the Python presentation engine via child_process,
 * pipes JSON spec on stdin, and parses the result from stdout.
 *
 * Same pattern as tools/bash.ts but specialized for PPTX generation.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import type { PresentationSpec, PresentationResult } from '../presentation/types.js';

// ============================================================================
// Configuration
// ============================================================================

// Resolve engine path relative to this file's compiled location (dist/src/tools/)
// The Python engine lives in src/presentation/engine.py (not compiled)
const ENGINE_PATH = path.resolve(__dirname, '..', 'presentation', 'engine.py');

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const MAX_OUTPUT_SIZE = 5 * 1024 * 1024; // 5MB

// ============================================================================
// Bridge Implementation
// ============================================================================

/**
 * Generate a presentation by spawning the Python engine.
 *
 * @param spec - The PresentationSpec describing the deck to generate
 * @param options - Optional configuration
 * @returns PresentationResult with success status, path, and stats
 */
export async function generatePresentation(
  spec: PresentationSpec,
  options: { timeout?: number; pythonPath?: string } = {}
): Promise<PresentationResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pythonPath = options.pythonPath ?? 'python3';

  return new Promise<PresentationResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let truncated = false;

    const child = spawn(pythonPath, [ENGINE_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        MPLBACKEND: 'Agg',
      },
    });

    // Timeout enforcement
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }, timeout);

    // Collect stdout
    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length > MAX_OUTPUT_SIZE) {
        truncated = true;
        stdout += chunk.slice(0, MAX_OUTPUT_SIZE - stdout.length);
      } else {
        stdout += chunk;
      }
    });

    // Collect stderr (for error reporting)
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Pipe the JSON spec to stdin and close
    const specJson = JSON.stringify(spec);
    child.stdin.write(specJson);
    child.stdin.end();

    // Handle process completion
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          slides: 0,
          charts: 0,
          error: `Presentation generation timed out after ${timeout}ms`,
          duration,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          success: false,
          slides: 0,
          charts: 0,
          error: stderr.trim() || `Python engine exited with code ${code}`,
          duration,
        });
        return;
      }

      // Parse the JSON result from stdout
      try {
        const result = JSON.parse(stdout.trim()) as PresentationResult;
        result.duration = duration;
        resolve(result);
      } catch (parseError) {
        resolve({
          success: false,
          slides: 0,
          charts: 0,
          error: `Failed to parse engine output: ${stdout.slice(0, 500)}`,
          duration,
        });
      }
    });

    // Handle spawn errors
    child.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      let errorMessage = err.message;
      if (errorMessage.includes('ENOENT')) {
        errorMessage = `Python3 not found. Ensure python3 is installed and in PATH. Original error: ${err.message}`;
      }

      resolve({
        success: false,
        slides: 0,
        charts: 0,
        error: errorMessage,
        duration,
      });
    });
  });
}

/**
 * Generate a presentation using HTML→Screenshot pipeline.
 * Renders each slide as HTML, screenshots with Playwright, assembles into PPTX.
 */
export async function generatePresentationHTML(
  spec: PresentationSpec,
  options: { timeout?: number } = {}
): Promise<PresentationResult> {
  const startTime = Date.now();

  try {
    const { SlideRenderer } = await import('../presentation/slide-renderer.js');
    const outputDir = spec.output_path.replace(/\.pptx$/, '_render');
    const renderer = new SlideRenderer(spec);

    // Step 1: Render charts via Python engine (Plotly) if needed
    const chartDir = spec.chart_dir || '/tmp/genesis_charts';
    const chartPaths: Record<number, string> = {};

    for (let i = 0; i < spec.slides.length; i++) {
      const slide = spec.slides[i];
      if (slide.chart && slide.chart.type) {
        // Render chart via Python engine
        const chartResult = await renderChartOnly(slide.chart, chartDir, spec.meta.palette);
        if (chartResult) {
          chartPaths[i] = chartResult;
        }
      }
    }
    renderer.setChartPaths(chartPaths);

    // Step 2: Generate HTML + Screenshot
    const result = await renderer.renderAllSlides(outputDir);

    // Step 3: Assemble screenshots into PPTX via Python assembler
    const ASSEMBLER_PATH = path.resolve(__dirname, '..', 'presentation', 'pptx-assembler.py');
    const assembleSpec = {
      screenshots: result.slidePaths,
      output_path: spec.output_path,
      width: spec.meta.slide_width || 13.333,
      height: spec.meta.slide_height || 7.5,
    };

    const pptxResult = await new Promise<any>((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn('python3', [ASSEMBLER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.stdin.write(JSON.stringify(assembleSpec));
      child.stdin.end();
      child.on('close', (code) => {
        if (code !== 0) {
          resolve({ success: false, error: stderr || `exit ${code}` });
        } else {
          try { resolve(JSON.parse(stdout.trim())); }
          catch { resolve({ success: false, error: stdout.slice(0, 500) }); }
        }
      });
      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    const duration = Date.now() - startTime;
    return {
      success: pptxResult.success,
      path: pptxResult.path || spec.output_path,
      slides: pptxResult.slides || result.slidePaths.length,
      charts: Object.keys(chartPaths).length,
      duration,
      screenshot_paths: result.slidePaths,
    };
  } catch (err: any) {
    return {
      success: false,
      slides: 0,
      charts: 0,
      error: err.message || String(err),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Render a single chart via the Python engine. Returns the PNG path.
 */
async function renderChartOnly(
  chartSpec: any,
  chartDir: string,
  palette?: string,
): Promise<string | null> {
  const CHART_ENGINE = path.resolve(__dirname, '..', 'presentation', 'chart-renderer.py');
  // Fall back to using engine.py chart rendering
  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', `
import json, sys, os
sys.path.insert(0, os.path.dirname("${ENGINE_PATH}"))
from design import get_palette, setup_matplotlib
from charts import render_chart

spec = json.loads(sys.stdin.read())
palette = get_palette(spec.get("palette", "rossignoli_editorial"))
chart_dir = spec.get("chart_dir", "/tmp/genesis_charts")
os.makedirs(chart_dir, exist_ok=True)
path = render_chart(spec["chart"], palette, chart_dir)
print(path)
`], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stdin.write(JSON.stringify({
      chart: chartSpec,
      palette: palette || 'rossignoli_editorial',
      chart_dir: chartDir,
    }));
    child.stdin.end();
    child.on('close', (code) => {
      resolve(code === 0 ? stdout.trim() : null);
    });
    child.on('error', () => resolve(null));
  });
}

/**
 * Smart presentation generator — dispatches based on render_mode.
 */
export async function generatePresentationSmart(
  spec: PresentationSpec,
  options: { timeout?: number; pythonPath?: string } = {}
): Promise<PresentationResult> {
  const mode = spec.meta.render_mode || 'pptx';

  switch (mode) {
    case 'html-screenshot':
      return generatePresentationHTML(spec, options);
    case 'all': {
      // Render both modes, prefer html-screenshot as primary
      const htmlResult = await generatePresentationHTML(spec, options);
      // Also generate classic PPTX as fallback
      const classicSpec = { ...spec, output_path: spec.output_path.replace('.pptx', '_classic.pptx') };
      const classicResult = await generatePresentation(classicSpec, options);
      return {
        ...htmlResult,
        // Keep both paths
      };
    }
    case 'html': {
      // HTML only, no screenshot/PPTX
      const { SlideRenderer } = await import('../presentation/slide-renderer.js');
      const renderer = new SlideRenderer(spec);
      const outputDir = spec.output_path.replace(/\.pptx$/, '_html');
      const htmlPaths = renderer.generateHTML(outputDir);
      return {
        success: true,
        slides: htmlPaths.length,
        charts: 0,
        duration: 0,
        html_path: outputDir,
      };
    }
    case 'pptx':
    default:
      return generatePresentation(spec, options);
  }
}

/**
 * Check if the Python presentation engine is available.
 * Verifies python3 and required packages (python-pptx, plotly, kaleido, numpy).
 */
export async function checkPresentationEngine(): Promise<{
  available: boolean;
  python: boolean;
  packages: { pptx: boolean; matplotlib: boolean; numpy: boolean; plotly: boolean; kaleido: boolean };
  error?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', `
import sys
results = {}
for mod, key in [('pptx', 'pptx'), ('matplotlib', 'matplotlib'), ('numpy', 'numpy'), ('plotly', 'plotly'), ('kaleido', 'kaleido')]:
    try:
        __import__(mod)
        results[key] = True
    except ImportError:
        results[key] = False
import json
print(json.dumps(results))
`], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          available: false,
          python: false,
          packages: { pptx: false, matplotlib: false, numpy: false, plotly: false, kaleido: false },
          error: 'Python3 not available',
        });
        return;
      }

      try {
        const packages = JSON.parse(stdout.trim());
        const allAvailable = packages.pptx && packages.numpy && (packages.plotly || packages.matplotlib);
        resolve({
          available: allAvailable,
          python: true,
          packages,
          error: allAvailable ? undefined : 'Missing packages: ' +
            Object.entries(packages)
              .filter(([, v]) => !v)
              .map(([k]) => k === 'pptx' ? 'python-pptx' : k)
              .join(', '),
        });
      } catch {
        resolve({
          available: false,
          python: true,
          packages: { pptx: false, matplotlib: false, numpy: false, plotly: false, kaleido: false },
          error: 'Failed to check packages',
        });
      }
    });

    child.on('error', () => {
      resolve({
        available: false,
        python: false,
        packages: { pptx: false, matplotlib: false, numpy: false, plotly: false, kaleido: false },
        error: 'Python3 not found in PATH',
      });
    });
  });
}
