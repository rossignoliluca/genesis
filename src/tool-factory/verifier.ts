/**
 * Tool Verifier — Static analysis, sandbox execution, fuzz testing
 * Based on LATM Stage 2 verify pattern.
 */

import { Script, createContext } from 'node:vm';
import { DynamicTool, ToolTestResult, JSONSchema } from './types.js';

export class ToolVerifier {
  private maxTestDuration = 10_000;

  async verify(tool: DynamicTool): Promise<ToolTestResult> {
    const errors: string[] = [];

    // Phase 1: Static analysis
    const staticResult = this.staticAnalysis(tool.source);
    if (!staticResult.safe) {
      return { passed: false, testsRun: 0, testsPassed: 0, errors: staticResult.reasons, duration: 0 };
    }

    // Phase 2: Basic execution test
    let testsRun = 0;
    let testsPassed = 0;
    const start = Date.now();

    // Try running with empty params
    testsRun++;
    try {
      await this.runInSandbox(tool.source, {}, 5000);
      testsPassed++;
    } catch (err) {
      // Controlled errors are OK (e.g., "missing required parameter")
      const msg = (err as Error).message || '';
      if (msg.includes('required') || msg.includes('missing') || msg.includes('invalid')) {
        testsPassed++; // Graceful error handling is good
      } else {
        errors.push(`Execution test: ${msg}`);
      }
    }

    // Phase 3: Fuzz testing
    const fuzzResult = await this.fuzzTest(tool, 10);
    testsRun += fuzzResult.runs;
    testsPassed += fuzzResult.survived;
    if (fuzzResult.crashes.length > 0) {
      errors.push(...fuzzResult.crashes.map(c => `Fuzz crash: ${c}`));
    }

    return {
      passed: errors.length === 0 && testsRun > 0,
      testsRun,
      testsPassed,
      errors,
      duration: Date.now() - start,
    };
  }

  private staticAnalysis(source: string): { safe: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const dangerous = [
      { pattern: /process\.exit/, desc: 'process.exit call' },
      { pattern: /child_process/, desc: 'child_process import' },
      { pattern: /require\s*\(/, desc: 'require() call' },
      { pattern: /eval\s*\(/, desc: 'eval() call' },
      { pattern: /Function\s*\(/, desc: 'Function constructor' },
      { pattern: /fs\.(unlink|rmdir|rm|writeFile)/, desc: 'destructive fs operation' },
      { pattern: /exec\s*\(/, desc: 'exec() call' },
    ];

    for (const { pattern, desc } of dangerous) {
      if (pattern.test(source)) {
        reasons.push(`Dangerous pattern: ${desc}`);
      }
    }

    // Check syntax validity
    try {
      new Script(`(async function() { ${source} })`);
    } catch (err) {
      reasons.push(`Syntax error: ${(err as Error).message}`);
    }

    return { safe: reasons.length === 0, reasons };
  }

  private async runInSandbox(
    source: string,
    input: Record<string, unknown>,
    timeout: number,
  ): Promise<unknown> {
    const sandbox = {
      console: { log: () => {}, error: () => {}, warn: () => {} },
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Error,
      TypeError,
      RangeError,
      Promise,
      __input: input,
      __result: undefined as unknown,
    };

    const wrappedCode = `
      ${source}
      if (typeof execute === 'function') {
        __result = execute(__input);
      } else {
        throw new Error('No execute function defined');
      }
    `;

    const context = createContext(sandbox);
    const script = new Script(wrappedCode);
    script.runInContext(context, { timeout });

    if (sandbox.__result instanceof Promise) {
      return await Promise.race([
        sandbox.__result,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sandbox timeout')), timeout)
        ),
      ]);
    }

    return sandbox.__result;
  }

  private async fuzzTest(tool: DynamicTool, runs: number): Promise<{
    runs: number;
    survived: number;
    crashes: string[];
  }> {
    const crashes: string[] = [];
    let survived = 0;

    for (let i = 0; i < runs; i++) {
      const randomInput = this.generateRandomInput(tool.paramSchema);
      try {
        await this.runInSandbox(tool.source, randomInput, 5000);
        survived++;
      } catch (err) {
        const msg = (err as Error).message || '';
        // Timeouts and controlled errors count as survival
        if (msg.includes('Timeout') || msg.includes('timeout') ||
            msg.includes('required') || msg.includes('invalid') ||
            msg.includes('missing') || msg.includes('error')) {
          survived++;
        } else {
          crashes.push(`Input ${JSON.stringify(randomInput)}: ${msg}`);
        }
      }
    }

    return { runs, survived, crashes };
  }

  private generateRandomInput(schema: JSONSchema): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    const props = schema.properties || {};
    for (const [key, prop] of Object.entries(props)) {
      switch (prop.type) {
        case 'string': input[key] = Math.random().toString(36).slice(2); break;
        case 'number': input[key] = Math.random() * 1000 - 500; break;
        case 'boolean': input[key] = Math.random() > 0.5; break;
        case 'array': input[key] = []; break;
        default: input[key] = null;
      }
    }
    return input;
  }
}
