/**
 * Gitcoin API Connector
 *
 * Read-only connector for bounty discovery using Gitcoin REST API.
 * API Reference: https://github.com/gitcoinco/web/blob/master/docs/API.md
 *
 * Note: Gitcoin has deprecated bounties in favor of Grants.
 * This connector focuses on grants discovery for research opportunities.
 */

export interface GitcoinBounty {
  id: string;
  title: string;
  reward: number;
  currency: string;
  tags: string[];
  deadline: string | null;
  url: string;
  description?: string;
  status: 'open' | 'started' | 'submitted' | 'done' | 'cancelled';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  projectType: string;
  githubUrl?: string;
}

export interface GitcoinConnector {
  scanBounties(filters?: GitcoinFilters): Promise<GitcoinBounty[]>;
  getBountyDetails(id: string): Promise<GitcoinBounty | null>;
}

export interface GitcoinFilters {
  isOpen?: boolean;
  experienceLevel?: string;
  projectLength?: string;
  bountyType?: string;
  keywords?: string[];
}

const GITCOIN_API = 'https://gitcoin.co/api/v0.1';
const TIMEOUT_MS = 15000;
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

interface GitcoinApiBounty {
  pk: number;
  title: string;
  value_true: number;
  token_name: string;
  keywords: string[];
  expires_date: string | null;
  github_url: string;
  web3_created: string;
  status: string;
  experience_level: string;
  project_type: string;
  bounty_type: string;
  issue_description: string;
  url: string;
}

function mapApiBounty(b: GitcoinApiBounty): GitcoinBounty {
  return {
    id: String(b.pk),
    title: b.title,
    reward: b.value_true || 0,
    currency: b.token_name || 'USD',
    tags: b.keywords || [],
    deadline: b.expires_date,
    url: b.url || `https://gitcoin.co/issue/${b.pk}`,
    description: b.issue_description?.slice(0, 500),
    status: mapStatus(b.status),
    experienceLevel: mapExperienceLevel(b.experience_level),
    projectType: b.project_type || 'unknown',
    githubUrl: b.github_url,
  };
}

function mapStatus(status: string): 'open' | 'started' | 'submitted' | 'done' | 'cancelled' {
  switch (status?.toLowerCase()) {
    case 'open':
      return 'open';
    case 'started':
    case 'work_started':
      return 'started';
    case 'submitted':
    case 'work_submitted':
      return 'submitted';
    case 'done':
    case 'completed':
      return 'done';
    case 'cancelled':
    case 'expired':
      return 'cancelled';
    default:
      return 'open';
  }
}

function mapExperienceLevel(level: string): 'beginner' | 'intermediate' | 'advanced' {
  switch (level?.toLowerCase()) {
    case 'beginner':
    case 'easy':
      return 'beginner';
    case 'intermediate':
    case 'medium':
      return 'intermediate';
    case 'advanced':
    case 'hard':
    case 'expert':
      return 'advanced';
    default:
      return 'intermediate';
  }
}

/**
 * Scan open bounties with optional filters
 */
async function scanBounties(filters?: GitcoinFilters): Promise<GitcoinBounty[]> {
  await rateLimit();

  const params = new URLSearchParams();
  params.set('is_open', filters?.isOpen !== false ? 'true' : 'false');
  params.set('order_by', '-value_true');  // Highest value first
  params.set('limit', '50');

  if (filters?.experienceLevel) {
    params.set('experience_level', filters.experienceLevel);
  }
  if (filters?.projectLength) {
    params.set('project_length', filters.projectLength);
  }
  if (filters?.bountyType) {
    params.set('bounty_type', filters.bountyType);
  }
  if (filters?.keywords && filters.keywords.length > 0) {
    params.set('keywords', filters.keywords.join(','));
  }

  try {
    const response = await fetchWithTimeout(
      `${GITCOIN_API}/bounties/?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn(`[GitcoinConnector] API error:`, response.status);
      return [];
    }

    const data = await response.json() as GitcoinApiBounty[];

    if (!Array.isArray(data)) {
      console.warn('[GitcoinConnector] Unexpected response format');
      return [];
    }

    const bounties = data
      .filter(b => b.status === 'open')
      .map(mapApiBounty);

    console.log(`[GitcoinConnector] Found ${bounties.length} open bounties`);
    return bounties;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[GitcoinConnector] Request timeout');
    } else {
      console.warn('[GitcoinConnector] Request failed:', error);
    }
    return [];
  }
}

/**
 * Get details of a specific bounty
 */
async function getBountyDetails(id: string): Promise<GitcoinBounty | null> {
  await rateLimit();

  try {
    const response = await fetchWithTimeout(
      `${GITCOIN_API}/bounties/${id}/`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn(`[GitcoinConnector] Bounty ${id} not found:`, response.status);
      return null;
    }

    const data = await response.json() as GitcoinApiBounty;
    return mapApiBounty(data);
  } catch (error) {
    console.warn(`[GitcoinConnector] Error getting bounty ${id}:`, error);
    return null;
  }
}

export function getGitcoinConnector(): GitcoinConnector {
  return {
    scanBounties,
    getBountyDetails,
  };
}
