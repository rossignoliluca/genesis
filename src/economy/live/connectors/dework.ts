/**
 * DeWork API Connector
 *
 * Real connector for bounty discovery using DeWork GraphQL API.
 * No authentication required for read operations.
 * v16.2: Added retry wrapper for resilience.
 */

import { retry } from '../retry.js';

export interface Bounty {
  id: string;
  title: string;
  reward: number;
  currency: string;
  tags: string[];
  deadline: string | null;
  url: string;
  description?: string;
  status: string;
}

export interface DeworkConnector {
  scanBounties(tags?: string[]): Promise<Bounty[]>;
  getBountyDetails(id: string): Promise<Bounty | null>;
  getPayoutStatus(id: string): Promise<{ paid: boolean; txHash?: string }>;
}

const DEWORK_API = 'https://api.dework.xyz/graphql';
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

async function graphqlQueryRaw<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  await rateLimit();

  try {
    const response = await fetchWithTimeout(
      DEWORK_API,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn('[DeworkConnector] API error:', response.status, response.statusText);

      // Log response body for debugging
      try {
        const errorBody = await response.text();
        console.warn('[DeworkConnector] Error response body:', errorBody);
      } catch (e) {
        console.warn('[DeworkConnector] Could not read error response body');
      }

      return null;
    }

    const result = await response.json();

    if (result.errors) {
      console.warn('[DeworkConnector] GraphQL errors:');
      for (const err of result.errors) {
        console.warn(`  - ${err.message}`);
        if (err.path) {
          console.warn(`    Path: ${err.path.join('.')}`);
        }
        if (err.extensions) {
          console.warn(`    Extensions:`, JSON.stringify(err.extensions));
        }
      }
      return null;
    }

    return result.data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[DeworkConnector] Request timeout');
    } else {
      console.warn('[DeworkConnector] Request failed:', error);
    }
    return null;
  }
}

/**
 * v16.2: Retry wrapper around graphqlQueryRaw for resilience.
 */
async function graphqlQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const result = await retry(
    async () => {
      const data = await graphqlQueryRaw<T>(query, variables);
      if (data === null) {
        throw new Error('Dework query returned null');
      }
      return data;
    },
    {
      maxRetries: 2,
      initialDelayMs: 2000,
      maxDelayMs: 10000,
      onRetry: (attempt, error, delayMs) => {
        console.log(`[DeworkConnector] Retry ${attempt}: ${error.message}, waiting ${Math.round(delayMs)}ms`);
      },
    }
  );

  return result.success ? result.data! : null;
}

function mapTaskToBounty(task: any): Bounty {
  const reward = task.rewards?.[0];
  return {
    id: task.id,
    title: task.name,
    reward: reward?.amount ? parseFloat(reward.amount) : 0,
    currency: reward?.token?.symbol || 'USD',
    tags: task.tags?.map((t: any) => t.label) || [],
    deadline: task.dueDate || null,
    url: `https://app.dework.xyz/task/${task.id}`,
    description: task.description,
    status: task.status,
  };
}

async function scanBounties(tags?: string[]): Promise<Bounty[]> {
  const query = `
    query GetTasks($filter: TaskFilter) {
      tasks(filter: $filter) {
        id
        name
        description
        status
        dueDate
        rewards {
          amount
          token {
            symbol
          }
        }
        tags {
          label
        }
      }
    }
  `;

  const tagFilter = tags && tags.length > 0 ? tags : ['solidity', 'typescript', 'smart-contract', 'ai'];

  const variables = {
    filter: {
      statuses: ['TODO', 'IN_PROGRESS'],
      tags: tagFilter,
    },
  };

  const data = await graphqlQuery<{ tasks: any[] }>(query, variables);

  if (!data || !data.tasks) {
    return [];
  }

  return data.tasks.map(mapTaskToBounty);
}

async function getBountyDetails(id: string): Promise<Bounty | null> {
  const query = `
    query GetTask($taskId: String!) {
      task(taskId: $taskId) {
        id
        name
        description
        status
        dueDate
        rewards {
          amount
          token {
            symbol
          }
        }
        tags {
          label
        }
      }
    }
  `;

  const variables = { taskId: id };
  const data = await graphqlQuery<{ task: any }>(query, variables);

  if (!data || !data.task) {
    return null;
  }

  return mapTaskToBounty(data.task);
}

async function getPayoutStatus(id: string): Promise<{ paid: boolean; txHash?: string }> {
  const query = `
    query GetTaskPayments($taskId: String!) {
      task(taskId: $taskId) {
        rewards {
          payments {
            status
            transactionHash
          }
        }
      }
    }
  `;

  const variables = { taskId: id };
  const data = await graphqlQuery<{ task: any }>(query, variables);

  if (!data || !data.task || !data.task.rewards) {
    return { paid: false };
  }

  const payments = data.task.rewards.flatMap((r: any) => r.payments || []);
  const paidPayment = payments.find((p: any) => p.status === 'CONFIRMED' || p.status === 'PROCESSING');

  return {
    paid: !!paidPayment,
    txHash: paidPayment?.transactionHash,
  };
}

export function getDeworkConnector(): DeworkConnector {
  return {
    scanBounties,
    getBountyDetails,
    getPayoutStatus,
  };
}
