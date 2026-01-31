/**
 * Algora API Connector
 *
 * Real connector for bounty discovery using Algora REST API.
 * Algora is GitHub-native with full CRUD API - best for AI agents.
 *
 * API Reference: https://api.docs.algora.io/bounties
 * - GET /api/orgs/{org}/bounties - Public, no auth required
 * - GET /api/bounties/{id} - Get specific bounty
 *
 * Amount format: Cents (100 = $1.00)
 */

export interface AlgoraBounty {
  id: string;
  title: string;
  reward: number;           // In cents
  currency: string;         // Always 'USD' for now
  tags: string[];
  deadline: string | null;
  url: string;
  description?: string;
  status: 'open' | 'claimed' | 'completed' | 'cancelled';
  org: string;
  repo?: string;
  issueUrl?: string;
}

export interface AlgoraConnector {
  scanBounties(orgs?: string[]): Promise<AlgoraBounty[]>;
  getBountyDetails(id: string): Promise<AlgoraBounty | null>;
  searchBounties(query: string): Promise<AlgoraBounty[]>;
}

const ALGORA_API = 'https://console.algora.io/api';
const TIMEOUT_MS = 15000;
const RATE_LIMIT_MS = 500;

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

interface AlgoraApiResponse {
  items: AlgoraApiBounty[];
  next_cursor?: string;
}

interface AlgoraApiBounty {
  id: string;
  title: string;
  amount_cents: number;
  currency: string;
  status: string;
  org_slug: string;
  repo_slug?: string;
  issue_url?: string;
  url: string;
  created_at: string;
  expires_at?: string;
  skills?: string[];
}

function mapApiBounty(b: AlgoraApiBounty, org: string): AlgoraBounty {
  return {
    id: b.id,
    title: b.title,
    reward: b.amount_cents,  // Keep in cents
    currency: b.currency || 'USD',
    tags: b.skills || [],
    deadline: b.expires_at || null,
    url: b.url || `https://console.algora.io/${org}/bounties/${b.id}`,
    description: b.title,  // Algora doesn't always include description in list
    status: mapStatus(b.status),
    org: org,
    repo: b.repo_slug,
    issueUrl: b.issue_url,
  };
}

function mapStatus(status: string): 'open' | 'claimed' | 'completed' | 'cancelled' {
  switch (status?.toLowerCase()) {
    case 'open':
    case 'available':
      return 'open';
    case 'claimed':
    case 'in_progress':
    case 'assigned':
      return 'claimed';
    case 'completed':
    case 'paid':
    case 'rewarded':
      return 'completed';
    case 'cancelled':
    case 'expired':
    case 'closed':
      return 'cancelled';
    default:
      return 'open';
  }
}

/**
 * Scan bounties from specific orgs
 */
async function scanBounties(orgs?: string[]): Promise<AlgoraBounty[]> {
  const targetOrgs = orgs || [
    // Popular orgs with active bounties
    'calcom',
    'twentyhq',
    'formbricks',
    'triggerdotdev',
    'dubinc',
    'infisical',
    'documenso',
    'latitude-dev',
    'boxyhq',
  ];

  const allBounties: AlgoraBounty[] = [];

  for (const org of targetOrgs) {
    await rateLimit();

    try {
      const response = await fetchWithTimeout(
        `${ALGORA_API}/orgs/${org}/bounties?limit=50`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        },
        TIMEOUT_MS
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Org not found or no bounties, skip silently
          continue;
        }
        console.warn(`[AlgoraConnector] API error for ${org}:`, response.status);
        continue;
      }

      const data = await response.json() as AlgoraApiResponse;

      if (data.items && Array.isArray(data.items)) {
        const bounties = data.items
          .filter(b => b.status === 'open' || b.status === 'available')
          .map(b => mapApiBounty(b, org));
        allBounties.push(...bounties);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`[AlgoraConnector] Timeout for ${org}`);
      } else {
        console.warn(`[AlgoraConnector] Error for ${org}:`, error);
      }
    }
  }

  console.log(`[AlgoraConnector] Found ${allBounties.length} open bounties from ${targetOrgs.length} orgs`);
  return allBounties;
}

/**
 * Get details of a specific bounty
 */
async function getBountyDetails(id: string): Promise<AlgoraBounty | null> {
  await rateLimit();

  try {
    const response = await fetchWithTimeout(
      `${ALGORA_API}/bounties/${id}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn(`[AlgoraConnector] Bounty ${id} not found:`, response.status);
      return null;
    }

    const data = await response.json() as AlgoraApiBounty;
    return mapApiBounty(data, data.org_slug);
  } catch (error) {
    console.warn(`[AlgoraConnector] Error getting bounty ${id}:`, error);
    return null;
  }
}

/**
 * Search bounties by keyword (searches across all orgs)
 */
async function searchBounties(query: string): Promise<AlgoraBounty[]> {
  // Algora doesn't have a public search endpoint, so we scan popular orgs
  // and filter locally
  const allBounties = await scanBounties();
  const lowerQuery = query.toLowerCase();

  return allBounties.filter(b =>
    b.title.toLowerCase().includes(lowerQuery) ||
    b.tags.some(t => t.toLowerCase().includes(lowerQuery))
  );
}

export function getAlgoraConnector(): AlgoraConnector {
  return {
    scanBounties,
    getBountyDetails,
    searchBounties,
  };
}
