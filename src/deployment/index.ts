/**
 * Genesis Deployment Layer - FASE 2
 *
 * Self-deployment capabilities for autonomous operation:
 * - Vercel: Serverless functions, Edge deployment
 * - Supabase: Database, Auth, Storage, Realtime
 * - Cloudflare: CDN, Workers, R2 Storage, DNS
 *
 * Enables Genesis to create and deploy web applications autonomously.
 * All MCP interactions go through the centralized getMCPClient.
 */

import { getMCPClient } from '../mcp/index.js';
import type { MCPServerName } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface WebsiteConfig {
  name: string;
  domain?: string;
  template: 'landing' | 'saas' | 'api' | 'dashboard' | 'marketplace';
  features: WebsiteFeature[];
  database?: DatabaseConfig;
  auth?: AuthConfig;
}

export interface WebsiteFeature {
  type: 'payments' | 'auth' | 'storage' | 'realtime' | 'analytics' | 'api';
  config?: Record<string, unknown>;
}

export interface DatabaseConfig {
  tables: TableDefinition[];
  enableRealtime?: boolean;
  enableRLS?: boolean;
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes?: string[];
}

export interface ColumnDefinition {
  name: string;
  type: 'text' | 'int' | 'bigint' | 'float' | 'boolean' | 'timestamp' | 'uuid' | 'json';
  primaryKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
  default?: string;
  references?: { table: string; column: string };
}

export interface AuthConfig {
  providers: ('email' | 'google' | 'github' | 'twitter')[];
  requireEmailConfirmation?: boolean;
  enableMFA?: boolean;
}

export interface DeploymentResult {
  success: boolean;
  url?: string;
  projectId?: string;
  error?: string;
  resources?: DeployedResource[];
}

export interface DeployedResource {
  type: 'vercel' | 'supabase' | 'cloudflare';
  resource: string;
  url?: string;
  id?: string;
}

// ============================================================================
// Vercel Integration
// ============================================================================

export class VercelDeployer {
  private connected = false;

  async connect(): Promise<boolean> {
    if (!process.env.VERCEL_TOKEN) {
      console.warn('[Vercel] No VERCEL_TOKEN configured');
      return false;
    }
    this.connected = true;
    return true;
  }

  async deploy(config: {
    name: string;
    framework?: 'nextjs' | 'react' | 'vue' | 'static';
    source: string;
    env?: Record<string, string>;
  }): Promise<DeploymentResult> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Vercel' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('vercel' as MCPServerName, 'create_project', {
        name: config.name,
        framework: config.framework || 'nextjs',
        gitRepository: config.source,
        environmentVariables: config.env,
      });

      if (result.success) {
        return {
          success: true,
          url: `https://${config.name}.vercel.app`,
          projectId: result.data?.id,
          resources: [{
            type: 'vercel',
            resource: 'project',
            url: `https://${config.name}.vercel.app`,
            id: result.data?.id,
          }],
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async deployServerlessFunction(config: {
    name: string;
    code: string;
    runtime?: 'nodejs20.x' | 'edge';
    route?: string;
  }): Promise<DeploymentResult> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Vercel' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('vercel' as MCPServerName, 'deploy_function', {
        name: config.name,
        code: config.code,
        runtime: config.runtime || 'edge',
        route: config.route || `/api/${config.name}`,
      });

      if (result.success) {
        return {
          success: true,
          url: result.data?.url,
          resources: [{
            type: 'vercel',
            resource: 'function',
            url: result.data?.url,
            id: result.data?.functionId,
          }],
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getDeployments(): Promise<{ id: string; url: string; state: string; createdAt: string }[]> {
    if (!this.connected) return [];

    try {
      const client = getMCPClient();
      const result = await client.call('vercel' as MCPServerName, 'list_deployments', {});
      return result.data?.deployments || [];
    } catch (error) {
      console.error('[Vercel] Failed to list deployments:', error);
      return [];
    }
  }
}

// ============================================================================
// Supabase Integration
// ============================================================================

export class SupabaseManager {
  private connected = false;

  async connect(): Promise<boolean> {
    if (!process.env.SUPABASE_ACCESS_TOKEN) {
      console.warn('[Supabase] No SUPABASE_ACCESS_TOKEN configured');
      return false;
    }
    this.connected = true;
    return true;
  }

  async createProject(name: string, region?: string): Promise<{
    success: boolean;
    projectId?: string;
    url?: string;
    anonKey?: string;
    serviceKey?: string;
    error?: string;
  }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Supabase' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('supabase' as MCPServerName, 'create_project', {
        name,
        region: region || 'us-east-1',
        plan: 'free',
      });

      if (result.success) {
        return {
          success: true,
          projectId: result.data?.id,
          url: result.data?.url,
          anonKey: result.data?.anonKey,
          serviceKey: result.data?.serviceKey,
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async executeSQL(projectId: string, sql: string): Promise<{
    success: boolean;
    data?: unknown[];
    error?: string;
  }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Supabase' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('supabase' as MCPServerName, 'execute_sql', {
        projectId,
        query: sql,
      });

      return { success: result.success, data: result.data?.rows, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createTable(projectId: string, table: TableDefinition): Promise<{ success: boolean; error?: string }> {
    const columns = table.columns.map(col => {
      let def = `${col.name} ${col.type.toUpperCase()}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.unique) def += ' UNIQUE';
      if (!col.nullable) def += ' NOT NULL';
      if (col.default) def += ` DEFAULT ${col.default}`;
      if (col.references) def += ` REFERENCES ${col.references.table}(${col.references.column})`;
      return def;
    }).join(',\n  ');

    const sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${columns}\n);`;

    let indexSQL = '';
    if (table.indexes) {
      indexSQL = table.indexes.map(idx =>
        `CREATE INDEX IF NOT EXISTS idx_${table.name}_${idx} ON ${table.name}(${idx});`
      ).join('\n');
    }

    const result = await this.executeSQL(projectId, sql + '\n' + indexSQL);
    return { success: result.success, error: result.error };
  }

  async setupAuth(projectId: string, config: AuthConfig): Promise<{ success: boolean; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Supabase' };
    }

    try {
      const client = getMCPClient();
      await client.call('supabase' as MCPServerName, 'configure_auth', {
        projectId,
        providers: config.providers,
        settings: {
          requireEmailConfirmation: config.requireEmailConfirmation ?? true,
          enableMFA: config.enableMFA ?? false,
        },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createBucket(projectId: string, name: string, isPublic: boolean = false): Promise<{
    success: boolean;
    bucketId?: string;
    error?: string;
  }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Supabase' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('supabase' as MCPServerName, 'create_storage_bucket', {
        projectId,
        name,
        public: isPublic,
      });

      return { success: result.success, bucketId: result.data?.id, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async deployEdgeFunction(projectId: string, config: {
    name: string;
    code: string;
    verifyJWT?: boolean;
  }): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Supabase' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('supabase' as MCPServerName, 'deploy_edge_function', {
        projectId,
        name: config.name,
        code: config.code,
        verifyJWT: config.verifyJWT ?? true,
      });

      return { success: result.success, url: result.data?.url, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

// ============================================================================
// Cloudflare Integration
// ============================================================================

export class CloudflareManager {
  private connected = false;

  async connect(): Promise<boolean> {
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      console.warn('[Cloudflare] No CLOUDFLARE_API_TOKEN configured');
      return false;
    }
    this.connected = true;
    return true;
  }

  async deployWorker(config: {
    name: string;
    code: string;
    routes?: string[];
    env?: Record<string, string>;
    kv?: string[];
  }): Promise<{ success: boolean; url?: string; workerId?: string; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Cloudflare' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('cloudflare' as MCPServerName, 'deploy_worker', {
        name: config.name,
        script: config.code,
        routes: config.routes,
        vars: config.env,
        kvNamespaces: config.kv,
      });

      if (result.success) {
        return {
          success: true,
          url: result.data?.url,
          workerId: result.data?.id,
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createKVNamespace(name: string): Promise<{
    success: boolean;
    namespaceId?: string;
    error?: string;
  }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Cloudflare' };
    }

    try {
      const client = getMCPClient();
      const result = await client.call('cloudflare' as MCPServerName, 'create_kv_namespace', { title: name });
      return { success: result.success, namespaceId: result.data?.id, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createR2Bucket(name: string): Promise<{
    success: boolean;
    bucketName?: string;
    error?: string;
  }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Cloudflare' };
    }

    try {
      const client = getMCPClient();
      await client.call('cloudflare' as MCPServerName, 'create_r2_bucket', { name });
      return { success: true, bucketName: name };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async configureDNS(zone: string, records: {
    type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
    name: string;
    content: string;
    proxied?: boolean;
  }[]): Promise<{ success: boolean; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Cloudflare' };
    }

    try {
      const client = getMCPClient();
      for (const record of records) {
        await client.call('cloudflare' as MCPServerName, 'create_dns_record', {
          zone,
          ...record,
        });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async enableCaching(zone: string, settings: {
    cacheLevel?: 'basic' | 'simplified' | 'aggressive';
    browserCacheTTL?: number;
    alwaysOnline?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to Cloudflare' };
    }

    try {
      const client = getMCPClient();
      await client.call('cloudflare' as MCPServerName, 'update_zone_settings', {
        zone,
        settings,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

// ============================================================================
// Website Generator
// ============================================================================

export class WebsiteGenerator {
  private vercel: VercelDeployer;
  private supabase: SupabaseManager;
  private cloudflare: CloudflareManager;

  constructor() {
    this.vercel = new VercelDeployer();
    this.supabase = new SupabaseManager();
    this.cloudflare = new CloudflareManager();
  }

  async initialize(): Promise<{ vercel: boolean; supabase: boolean; cloudflare: boolean }> {
    const [vercel, supabase, cloudflare] = await Promise.all([
      this.vercel.connect(),
      this.supabase.connect(),
      this.cloudflare.connect(),
    ]);

    return { vercel, supabase, cloudflare };
  }

  async createWebsite(config: WebsiteConfig): Promise<DeploymentResult> {
    const resources: DeployedResource[] = [];
    let supabaseProject: { projectId?: string; url?: string; anonKey?: string } = {};

    // Step 1: Create Supabase project for database/auth
    if (config.database || config.auth) {
      const project = await this.supabase.createProject(`${config.name}-db`);
      if (!project.success) {
        return { success: false, error: `Supabase setup failed: ${project.error}` };
      }
      supabaseProject = project;
      resources.push({
        type: 'supabase',
        resource: 'project',
        url: project.url,
        id: project.projectId,
      });

      if (config.database && project.projectId) {
        for (const table of config.database.tables) {
          const tableResult = await this.supabase.createTable(project.projectId, table);
          if (!tableResult.success) {
            console.warn(`[WebsiteGenerator] Table ${table.name} creation warning:`, tableResult.error);
          }
        }
      }

      if (config.auth && project.projectId) {
        await this.supabase.setupAuth(project.projectId, config.auth);
      }
    }

    // Step 2: Generate website code based on template
    const websiteCode = this.generateWebsiteCode(config, supabaseProject);

    // Step 3: Deploy to Vercel
    const deployment = await this.vercel.deploy({
      name: config.name,
      framework: 'nextjs',
      source: websiteCode.repoUrl || 'github.com/genesis-ai/templates',
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabaseProject.url || '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseProject.anonKey || '',
      },
    });

    if (!deployment.success) {
      return { success: false, error: `Vercel deployment failed: ${deployment.error}`, resources };
    }
    resources.push(...(deployment.resources || []));

    // Step 4: Setup Cloudflare CDN (optional)
    if (config.domain) {
      const dnsResult = await this.cloudflare.configureDNS(config.domain, [
        { type: 'CNAME', name: '@', content: `${config.name}.vercel.app`, proxied: true },
        { type: 'CNAME', name: 'www', content: `${config.name}.vercel.app`, proxied: true },
      ]);

      if (dnsResult.success) {
        resources.push({
          type: 'cloudflare',
          resource: 'dns',
          url: `https://${config.domain}`,
        });
      }
    }

    return {
      success: true,
      url: config.domain ? `https://${config.domain}` : deployment.url,
      projectId: deployment.projectId,
      resources,
    };
  }

  private generateWebsiteCode(config: WebsiteConfig, supabase: { url?: string; anonKey?: string }): { repoUrl?: string; files?: Record<string, string> } {
    const templates: Record<WebsiteConfig['template'], () => Record<string, string>> = {
      landing: () => this.generateLandingPage(config),
      saas: () => this.generateSaaSApp(config, supabase),
      api: () => this.generateAPIService(config),
      dashboard: () => this.generateDashboard(config, supabase),
      marketplace: () => this.generateMarketplace(config, supabase),
    };

    const files = templates[config.template]();
    return {
      repoUrl: `github.com/genesis-ai/templates/${config.template}`,
      files,
    };
  }

  private generateLandingPage(config: WebsiteConfig): Record<string, string> {
    return {
      'pages/index.tsx': `export default function Home() { return <main>${config.name}</main>; }`,
    };
  }

  private generateSaaSApp(config: WebsiteConfig, supabase: { url?: string }): Record<string, string> {
    return {
      'pages/index.tsx': `/* SaaS App */`,
      'pages/dashboard.tsx': `/* Dashboard */`,
      'lib/supabase.ts': `import { createClient } from '@supabase/supabase-js'; export const supabase = createClient('${supabase.url || ''}', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);`,
    };
  }

  private generateAPIService(config: WebsiteConfig): Record<string, string> {
    return { 'pages/api/v1/[...path].ts': `/* API routes */` };
  }

  private generateDashboard(config: WebsiteConfig, supabase: { url?: string }): Record<string, string> {
    return { 'pages/index.tsx': `/* Admin dashboard */` };
  }

  private generateMarketplace(config: WebsiteConfig, supabase: { url?: string }): Record<string, string> {
    return { 'pages/index.tsx': `/* Marketplace */` };
  }
}

// ============================================================================
// Unified Deployment System
// ============================================================================

export class DeploymentSystem {
  public vercel: VercelDeployer;
  public supabase: SupabaseManager;
  public cloudflare: CloudflareManager;
  public generator: WebsiteGenerator;

  private initialized = false;

  constructor() {
    this.vercel = new VercelDeployer();
    this.supabase = new SupabaseManager();
    this.cloudflare = new CloudflareManager();
    this.generator = new WebsiteGenerator();
  }

  async initialize(): Promise<{ vercel: boolean; supabase: boolean; cloudflare: boolean }> {
    if (this.initialized) {
      return { vercel: true, supabase: true, cloudflare: true };
    }

    const status = await this.generator.initialize();
    this.initialized = true;

    console.log('[DeploymentSystem] Initialized:', status);
    return status;
  }

  async deployStaticSite(name: string, source: string): Promise<DeploymentResult> {
    await this.initialize();
    return this.vercel.deploy({ name, source, framework: 'static' });
  }

  async deployFullStack(config: WebsiteConfig): Promise<DeploymentResult> {
    await this.initialize();
    return this.generator.createWebsite(config);
  }

  async deployAPI(config: {
    name: string;
    endpoints: { path: string; handler: string }[];
    database?: DatabaseConfig;
  }): Promise<DeploymentResult> {
    await this.initialize();

    const resources: DeployedResource[] = [];

    if (config.database) {
      const project = await this.supabase.createProject(`${config.name}-api`);
      if (project.success && project.projectId) {
        for (const table of config.database.tables) {
          await this.supabase.createTable(project.projectId, table);
        }
        resources.push({
          type: 'supabase',
          resource: 'database',
          url: project.url,
          id: project.projectId,
        });
      }
    }

    for (const endpoint of config.endpoints) {
      const worker = await this.cloudflare.deployWorker({
        name: `${config.name}-${endpoint.path.replace(/\//g, '-')}`,
        code: endpoint.handler,
        routes: [`api.${config.name}.com${endpoint.path}`],
      });

      if (worker.success) {
        resources.push({
          type: 'cloudflare',
          resource: 'worker',
          url: worker.url,
          id: worker.workerId,
        });
      }
    }

    return {
      success: resources.length > 0,
      url: `https://api.${config.name}.com`,
      resources,
    };
  }

  async deployPaidAPI(config: {
    name: string;
    description: string;
    pricing: { perRequest: number } | { monthly: number };
    handler: string;
  }): Promise<DeploymentResult & { stripeProductId?: string }> {
    await this.initialize();

    const worker = await this.cloudflare.deployWorker({
      name: config.name,
      code: `
        export default {
          async fetch(request, env) {
            const apiKey = request.headers.get('X-API-Key');
            if (!apiKey) return new Response('Unauthorized', { status: 401 });
            const usage = await env.USAGE.get(apiKey) || '0';
            await env.USAGE.put(apiKey, String(parseInt(usage) + 1));
            ${config.handler}
          }
        }
      `,
      kv: ['USAGE'],
    });

    if (!worker.success) {
      return { success: false, error: worker.error };
    }

    return {
      success: true,
      url: worker.url,
      resources: [{
        type: 'cloudflare',
        resource: 'paid-api',
        url: worker.url,
        id: worker.workerId,
      }],
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let deploymentSystemInstance: DeploymentSystem | null = null;

export function getDeploymentSystem(): DeploymentSystem {
  if (!deploymentSystemInstance) {
    deploymentSystemInstance = new DeploymentSystem();
  }
  return deploymentSystemInstance;
}

export default DeploymentSystem;
