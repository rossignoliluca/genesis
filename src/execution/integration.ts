/**
 * Genesis Code Execution - Active Inference Integration
 *
 * Connects runtime code execution to the Active Inference loop.
 * Execution results become observations that update beliefs,
 * driving the Generate → Execute → Observe → Adapt cycle.
 *
 * This is the cognitive loop:
 * 1. Active Inference selects 'execute.code' action
 * 2. CodeRuntime executes the code
 * 3. Observation is generated from execution result
 * 4. Observation updates beliefs (A matrix)
 * 5. If error, Expected Free Energy suggests 'adapt.code' action
 * 6. Cycle repeats until success or iteration limit
 */

import { getCodeRuntime, ExecutionResult, ExecutionObservation, CodeRuntime } from './runtime.js';
import { registerAction, ActionResult, ActionContext } from '../active-inference/actions.js';
import { ActionType, Observation } from '../active-inference/types.js';

// ============================================================================
// Types
// ============================================================================

export interface CodeExecutionContext extends ActionContext {
  code: string;
  language: 'typescript' | 'javascript' | 'python';
  purpose?: string;
  maxIterations?: number;
}

export interface CodeAdaptationContext extends ActionContext {
  originalCode: string;
  executionResult: ExecutionResult;
  observation: ExecutionObservation;
  iteration: number;
}

export interface ExecutionCycleResult {
  success: boolean;
  finalCode: string;
  iterations: number;
  executionResults: ExecutionResult[];
  observations: ExecutionObservation[];
  beliefUpdates: number;
}

// ============================================================================
// Action Registration
// ============================================================================

/**
 * Register execution-related actions with Active Inference
 */
export function registerExecutionActions(): void {
  // Execute code action
  registerAction('execute.code', executeCodeAction);

  // Adapt code based on errors action
  registerAction('adapt.code', adaptCodeAction);

  // Full execution cycle with iteration
  registerAction('execute.cycle', executeCycleAction);
}

// ============================================================================
// Execute Code Action
// ============================================================================

async function executeCodeAction(context: ActionContext): Promise<ActionResult> {
  const execContext = context as CodeExecutionContext;
  const runtime = getCodeRuntime();

  if (!execContext.code) {
    return {
      success: false,
      action: 'execute.code',
      error: 'No code provided',
      duration: 0,
    };
  }

  const startTime = Date.now();

  try {
    const result = await runtime.execute({
      code: execContext.code,
      language: execContext.language || 'typescript',
    });

    // Generate observation
    const observation = runtime.generateObservation(result);

    return {
      success: result.success,
      action: 'execute.code',
      data: {
        executionId: result.id,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 1000),
        stderr: result.stderr.slice(0, 500),
        observation,
        suggestions: observation.data.suggestions,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      action: 'execute.code',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Adapt Code Action
// ============================================================================

async function adaptCodeAction(context: ActionContext): Promise<ActionResult> {
  const adaptContext = context as CodeAdaptationContext;
  const startTime = Date.now();

  if (!adaptContext.originalCode || !adaptContext.observation) {
    return {
      success: false,
      action: 'adapt.code',
      error: 'Original code and observation required',
      duration: 0,
    };
  }

  try {
    // Analyze errors and generate fixes
    const errors = adaptContext.observation.data.errorPatterns;
    let modifiedCode = adaptContext.originalCode;

    for (const error of errors) {
      modifiedCode = applyFix(modifiedCode, error);
    }

    return {
      success: modifiedCode !== adaptContext.originalCode,
      action: 'adapt.code',
      data: {
        originalLength: adaptContext.originalCode.length,
        modifiedLength: modifiedCode.length,
        fixesApplied: errors.length,
        modifiedCode,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      action: 'adapt.code',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Apply automatic fixes based on error patterns
 */
function applyFix(code: string, error: { type: string; message: string; line?: number }): string {
  let modified = code;

  switch (error.type) {
    case 'import':
      // Try to fix missing imports
      const moduleMatch = error.message.match(/Module not found: (.+)/);
      if (moduleMatch) {
        modified = `// TODO: npm install ${moduleMatch[1]}\n${modified}`;
      }
      break;

    case 'type':
      // Add type assertions for common type errors
      if (error.message.includes('undefined')) {
        modified = modified.replace(
          /(\w+)\.(\w+)/g,
          (match, obj, prop) => `${obj}?.${prop}`
        );
      }
      break;

    case 'syntax':
      // Common syntax fixes
      if (error.message.includes('Unexpected end of input')) {
        const openBraces = (modified.match(/\{/g) || []).length;
        const closeBraces = (modified.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          modified += '\n}'.repeat(openBraces - closeBraces);
        }
      }
      break;

    case 'runtime':
      // Add try-catch wrapper
      if (!modified.includes('try {')) {
        modified = `try {\n${modified}\n} catch (e) {\n  console.error('Runtime error:', e);\n}`;
      }
      break;
  }

  return modified;
}

// ============================================================================
// Full Execution Cycle Action
// ============================================================================

async function executeCycleAction(context: ActionContext): Promise<ActionResult> {
  const execContext = context as CodeExecutionContext;
  const startTime = Date.now();

  if (!execContext.code) {
    return {
      success: false,
      action: 'execute.cycle',
      error: 'No code provided',
      duration: 0,
    };
  }

  const maxIterations = execContext.maxIterations || 3;
  const runtime = getCodeRuntime();

  const executionResults: ExecutionResult[] = [];
  const observations: ExecutionObservation[] = [];
  let currentCode = execContext.code;
  let beliefUpdates = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Execute current code
    const result = await runtime.execute({
      code: currentCode,
      language: execContext.language || 'typescript',
    });
    executionResults.push(result);

    // Generate observation
    const observation = runtime.generateObservation(result);
    observations.push(observation);
    beliefUpdates++;

    // If successful, we're done
    if (result.success) {
      return {
        success: true,
        action: 'execute.cycle',
        data: {
          finalCode: currentCode,
          iterations: iteration + 1,
          executionResults,
          observations,
          beliefUpdates,
          finalOutput: result.stdout.slice(0, 2000),
        },
        duration: Date.now() - startTime,
      };
    }

    // Try to adapt code
    const adaptResult = await adaptCodeAction({
      goal: 'fix errors',
      originalCode: currentCode,
      executionResult: result,
      observation,
      iteration,
    } as CodeAdaptationContext);

    if (adaptResult.success && adaptResult.data?.modifiedCode) {
      currentCode = adaptResult.data.modifiedCode;
    } else {
      // Can't adapt further, stop
      break;
    }
  }

  // Failed after all iterations
  return {
    success: false,
    action: 'execute.cycle',
    data: {
      finalCode: currentCode,
      iterations: executionResults.length,
      executionResults,
      observations,
      beliefUpdates,
      lastError: observations[observations.length - 1]?.data.errorPatterns,
    },
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Observation Bridge for Active Inference
// ============================================================================

/**
 * Create observation bridge that feeds execution results
 * into the Active Inference observation stream
 */
export function createExecutionObservationBridge(runtime: CodeRuntime): {
  onExecution: (result: ExecutionResult) => void;
  getObservations: () => ExecutionObservation[];
} {
  const observationBuffer: ExecutionObservation[] = [];

  const onExecution = (result: ExecutionResult) => {
    const observation = runtime.generateObservation(result);
    observationBuffer.push(observation);
  };

  const getObservations = () => [...observationBuffer];

  return { onExecution, getObservations };
}

// ============================================================================
// Convert Execution Observation to Active Inference Observation
// ============================================================================

export function toActiveInferenceObservation(execObs: ExecutionObservation): Observation {
  // Map execution result to Active Inference observation space
  const toolObs = execObs.data.success ? 2 : (execObs.data.hasOutput ? 1 : 0);
  const coherenceObs = execObs.data.errorPatterns.length === 0 ? 2 : 1;

  return {
    energy: 3, // Assume medium energy during execution
    phi: 2,    // Medium consciousness
    tool: toolObs as 0 | 1 | 2,
    coherence: coherenceObs as 0 | 1 | 2,
    task: execObs.data.success ? 3 : 2, // completed or active
  };
}

// ============================================================================
// Initialize
// ============================================================================

let initialized = false;

export function initializeExecutionIntegration(): void {
  if (initialized) return;
  registerExecutionActions();
  initialized = true;
}
