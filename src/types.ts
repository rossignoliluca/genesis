/**
 * Genesis - System Creator Types
 *
 * Core type definitions for MCP orchestration
 */

// ============================================================================
// MCP Server Types
// ============================================================================

/**
 * Names of all 18 MCP servers available to Genesis.
 * Renamed from MCPServer to avoid conflict with MCPServerState interface.
 */
export type MCPServerName =
  | 'filesystem'
  | 'github'
  | 'openai'
  | 'memory'
  | 'gemini'
  | 'context7'
  | 'arxiv'
  | 'semantic-scholar'
  | 'wolfram'
  | 'firecrawl'
  | 'exa'
  | 'brave-search'
  | 'stability-ai'
  // v7.14 - Web & Automation
  | 'playwright'
  | 'aws'
  | 'sentry'
  | 'postgres'
  // v7.19 - HuggingFace Spaces
  | 'huggingface'
  // v7.23 - Autonomous Layer
  | 'stripe'
  | 'coinbase'
  | 'supabase'
  | 'vercel'
  | 'cloudflare'
  | 'pinecone'
  | 'neo4j'
  | 'slack'
  | 'puppeteer'
  | 'sequential-thinking';

/** @deprecated Use MCPServerName instead */
export type MCPServer = MCPServerName;

export interface MCPCapability {
  server: MCPServerName;
  category: 'knowledge' | 'creation' | 'research' | 'visual' | 'storage';
  tools: string[];
  description: string;
}

// ============================================================================
// System Specification
// ============================================================================

export interface SystemSpec {
  name: string;
  description: string;
  type: 'autopoietic' | 'agent' | 'multi-agent' | 'service' | 'custom';
  features: string[];
  constraints?: string[];
  inspirations?: string[];  // Papers, projects, concepts to draw from
}

export interface GeneratedSystem {
  spec: SystemSpec;
  research: ResearchResult;
  architecture: Architecture;
  code: GeneratedCode;
  visuals: Visual[];
  repo?: string;
}

// ============================================================================
// Research Types
// ============================================================================

export interface ResearchResult {
  papers: Paper[];
  documentation: Documentation[];
  codeExamples: CodeExample[];
  webResults: WebResult[];
  insights: string[];
}

export interface Paper {
  title: string;
  authors: string[];
  year: number;
  source: 'arxiv' | 'semantic-scholar';
  url: string;
  summary: string;
  relevance: number;
}

export interface Documentation {
  library: string;
  source: 'context7';
  content: string;
  examples: string[];
}

export interface CodeExample {
  source: 'exa' | 'github';
  language: string;
  code: string;
  description: string;
}

export interface WebResult {
  source: 'gemini' | 'brave-search' | 'firecrawl';
  title: string;
  url: string;
  content: string;
}

// ============================================================================
// Architecture Types
// ============================================================================

export interface Architecture {
  components: Component[];
  relations: Relation[];
  invariants: string[];
  operations: Operation[];
  events: EventType[];
}

export interface Component {
  id: string;
  name: string;
  type: 'core' | 'service' | 'adapter' | 'util';
  description: string;
  dependencies: string[];
}

export interface Relation {
  from: string;
  to: string;
  type: 'uses' | 'extends' | 'implements' | 'triggers';
}

export interface Operation {
  id: string;
  name: string;
  description: string;
  inputs: Parameter[];
  outputs: Parameter[];
  complexity: number;
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
}

export interface EventType {
  name: string;
  payload: Record<string, string>;
}

// ============================================================================
// Generated Code Types
// ============================================================================

export interface GeneratedCode {
  files: CodeFile[];
  language: 'typescript' | 'python' | 'rust';
  framework?: string;
  tests: CodeFile[];
}

export interface CodeFile {
  path: string;
  content: string;
  description: string;
}

// ============================================================================
// Visual Types
// ============================================================================

export interface Visual {
  type: 'architecture' | 'concept' | 'flow' | 'logo';
  prompt: string;
  path: string;
}

// ============================================================================
// Knowledge Graph Types
// ============================================================================

export interface KnowledgeEntity {
  name: string;
  type: string;
  observations: string[];
}

export interface KnowledgeRelation {
  from: string;
  to: string;
  relationType: string;
}

// ============================================================================
// Pipeline Types
// ============================================================================

export type PipelineStage =
  | 'research'
  | 'design'
  | 'generate'
  | 'visualize'
  | 'persist'
  | 'publish';

export interface PipelineResult<T> {
  stage: PipelineStage;
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  mcpsUsed: MCPServerName[];
}

export interface PipelineConfig {
  stages: PipelineStage[];
  parallel: boolean;
  verbose: boolean;
  dryRun: boolean;
}
