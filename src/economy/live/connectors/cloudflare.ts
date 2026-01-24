/**
 * Cloudflare Workers API Connector
 *
 * Real connector for deploying and managing Cloudflare Workers.
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables.
 */

export interface WorkerDeployment {
  success: boolean;
  url?: string;
  id?: string;
  error?: string;
}

export interface WorkerStats {
  requests: number;
  errors: number;
  cpuTime: number;
}

export interface CloudflareConnector {
  isConfigured(): boolean;
  deployWorker(name: string, code: string): Promise<WorkerDeployment>;
  deleteWorker(name: string): Promise<{ success: boolean; error?: string }>;
  listWorkers(): Promise<Array<{ id: string; name: string; created: string }>>;
  getWorkerStats(name: string): Promise<WorkerStats | null>;
}

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const TIMEOUT_MS = 10000;
const RATE_LIMIT_MS = 1000;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function getAuthHeaders(): { Authorization: string } {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error('CLOUDFLARE_API_TOKEN environment variable not set');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

function getAccountId(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable not set');
  }
  return accountId;
}

async function cloudflareRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; result?: T; errors?: any[] }> {
  await rateLimit();

  try {
    const accountId = getAccountId();
    const url = `${CLOUDFLARE_API_BASE}/accounts/${accountId}${path}`;

    const response = await fetchWithTimeout(
      url,
      {
        ...options,
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
          ...options.headers,
        },
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn('[CloudflareConnector] API error:', response.status, response.statusText);
      const errorText = await response.text();
      return { success: false, errors: [{ message: errorText }] };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[CloudflareConnector] Request timeout');
    } else {
      console.warn('[CloudflareConnector] Request failed:', error);
    }
    return { success: false, errors: [{ message: String(error) }] };
  }
}

async function deployWorker(name: string, code: string): Promise<WorkerDeployment> {
  try {
    // Upload the worker script
    const uploadResponse = await cloudflareRequest<any>(`/workers/scripts/${name}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/javascript+module',
      },
      body: code,
    });

    if (!uploadResponse.success) {
      return {
        success: false,
        error: uploadResponse.errors?.[0]?.message || 'Failed to deploy worker',
      };
    }

    // Get subdomain for URL construction
    const accountId = getAccountId();
    const url = `https://${name}.${accountId}.workers.dev`;

    return {
      success: true,
      url,
      id: uploadResponse.result?.id || name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function deleteWorker(name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await cloudflareRequest(`/workers/scripts/${name}`, {
      method: 'DELETE',
    });

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to delete worker',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function listWorkers(): Promise<Array<{ id: string; name: string; created: string }>> {
  try {
    const response = await cloudflareRequest<any[]>('/workers/scripts');

    if (!response.success || !response.result) {
      return [];
    }

    return response.result.map((worker: any) => ({
      id: worker.id,
      name: worker.id,
      created: worker.created_on || new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('[CloudflareConnector] Failed to list workers:', error);
    return [];
  }
}

async function getWorkerStats(name: string): Promise<WorkerStats | null> {
  try {
    // Note: Analytics API requires specific date ranges
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    const response = await cloudflareRequest<any>(
      `/workers/scripts/${name}/analytics?since=${since.toISOString()}&until=${now.toISOString()}`
    );

    if (!response.success || !response.result) {
      return null;
    }

    const data = response.result;
    return {
      requests: data.requests || 0,
      errors: data.errors || 0,
      cpuTime: data.cpuTime || 0,
    };
  } catch (error) {
    console.warn('[CloudflareConnector] Failed to get worker stats:', error);
    return null;
  }
}

function isConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

export function getCloudflareConnector(): CloudflareConnector {
  return {
    isConfigured,
    deployWorker,
    deleteWorker,
    listWorkers,
    getWorkerStats,
  };
}
