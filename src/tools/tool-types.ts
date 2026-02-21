/**
 * Genesis v35 — Typed Tool Definitions
 *
 * Discriminated-union parameter types for every built-in tool.
 * The `tool` field acts as the discriminant so callers can pattern-match:
 *
 *   if (params.tool === 'bash') { params.command … }
 *
 * New tools: add a Params interface here, add it to the ToolParams union,
 * then register via `typedRegistry.set()` in `./index.ts`.
 */

// ============================================================================
// Base constraint — every typed tool params must carry the discriminant
// ============================================================================

interface ToolParamsBase {
  /** Discriminant — must equal the tool's registered name */
  readonly tool: string;
}

// ============================================================================
// Built-in Tool Params (discriminated union members)
// ============================================================================

export interface BashParams extends ToolParamsBase {
  readonly tool: 'bash';
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface TypedEditParams extends ToolParamsBase {
  readonly tool: 'edit';
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface TypedWriteParams extends ToolParamsBase {
  readonly tool: 'write';
  file_path: string;
  content: string;
  backup?: boolean;
}

export interface ReadParams extends ToolParamsBase {
  readonly tool: 'read';
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface GitStatusParams extends ToolParamsBase {
  readonly tool: 'git_status';
  cwd?: string;
}

export interface GitDiffParams extends ToolParamsBase {
  readonly tool: 'git_diff';
  staged?: boolean;
  file?: string;
  cwd?: string;
}

export interface GitLogParams extends ToolParamsBase {
  readonly tool: 'git_log';
  count?: number;
  oneline?: boolean;
  cwd?: string;
}

export interface GitAddParams extends ToolParamsBase {
  readonly tool: 'git_add';
  files: string[];
  cwd?: string;
}

export interface GitCommitParams extends ToolParamsBase {
  readonly tool: 'git_commit';
  message: string;
  amend?: boolean;
  cwd?: string;
}

export interface GitPushParams extends ToolParamsBase {
  readonly tool: 'git_push';
  remote?: string;
  branch?: string;
  force?: boolean;
  cwd?: string;
}

export interface CreateToolParams extends ToolParamsBase {
  readonly tool: 'create_tool';
  name: string;
  description: string;
  source: string;
  paramSchema?: Record<string, unknown>;
  task?: string;
}

export interface ListDynamicToolsParams extends ToolParamsBase {
  readonly tool: 'list_dynamic_tools';
}

// ============================================================================
// Union of all known tool param shapes
// ============================================================================

export type ToolParams =
  | BashParams
  | TypedEditParams
  | TypedWriteParams
  | ReadParams
  | GitStatusParams
  | GitDiffParams
  | GitLogParams
  | GitAddParams
  | GitCommitParams
  | GitPushParams
  | CreateToolParams
  | ListDynamicToolsParams;

// ============================================================================
// Typed Tool Interface
// ============================================================================

/**
 * A tool with fully typed params.
 *
 * @template T - The specific ToolParams variant this tool accepts.
 */
export interface TypedTool<T extends ToolParams = ToolParams> {
  name: string;
  description: string;
  execute: (params: T) => Promise<unknown>;
  validate?: (params: T) => { valid: boolean; reason?: string };
}

// ============================================================================
// Type-level helpers
// ============================================================================

/** Extract the params type for a tool by its name literal */
export type ParamsFor<Name extends ToolParams['tool']> =
  Extract<ToolParams, { tool: Name }>;

/** Narrow a ToolParams to a specific tool name */
export function isToolParams<N extends ToolParams['tool']>(
  params: ToolParams,
  name: N,
): params is ParamsFor<N> {
  return params.tool === name;
}
