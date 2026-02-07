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
 * Check if the Python presentation engine is available.
 * Verifies python3 and required packages (python-pptx, matplotlib, numpy).
 */
export async function checkPresentationEngine(): Promise<{
  available: boolean;
  python: boolean;
  packages: { pptx: boolean; matplotlib: boolean; numpy: boolean };
  error?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', `
import sys
results = {}
try:
    import pptx
    results['pptx'] = True
except ImportError:
    results['pptx'] = False
try:
    import matplotlib
    results['matplotlib'] = True
except ImportError:
    results['matplotlib'] = False
try:
    import numpy
    results['numpy'] = True
except ImportError:
    results['numpy'] = False
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
          packages: { pptx: false, matplotlib: false, numpy: false },
          error: 'Python3 not available',
        });
        return;
      }

      try {
        const packages = JSON.parse(stdout.trim());
        const allAvailable = packages.pptx && packages.matplotlib && packages.numpy;
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
          packages: { pptx: false, matplotlib: false, numpy: false },
          error: 'Failed to check packages',
        });
      }
    });

    child.on('error', () => {
      resolve({
        available: false,
        python: false,
        packages: { pptx: false, matplotlib: false, numpy: false },
        error: 'Python3 not found in PATH',
      });
    });
  });
}
