/**
 * Genesis 6.0 - Tool Dispatcher
 *
 * Intelligent router that:
 * 1. Parses tool calls from LLM responses
 * 2. Routes to appropriate tools (local or MCP)
 * 3. Supports parallel execution
 * 4. Tracks execution status with progress
 * 5. Feeds results back for continued conversation
 */

import { toolRegistry, Tool } from '../tools/index.js';
import { getMCPClient, MCPCallResult } from '../mcp/index.js';
import { MCPServerName } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
  source: 'local' | 'mcp';
  mcpServer?: MCPServerName;
}

export interface ToolResult {
  callId: string;
  name: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  source: 'local' | 'mcp';
}

export interface DispatchResult {
  success: boolean;
  results: ToolResult[];
  totalDuration: number;
  parallelExecutions: number;
  sequentialExecutions: number;
}

export interface DispatcherConfig {
  maxParallel: number;
  timeout: number;
  retries: number;
  verbose: boolean;
  onProgress?: (status: ProgressStatus) => void;
}

export interface ProgressStatus {
  phase: 'parsing' | 'validating' | 'executing' | 'complete';
  current: number;
  total: number;
  currentTool?: string;
  message?: string;
}

// LLM tool call format (OpenAI-style)
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ============================================================================
// Tool Name Normalization / Aliases
// ============================================================================

/**
 * Map generic/alternate tool names to canonical MCP tool names.
 * Handles cases where LLMs generate variations like:
 * - "filesystem" instead of "read_file"
 * - "web_search" instead of "brave_web_search"
 * - "search" instead of specific search tools
 */
export const TOOL_ALIASES: Record<string, string> = {
  // Filesystem aliases
  'filesystem': 'list_directory',  // Default filesystem action
  'fs': 'list_directory',
  'file': 'read_file',
  'readfile': 'read_file',
  'read-file': 'read_file',
  'writefile': 'write_file',
  'write-file': 'write_file',
  'listdir': 'list_directory',
  'list-directory': 'list_directory',
  'ls': 'list_directory',
  'cat': 'read_file',
  'mkdir': 'create_directory',

  // Search aliases
  'search': 'brave_web_search',
  'web-search': 'brave_web_search',
  'websearch': 'brave_web_search',
  'google': 'brave_web_search',
  'bing': 'brave_web_search',
  'brave-search': 'brave_web_search',  // Server name -> tool name
  'brave': 'brave_web_search',

  // Academic search aliases
  'arxiv': 'search_arxiv',
  'papers': 'search_arxiv',
  'academic_search': 'search_arxiv',
  'scholar': 'search_semantic_scholar',

  // v7.15.8: Semantic Scholar aliases
  'semantic-scholar': 'search_semantic_scholar',
  'semantic_scholar': 'search_semantic_scholar',
  'semanticScholar': 'search_semantic_scholar',
  'semantic-scholar.search': 'search_semantic_scholar',
  'semantic-scholar.searchPapers': 'search_semantic_scholar',
  'semantic_scholar_search': 'search_semantic_scholar',
  'semanticScholar.search': 'search_semantic_scholar',
  'semantic-scholar.getPaper': 'get_semantic_scholar_paper',
  'semantic-scholar.citations': 'get_paper_citations',

  // v7.15.8: Context7 aliases
  'context7': 'resolve-library-id',
  'Context7': 'resolve-library-id',
  'context7.resolve': 'resolve-library-id',
  'context7.resolveLibrary': 'resolve-library-id',
  'context7.query': 'query-docs',
  'context7.queryDocs': 'query-docs',
  'context7.getDocs': 'query-docs',
  'context7_resolve': 'resolve-library-id',
  'context7_query': 'query-docs',

  // v7.15.9: Playwright aliases
  'playwright': 'browser_navigate',
  'Playwright': 'browser_navigate',
  'browser': 'browser_navigate',
  'playwright.navigate': 'browser_navigate',
  'playwright.goto': 'browser_navigate',
  'playwright.snapshot': 'browser_snapshot',
  'playwright.screenshot': 'browser_take_screenshot',
  'playwright.click': 'browser_click',
  'playwright.type': 'browser_type',
  'playwright_navigate': 'browser_navigate',
  'playwright_snapshot': 'browser_snapshot',
  'navigate': 'browser_navigate',
  'goto': 'browser_navigate',
  'screenshot': 'browser_take_screenshot',

  // v7.15.10: AWS aliases
  'aws': 'cloud_servers',
  'AWS': 'cloud_servers',
  'aws.ec2': 'cloud_servers',
  'aws.s3': 'cloud_storage',
  'aws.listInstances': 'cloud_servers',
  'aws.databases': 'databases',
  'aws.lambda': 'serverless_functions',
  'aws.logs': 'logs_and_metrics',
  'aws.costs': 'cost_optimizer',
  'aws.security': 'security_scanner',
  'ec2': 'cloud_servers',
  's3': 'cloud_storage',
  'rds': 'databases',

  // v7.15.10: Postgres aliases
  'postgres': 'query',
  'Postgres': 'query',
  'postgres.query': 'query',
  'sql': 'query',
  'pg': 'query',

  // v7.15.9: Sentry aliases
  'sentry': 'sentry_find_organizations',
  'Sentry': 'sentry_find_organizations',
  'sentry.organizations': 'sentry_find_organizations',
  'sentry.projects': 'sentry_find_projects',
  'sentry.issues': 'sentry_search_issues',
  'sentry.searchIssues': 'sentry_search_issues',
  'sentry.getIssue': 'sentry_get_issue_details',
  'sentry.analyze': 'sentry_analyze_issue_with_seer',
  'sentry_organizations': 'sentry_find_organizations',
  'sentry_projects': 'sentry_find_projects',
  'sentry_issues': 'sentry_search_issues',

  // v7.15.7: Exa aliases
  'exa': 'web_search_exa',
  'exa_search': 'web_search_exa',
  'exa.search': 'web_search_exa',
  'exa.web_search': 'web_search_exa',
  'exa.webSearch': 'web_search_exa',
  'exa_web_search': 'web_search_exa',
  'exa.code': 'get_code_context_exa',
  'exa.get_code_context': 'get_code_context_exa',
  'exa_code': 'get_code_context_exa',

  // v7.15.7: Gemini aliases
  'gemini': 'web_search',
  'gemini_search': 'web_search',
  'gemini.search': 'web_search',
  'gemini.web_search': 'web_search',
  'gemini.webSearch': 'web_search',
  'gemini_web_search': 'web_search',

  // Memory/knowledge graph aliases
  'memory': 'read_graph',
  'kg': 'read_graph',
  'knowledge_graph': 'read_graph',
  'remember': 'create_entities',
  'recall': 'search_nodes',

  // GitHub aliases
  'github': 'search_repositories',
  'gh': 'search_repositories',
  'repo': 'search_repositories',
  'repositories': 'search_repositories',

  // Stability AI aliases (server name -> default tool)
  'stability-ai': 'stability-ai-generate-image',
  'stability': 'stability-ai-generate-image',
  'image': 'stability-ai-generate-image',
  'generate-image': 'stability-ai-generate-image',

  // Shell/Bash aliases (local execution)
  'shell': 'bash',
  'exec': 'bash',
  'run': 'bash',
  'terminal': 'bash',
  'cmd': 'bash',
  'command': 'bash',

  // Time alias (no MCP server - use local)
  'time': '_local_time',  // Special marker for local time handling
  'datetime': '_local_time',
  'date': '_local_time',
  'now': '_local_time',

  // Generic MCP (can't route - mark as invalid)
  'mcp': '_invalid_generic_mcp',
  'tool': '_invalid_generic_tool',

  // ============================================================================
  // v7.15.2: Compound name aliases (LLM generates server_tool patterns)
  // ============================================================================

  // Compound filesystem aliases
  'filesystem_list_directory': 'list_directory',
  'filesystem_read_file': 'read_file',
  'filesystem_write_file': 'write_file',
  'filesystem_create_directory': 'create_directory',
  'filesystem_directory_tree': 'directory_tree',
  'filesystem_get_file_info': 'get_file_info',
  'filesystem_search_files': 'search_files',
  'filesystem_move_file': 'move_file',
  'filesystem_edit_file': 'edit_file',
  'filesystem_list_allowed_directories': 'list_allowed_directories',

  // Compound memory/knowledge_graph aliases
  'knowledge_graph_read_graph': 'read_graph',
  'knowledge_graph_create_entities': 'create_entities',
  'knowledge_graph_create_relations': 'create_relations',
  'knowledge_graph_add_observations': 'add_observations',
  'knowledge_graph_search_nodes': 'search_nodes',
  'knowledge_graph_open_nodes': 'open_nodes',
  'knowledge_graph_delete_entities': 'delete_entities',
  'knowledge_graph_delete_relations': 'delete_relations',
  'memory_read_graph': 'read_graph',
  'memory_create_entities': 'create_entities',
  'memory_create_relations': 'create_relations',
  'memory_search_nodes': 'search_nodes',

  // v7.15.4: Dot-separated patterns (LLM generates server.tool format)
  'memory.read_graph': 'read_graph',
  'memory.create_entities': 'create_entities',
  'memory.create_relations': 'create_relations',
  'memory.add_observations': 'add_observations',
  'memory.search_nodes': 'search_nodes',
  'memory.open_nodes': 'open_nodes',
  'memory.delete_entities': 'delete_entities',
  'memory.add_entity': 'create_entities',
  'memory.add_entities': 'create_entities',
  'filesystem.list_directory': 'list_directory',
  'filesystem.read_file': 'read_file',
  'filesystem.write_file': 'write_file',
  'filesystem.create_directory': 'create_directory',
  'filesystem.directory_tree': 'directory_tree',
  'filesystem.get_file_info': 'get_file_info',
  'filesystem.search_files': 'search_files',

  // Alternative verb forms
  'add_entity': 'create_entities',
  'add_entities': 'create_entities',
  'create_entity': 'create_entities',
  'add_relation': 'create_relations',
  'add_relations': 'create_relations',
  'create_relation': 'create_relations',
  'add_observation': 'add_observations',

  // v7.15.5: CamelCase dot-separated patterns
  'knowledgeGraph.readEntities': 'read_graph',
  'knowledgeGraph.createEntities': 'create_entities',
  'knowledgeGraph.createRelations': 'create_relations',
  'knowledgeGraph.addObservations': 'add_observations',
  'knowledgeGraph.searchNodes': 'search_nodes',
  'knowledgeGraph.readGraph': 'read_graph',
  'knowledgeGraph.getEntities': 'read_graph',
  'knowledgeGraph.listEntities': 'read_graph',
  'knowledgeGraph.addEntity': 'create_entities',
  'fileSystem.listDirectory': 'list_directory',
  'fileSystem.readFile': 'read_file',
  'fileSystem.writeFile': 'write_file',
  'fileSystem.createDirectory': 'create_directory',

  // read_entities / get_graph variants
  'read_entities': 'read_graph',
  'get_entities': 'read_graph',
  'list_entities': 'read_graph',
  'get_graph': 'read_graph',

  // Compound brave search aliases
  'brave_search_web_search': 'brave_web_search',
  'brave_search_news_search': 'brave_news_search',
  'brave_search_image_search': 'brave_image_search',
  'brave_search_local_search': 'brave_local_search',

  // Compound arxiv aliases
  'arxiv_search': 'search_arxiv',
  'arxiv_search_arxiv': 'search_arxiv',
  'arxiv_parse_paper': 'parse_paper_content',
  'arxiv_get_pdf': 'get_arxiv_pdf_url',

  // Compound github aliases
  'github_search_repositories': 'search_repositories',
  'github_create_issue': 'create_issue',
  'github_list_issues': 'list_issues',
  'github_create_pull_request': 'create_pull_request',

  // v7.15.6: GitHub dot-separated patterns
  'github.search_repositories': 'search_repositories',
  'github.searchRepositories': 'search_repositories',
  'github.list_issues': 'list_issues',
  'github.listIssues': 'list_issues',
  'github.create_issue': 'create_issue',
  'github.createIssue': 'create_issue',
  'github.get_issue': 'get_issue',
  'github.getIssue': 'get_issue',
  'github.create_pull_request': 'create_pull_request',
  'github.createPullRequest': 'create_pull_request',
  'github.list_pull_requests': 'list_pull_requests',
  'github.listPullRequests': 'list_pull_requests',
  'github.get_file_contents': 'get_file_contents',
  'github.getFileContents': 'get_file_contents',

  // Meta-commands (handled specially)
  'mcp_list_tools': '_meta_list_tools',
  'list_tools': '_meta_list_tools',
  'available_tools': '_meta_list_tools',
  'get_tools': '_meta_list_tools',
};

/**
 * Context-aware tool resolution based on parameters.
 * When a generic tool is called with specific params, infer the right tool.
 */
function resolveToolFromContext(name: string, params: Record<string, unknown>): string {
  const lowerName = name.toLowerCase().replace(/-/g, '_');

  // Handle "filesystem" with context
  if (lowerName === 'filesystem' || lowerName === 'fs') {
    if (params.content !== undefined || params.data !== undefined) {
      return 'write_file';
    }
    if (params.path && typeof params.path === 'string') {
      // If path looks like a file (has extension), read it
      if (params.path.includes('.')) {
        return 'read_file';
      }
      // Otherwise list directory
      return 'list_directory';
    }
  }

  // Handle generic "search" with context
  if (lowerName === 'search') {
    if (params.arxiv || params.paper || params.academic) {
      return 'search_arxiv';
    }
    if (params.code || params.github || params.repo) {
      return 'search_code';
    }
    return 'brave_web_search';
  }

  // Handle "memory" with context
  if (lowerName === 'memory' || lowerName === 'kg') {
    if (params.entities || params.create) {
      return 'create_entities';
    }
    if (params.relations) {
      return 'create_relations';
    }
    if (params.query || params.search) {
      return 'search_nodes';
    }
    return 'read_graph';
  }

  return name;
}

// ============================================================================
// Tool Categories for Routing
// ============================================================================

const LOCAL_TOOLS = [
  // File tools
  'bash', 'edit', 'write', 'read', 'glob', 'grep',
  // Git tools
  'git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_push',
  'git_branch', 'git_checkout',
];

const MCP_TOOL_MAP: Record<string, MCPServerName> = {
  // Knowledge - ArXiv
  'search_arxiv': 'arxiv',
  'parse_paper_content': 'arxiv',
  'get_recent_ai_papers': 'arxiv',
  'get_arxiv_pdf_url': 'arxiv',

  // Knowledge - Semantic Scholar
  'search_semantic_scholar': 'semantic-scholar',
  'get_semantic_scholar_paper': 'semantic-scholar',
  'get_paper_citations': 'semantic-scholar',
  'semantic_scholar_to_bibtex': 'semantic-scholar',

  // Knowledge - Context7
  'resolve-library-id': 'context7',
  'query-docs': 'context7',

  // Knowledge - Wolfram
  'wolfram_query': 'wolfram',

  // Research - Gemini
  'web_search': 'gemini',
  'web_search_batch': 'gemini',
  'health_check': 'gemini',

  // Research - Brave Search (ALL tools)
  'brave_web_search': 'brave-search',
  'brave_local_search': 'brave-search',
  'brave_news_search': 'brave-search',
  'brave_image_search': 'brave-search',
  'brave_video_search': 'brave-search',
  'brave_summarizer': 'brave-search',

  // Research - EXA
  'web_search_exa': 'exa',
  'get_code_context_exa': 'exa',

  // Research - Firecrawl (ALL tools)
  'firecrawl_scrape': 'firecrawl',
  'firecrawl_search': 'firecrawl',
  'firecrawl_map': 'firecrawl',
  'firecrawl_crawl': 'firecrawl',
  'firecrawl_check_crawl_status': 'firecrawl',
  'firecrawl_extract': 'firecrawl',
  'firecrawl_agent': 'firecrawl',
  'firecrawl_agent_status': 'firecrawl',

  // Creation - OpenAI
  'openai_chat': 'openai',

  // Creation - GitHub (ALL tools)
  'create_repository': 'github',
  'search_repositories': 'github',
  'create_issue': 'github',
  'list_issues': 'github',
  'get_issue': 'github',
  'update_issue': 'github',
  'add_issue_comment': 'github',
  'create_pull_request': 'github',
  'get_pull_request': 'github',
  'list_pull_requests': 'github',
  'merge_pull_request': 'github',
  'get_pull_request_files': 'github',
  'create_pull_request_review': 'github',
  'get_file_contents': 'github',
  'create_or_update_file': 'github',
  'push_files': 'github',
  'create_branch': 'github',
  'list_commits': 'github',
  'fork_repository': 'github',
  'search_code': 'github',
  'search_issues': 'github',
  'search_users': 'github',

  // Storage - Memory (knowledge graph)
  'create_entities': 'memory',
  'create_relations': 'memory',
  'add_observations': 'memory',
  'delete_entities': 'memory',
  'delete_relations': 'memory',
  'delete_observations': 'memory',
  'search_nodes': 'memory',
  'open_nodes': 'memory',
  'read_graph': 'memory',

  // Storage - Filesystem (ALL tools)
  'read_file': 'filesystem',
  'read_text_file': 'filesystem',
  'read_media_file': 'filesystem',
  'read_multiple_files': 'filesystem',
  'write_file': 'filesystem',
  'edit_file': 'filesystem',
  'create_directory': 'filesystem',
  'list_directory': 'filesystem',
  'list_directory_with_sizes': 'filesystem',
  'directory_tree': 'filesystem',
  'move_file': 'filesystem',
  'search_files': 'filesystem',
  'get_file_info': 'filesystem',
  'list_allowed_directories': 'filesystem',

  // Visual - Stability AI (ALL tools)
  'stability-ai-generate-image': 'stability-ai',
  'stability-ai-generate-image-sd35': 'stability-ai',
  'stability-ai-remove-background': 'stability-ai',
  'stability-ai-outpaint': 'stability-ai',
  'stability-ai-search-and-replace': 'stability-ai',
  'stability-ai-upscale-fast': 'stability-ai',
  'stability-ai-upscale-creative': 'stability-ai',
  'stability-ai-control-sketch': 'stability-ai',
  'stability-ai-0-list-resources': 'stability-ai',
  'stability-ai-search-and-recolor': 'stability-ai',
  'stability-ai-replace-background-and-relight': 'stability-ai',
  'stability-ai-control-style': 'stability-ai',
  'stability-ai-control-structure': 'stability-ai',

  // v7.15.9: Browser - Playwright (ALL tools)
  'browser_navigate': 'playwright',
  'browser_snapshot': 'playwright',
  'browser_click': 'playwright',
  'browser_type': 'playwright',
  'browser_fill_form': 'playwright',
  'browser_take_screenshot': 'playwright',
  'browser_close': 'playwright',
  'browser_resize': 'playwright',
  'browser_press_key': 'playwright',
  'browser_hover': 'playwright',
  'browser_select_option': 'playwright',
  'browser_tabs': 'playwright',
  'browser_navigate_back': 'playwright',
  'browser_wait_for': 'playwright',
  'browser_evaluate': 'playwright',
  'browser_console_messages': 'playwright',
  'browser_network_requests': 'playwright',
  'browser_handle_dialog': 'playwright',
  'browser_file_upload': 'playwright',
  'browser_drag': 'playwright',
  'browser_install': 'playwright',
  'browser_run_code': 'playwright',

  // v7.15.10: AWS MCP tools
  'cloud_servers': 'aws',
  'cloud_storage': 'aws',
  'logs_and_metrics': 'aws',
  'ai_assistant': 'aws',
  'databases': 'aws',
  'serverless_functions': 'aws',
  'security_permissions': 'aws',
  'network_manager': 'aws',
  'cost_optimizer': 'aws',
  'security_scanner': 'aws',
  'multi_region': 'aws',
  'workflow': 'aws',
  'runbook': 'aws',
  'route53': 'aws',
  'secrets_manager': 'aws',
  'cloudfront': 'aws',
  'remote_commands': 'aws',
  'scheduled_ops': 'aws',
  'auto_remediation': 'aws',
  'slack_webhook': 'aws',
  'teams_webhook': 'aws',

  // v7.15.10: Postgres MCP tools
  'query': 'postgres',

  // v7.15.9: Monitoring - Sentry (using sentry_ prefix to avoid GitHub conflicts)
  'sentry_find_organizations': 'sentry',
  'sentry_find_teams': 'sentry',
  'sentry_find_projects': 'sentry',
  'sentry_find_releases': 'sentry',
  'sentry_get_issue_details': 'sentry',
  'sentry_get_trace_details': 'sentry',
  'sentry_get_event_attachment': 'sentry',
  'sentry_update_issue': 'sentry',
  'sentry_search_events': 'sentry',
  'sentry_search_issues': 'sentry',
  'sentry_search_issue_events': 'sentry',
  'sentry_create_team': 'sentry',
  'sentry_create_project': 'sentry',
  'sentry_update_project': 'sentry',
  'sentry_create_dsn': 'sentry',
  'sentry_find_dsns': 'sentry',
  'sentry_analyze_issue_with_seer': 'sentry',
  'sentry_search_docs': 'sentry',
  'sentry_get_doc': 'sentry',
  'sentry_whoami': 'sentry',
};

// ============================================================================
// v7.3: Static Tool Schemas (fallback when MCP discovery fails)
// ============================================================================

const STATIC_TOOL_SCHEMAS: Record<string, { description?: string; inputSchema?: any }> = {
  // Gemini - note: parameter is 'q' not 'query'
  'web_search': {
    description: 'Web search via Gemini AI',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query (required)' },
        mode: { type: 'string', description: 'Search mode: normal or research' },
      },
      required: ['q'],
    },
  },

  // Brave Search
  'brave_web_search': {
    description: 'Web search via Brave',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (required)' },
        count: { type: 'number', description: 'Number of results (1-20)' },
      },
      required: ['query'],
    },
  },

  // arXiv
  'search_arxiv': {
    description: 'Search academic papers on arXiv',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },

  // OpenAI
  'openai_chat': {
    description: 'Chat completion via GPT-4',
    inputSchema: {
      type: 'object',
      properties: {
        messages: { type: 'array', description: 'Array of {role, content} messages' },
        model: { type: 'string', description: 'Model: gpt-4o, gpt-4o-mini, o1-preview' },
      },
      required: ['messages'],
    },
  },

  // Filesystem
  'read_file': {
    description: 'Read file contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
      },
      required: ['path'],
    },
  },
  'write_file': {
    description: 'Write content to file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  'list_directory': {
    description: 'List directory contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
      },
      required: ['path'],
    },
  },

  // Memory
  'read_graph': {
    description: 'Read the entire knowledge graph',
    inputSchema: { type: 'object', properties: {} },
  },
  'search_nodes': {
    description: 'Search nodes in knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  'create_entities': {
    description: 'Create entities in knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        entities: { type: 'array', description: 'Array of {name, entityType, observations}' },
      },
      required: ['entities'],
    },
  },
  'create_relations': {
    description: 'Create relations between entities in knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        relations: { type: 'array', description: 'Array of {from, to, relationType}' },
      },
      required: ['relations'],
    },
  },
  'add_observations': {
    description: 'Add observations to existing entities',
    inputSchema: {
      type: 'object',
      properties: {
        observations: { type: 'array', description: 'Array of {entityName, contents[]}' },
      },
      required: ['observations'],
    },
  },

  // GitHub
  'create_repository': {
    description: 'Create GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repository name' },
        description: { type: 'string', description: 'Repository description' },
        private: { type: 'boolean', description: 'Private repository' },
      },
      required: ['name'],
    },
  },

  // Wolfram
  'wolfram_query': {
    description: 'Query Wolfram Alpha for math/science',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query in natural language' },
        mode: { type: 'string', description: 'Mode: llm, full, short, simple' },
      },
      required: ['query'],
    },
  },

  // Firecrawl
  'firecrawl_scrape': {
    description: 'Scrape content from URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        formats: { type: 'array', description: 'Output formats: markdown, html' },
      },
      required: ['url'],
    },
  },
  'firecrawl_search': {
    description: 'Search the web via Firecrawl',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
};

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: DispatcherConfig = {
  maxParallel: 5,
  timeout: 60000,
  retries: 2,
  verbose: false,
};

// ============================================================================
// Dispatcher Class
// ============================================================================

export class ToolDispatcher {
  private config: DispatcherConfig;
  private executionHistory: ToolResult[] = [];

  constructor(config?: Partial<DispatcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse tool calls from LLM response
   */
  parseToolCalls(response: string | LLMToolCall[]): ToolCall[] {
    // If already parsed (from OpenAI-style API)
    if (Array.isArray(response)) {
      return response.map(call => this.parseLLMToolCall(call));
    }

    // Parse from text (XML-style)
    return this.parseXMLToolCalls(response);
  }

  /**
   * Parse OpenAI-style tool call
   */
  private parseLLMToolCall(call: LLMToolCall): ToolCall {
    let name = call.function.name;
    let params: Record<string, unknown> = {};

    try {
      params = JSON.parse(call.function.arguments);
    } catch {
      // Invalid JSON, use empty params
    }

    // Normalize tool name
    name = this.normalizeTool(name, params);

    return {
      id: call.id,
      name,
      params,
      ...this.routeTool(name),
    };
  }

  /**
   * Parse XML-style tool calls from text
   * Example: <tool_use name="bash"><param name="command">ls -la</param></tool_use>
   */
  private parseXMLToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];

    // Match <tool_use> or <function_call> or similar patterns
    const patterns = [
      // <tool_use name="...">...</tool_use>
      /<tool_use\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_use>/gi,
      // <invoke name="...">...</invoke>
      /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/gi,
      // <invoke name="...">...</invoke> (Anthropic namespace)
      /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/antml:invoke>/gi,
      // ```tool\n{name: ..., params: {...}}```
      /```tool\s*\n?\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?\}```/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        const content = match[2] || '';
        const params = this.parseToolParams(content);

        // Normalize tool name
        const normalizedName = this.normalizeTool(name, params);
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: normalizedName,
          params,
          ...this.routeTool(normalizedName),
        });
      }
    }

    // Also check for JSON-style tool calls
    const jsonPattern = /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"params"\s*:\s*(\{[^}]+\})\s*\}/gi;
    let jsonMatch;
    while ((jsonMatch = jsonPattern.exec(text)) !== null) {
      try {
        const name = jsonMatch[1];
        const params = JSON.parse(jsonMatch[2]);
        // Normalize tool name
        const normalizedName = this.normalizeTool(name, params);
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: normalizedName,
          params,
          ...this.routeTool(normalizedName),
        });
      } catch {
        // Invalid JSON, skip
      }
    }

    return calls;
  }

  /**
   * Normalize tool name using aliases and context-aware resolution
   */
  private normalizeTool(name: string, params: Record<string, unknown>): string {
    // First try context-aware resolution
    const contextResolved = resolveToolFromContext(name, params);
    if (contextResolved !== name) {
      if (this.config.verbose) {
        console.log(`  [Normalize] "${name}" -> "${contextResolved}" (context)`);
      }
      return contextResolved;
    }

    // Then try simple aliases
    const lowerName = name.toLowerCase().replace(/-/g, '_');
    const alias = TOOL_ALIASES[lowerName] || TOOL_ALIASES[name];
    if (alias) {
      if (this.config.verbose) {
        console.log(`  [Normalize] "${name}" -> "${alias}" (alias)`);
      }
      return alias;
    }

    return name;
  }

  /**
   * Parse params from tool content
   */
  private parseToolParams(content: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Try JSON first
    try {
      const trimmed = content.trim();
      if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed);
      }
    } catch {
      // Not JSON, continue with XML parsing
    }

    // Parse <param name="...">value</param> OR <parameter name="...">value</parameter>
    // v7.3.2: Support both tag formats (system prompt uses <parameter>, some parsers expect <param>)
    // v7.6.0: Support antml:parameter namespace (Anthropic XML format)
    const paramPattern = /<(?:antml:)?param(?:eter)?\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:antml:)?param(?:eter)?>/gi;
    let match;
    while ((match = paramPattern.exec(content)) !== null) {
      const name = match[1];
      let value: unknown = match[2].trim();

      // Try to parse as JSON if it looks like an object/array
      if ((value as string).startsWith('{') || (value as string).startsWith('[')) {
        try {
          value = JSON.parse(value as string);
        } catch {
          // Keep as string
        }
      }
      // Try to parse as number
      else if (!isNaN(Number(value))) {
        value = Number(value);
      }
      // Try to parse as boolean
      else if (value === 'true' || value === 'false') {
        value = value === 'true';
      }

      params[name] = value;
    }

    // If no params found, treat whole content as 'input'
    if (Object.keys(params).length === 0 && content.trim()) {
      params.input = content.trim();
    }

    return params;
  }

  /**
   * Route tool to local or MCP
   */
  private routeTool(name: string): { source: 'local' | 'mcp'; mcpServer?: MCPServerName } {
    // Handle special pseudo-tools
    if (name === '_local_time' || name === '_meta_list_tools') {
      return { source: 'local' };
    }

    // Check local tools first
    if (LOCAL_TOOLS.includes(name) || toolRegistry.has(name)) {
      return { source: 'local' };
    }

    // Check MCP tools
    const mcpServer = MCP_TOOL_MAP[name];
    if (mcpServer) {
      return { source: 'mcp', mcpServer };
    }

    // Try alias lookup as fallback
    const lowerName = name.toLowerCase().replace(/-/g, '_');
    const alias = TOOL_ALIASES[lowerName] || TOOL_ALIASES[name];
    if (alias && alias !== name && !alias.startsWith('_invalid')) {
      const aliasServer = MCP_TOOL_MAP[alias];
      if (aliasServer) {
        return { source: 'mcp', mcpServer: aliasServer };
      }
    }

    // Default to local (will fail gracefully if not found)
    return { source: 'local' };
  }

  /**
   * Execute tool calls
   */
  async dispatch(calls: ToolCall[]): Promise<DispatchResult> {
    const startTime = Date.now();
    const results: ToolResult[] = [];
    let parallelCount = 0;
    let sequentialCount = 0;

    this.progress({ phase: 'validating', current: 0, total: calls.length });

    // Validate all calls first
    const validCalls: ToolCall[] = [];
    for (const call of calls) {
      const validation = this.validateCall(call);
      if (!validation.valid) {
        results.push({
          callId: call.id,
          name: call.name,
          success: false,
          error: validation.reason,
          duration: 0,
          source: call.source,
        });
      } else {
        validCalls.push(call);
      }
    }

    // Group by dependencies (for now, all parallel)
    const groups = this.groupByDependencies(validCalls);

    // Execute each group
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];

      if (group.length > 1) {
        parallelCount++;
      } else {
        sequentialCount++;
      }

      this.progress({
        phase: 'executing',
        current: i + 1,
        total: groups.length,
        message: `Executing group ${i + 1}/${groups.length} (${group.length} tools)`,
      });

      // Execute group in parallel
      const groupResults = await Promise.all(
        group.map(call => this.executeCall(call))
      );

      results.push(...groupResults);
    }

    const totalDuration = Date.now() - startTime;
    this.executionHistory.push(...results);

    this.progress({ phase: 'complete', current: calls.length, total: calls.length });

    return {
      success: results.every(r => r.success),
      results,
      totalDuration,
      parallelExecutions: parallelCount,
      sequentialExecutions: sequentialCount,
    };
  }

  /**
   * Validate a tool call
   */
  private validateCall(call: ToolCall): { valid: boolean; reason?: string } {
    // Check if tool exists
    if (call.source === 'local') {
      // Allow pseudo-tools (handled directly in executeLocalTool)
      if (call.name === '_local_time' || call.name === '_meta_list_tools') {
        return { valid: true };
      }

      const tool = toolRegistry.get(call.name);
      if (!tool) {
        return { valid: false, reason: `Unknown tool: ${call.name}` };
      }

      // Run tool-specific validation
      if (tool.validate) {
        return tool.validate(call.params);
      }
    } else if (call.source === 'mcp') {
      if (!call.mcpServer) {
        return { valid: false, reason: `No MCP server for tool: ${call.name}` };
      }
    }

    return { valid: true };
  }

  /**
   * Group calls by dependencies
   * For now, all calls are independent and can run in parallel
   */
  private groupByDependencies(calls: ToolCall[]): ToolCall[][] {
    // Simple grouping: max N parallel
    const groups: ToolCall[][] = [];

    for (let i = 0; i < calls.length; i += this.config.maxParallel) {
      groups.push(calls.slice(i, i + this.config.maxParallel));
    }

    return groups;
  }

  /**
   * Execute a single tool call
   */
  private async executeCall(call: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      if (this.config.verbose) {
        console.log(`  Executing: ${call.name}`);
      }

      let data: unknown;

      if (call.source === 'local') {
        data = await this.executeLocalTool(call);
      } else {
        data = await this.executeMCPTool(call);
      }

      return {
        callId: call.id,
        name: call.name,
        success: true,
        data,
        duration: Date.now() - startTime,
        source: call.source,
      };
    } catch (error) {
      return {
        callId: call.id,
        name: call.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        source: call.source,
      };
    }
  }

  /**
   * Execute local tool
   */
  private async executeLocalTool(call: ToolCall): Promise<unknown> {
    // Special handling for built-in pseudo-tools
    if (call.name === '_local_time') {
      const now = new Date();
      return {
        timestamp: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        formatted: now.toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }

    // Meta-command: list all available tools
    if (call.name === '_meta_list_tools') {
      const localTools = LOCAL_TOOLS.map(name => ({
        name,
        source: 'local',
        description: `Local tool: ${name}`,
      }));

      const mcpTools = Object.entries(MCP_TOOL_MAP).map(([tool, server]) => ({
        name: tool,
        source: 'mcp',
        server,
        description: STATIC_TOOL_SCHEMAS[tool]?.description || `MCP tool on ${server}`,
      }));

      return {
        total: localTools.length + mcpTools.length,
        local: localTools,
        mcp: mcpTools,
        aliases: Object.keys(TOOL_ALIASES).length,
      };
    }

    const tool = toolRegistry.get(call.name);
    if (!tool) {
      throw new Error(`Tool not found: ${call.name}`);
    }

    return tool.execute(call.params);
  }

  /**
   * Execute MCP tool
   */
  private async executeMCPTool(call: ToolCall): Promise<unknown> {
    if (!call.mcpServer) {
      throw new Error(`No MCP server for tool: ${call.name}`);
    }

    const client = getMCPClient();
    const result = await client.call(call.mcpServer, call.name, call.params);

    if (!result.success) {
      throw new Error(result.error || 'MCP call failed');
    }

    return result.data;
  }

  /**
   * Report progress
   */
  private progress(status: ProgressStatus): void {
    if (this.config.onProgress) {
      this.config.onProgress(status);
    }
  }

  /**
   * Get execution history
   */
  getHistory(): ToolResult[] {
    return [...this.executionHistory];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<DispatcherConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get available tools (names only, for backward compatibility)
   */
  listTools(): { local: string[]; mcp: Record<string, string[]> } {
    const local = Array.from(toolRegistry.keys());

    const mcp: Record<string, string[]> = {};
    for (const [tool, server] of Object.entries(MCP_TOOL_MAP)) {
      if (!mcp[server]) {
        mcp[server] = [];
      }
      mcp[server].push(tool);
    }

    return { local, mcp };
  }

  /**
   * Get available tools with schemas (for dynamic prompt building)
   * Returns tool definitions with name, description, and inputSchema
   * Note: This is the sync version with static fallbacks - use discoverToolsWithSchemas() for real schemas
   */
  listToolsWithSchemas(): {
    local: Array<{ name: string; description?: string }>;
    mcp: Record<string, Array<{ name: string; description?: string }>>;
  } {
    // Local tools with basic info from registry
    const local = Array.from(toolRegistry.entries()).map(([name, tool]) => ({
      name,
      description: tool.description,
    }));

    // MCP tools - use static fallback schemas
    const mcp: Record<string, Array<{ name: string; description?: string }>> = {};
    for (const [tool, server] of Object.entries(MCP_TOOL_MAP)) {
      if (!mcp[server]) {
        mcp[server] = [];
      }
      mcp[server].push({ name: tool, ...STATIC_TOOL_SCHEMAS[tool] });
    }

    return { local, mcp };
  }

  /**
   * v7.3: Discover tools with REAL schemas from MCP servers
   * Falls back to static schemas for servers that fail to connect
   */
  async discoverToolsWithSchemas(): Promise<{
    local: Array<{ name: string; description?: string; inputSchema?: any }>;
    mcp: Record<string, Array<{ name: string; description?: string; inputSchema?: any }>>;
  }> {
    const local = Array.from(toolRegistry.entries()).map(([name, tool]) => ({
      name,
      description: tool.description,
    }));

    // Try to get real schemas from MCP client
    const client = getMCPClient();
    let realSchemas: Record<string, Array<{ name: string; description?: string; inputSchema?: any }>> = {};

    try {
      realSchemas = await client.discoverAllTools();
    } catch {
      // Fall back to static schemas
      console.log('[Dispatcher] Failed to discover MCP tools, using static schemas');
    }

    // Merge real schemas with static fallbacks
    const mcp: Record<string, Array<{ name: string; description?: string; inputSchema?: any }>> = {};
    for (const [tool, server] of Object.entries(MCP_TOOL_MAP)) {
      if (!mcp[server]) {
        mcp[server] = realSchemas[server] || [];
      }
      // If tool not in real schemas, add static fallback
      if (!mcp[server].find(t => t.name === tool)) {
        mcp[server].push({ name: tool, ...STATIC_TOOL_SCHEMAS[tool] });
      }
    }

    return { local, mcp };
  }

  /**
   * Format results for LLM context
   * v7.16: Enhanced with anti-confabulation markers for failed tools
   */
  formatResultsForLLM(results: ToolResult[]): string {
    const lines: string[] = ['<tool_results>'];

    for (const result of results) {
      lines.push(`<result name="${result.name}" success="${result.success}">`);

      if (result.success) {
        const data = typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2);
        lines.push(data);
      } else {
        // CRITICAL: Explicit failure marker to prevent confabulation
        lines.push(`⚠️ TOOL EXECUTION FAILED ⚠️`);
        lines.push(`Error: ${result.error}`);
        lines.push(`INSTRUCTION: Report this error to the user. Do NOT fabricate output.`);
      }

      lines.push('</result>');
    }

    // Add failure summary if any tools failed
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      lines.push(`<failures count="${failures.length}">`);
      lines.push(`Tools that failed: ${failures.map(f => f.name).join(', ')}`);
      lines.push(`You MUST acknowledge these failures. Do NOT invent results.`);
      lines.push(`</failures>`);
    }

    lines.push('</tool_results>');
    return lines.join('\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let dispatcherInstance: ToolDispatcher | null = null;

export function getDispatcher(config?: Partial<DispatcherConfig>): ToolDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new ToolDispatcher(config);
  } else if (config) {
    dispatcherInstance.updateConfig(config);
  }
  return dispatcherInstance;
}

export function resetDispatcher(): void {
  dispatcherInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parse and dispatch tool calls from LLM response
 */
export async function dispatchTools(
  response: string | LLMToolCall[],
  config?: Partial<DispatcherConfig>
): Promise<DispatchResult> {
  const dispatcher = getDispatcher(config);
  const calls = dispatcher.parseToolCalls(response);
  return dispatcher.dispatch(calls);
}

/**
 * Execute a single tool by name
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const dispatcher = getDispatcher();
  const call: ToolCall = {
    id: `call_${Date.now()}`,
    name,
    params,
    ...dispatcher['routeTool'](name),
  };

  const result = await dispatcher.dispatch([call]);
  return result.results[0];
}

/**
 * List all available tools
 */
export function listAllTools(): { local: string[]; mcp: Record<string, string[]> } {
  return getDispatcher().listTools();
}
