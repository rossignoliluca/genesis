/**
 * GitHub Bounty Connector
 *
 * Discovers bounties from GitHub issues with bounty labels.
 * Uses GitHub Search API to find issues with common bounty labels:
 * - "bounty"
 * - "reward"
 * - "help wanted" + "good first issue" (filtered by reward mentions)
 *
 * Requires GITHUB_TOKEN for higher rate limits.
 */

export interface GitHubBounty {
  id: string;
  title: string;
  reward: number;           // Extracted from body/title, 0 if not found
  currency: string;
  tags: string[];
  deadline: string | null;
  url: string;
  description: string;
  status: 'open' | 'assigned' | 'closed';
  repo: string;
  owner: string;
  issueNumber: number;
}

export interface GitHubBountyConnector {
  scanBounties(labels?: string[]): Promise<GitHubBounty[]>;
  getBountyDetails(owner: string, repo: string, issueNumber: number): Promise<GitHubBounty | null>;
}

const GITHUB_API = 'https://api.github.com';
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

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  created_at: string;
  updated_at: string;
  repository_url: string;
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubIssue[];
}

/**
 * Extract reward amount from text
 * Supports: $100, 100 USD, 100 USDC, 0.1 ETH, etc.
 */
function extractReward(text: string): { amount: number; currency: string } {
  // Match patterns like: $500, 500 USD, 500 USDC, 0.1 ETH
  const patterns = [
    /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,                    // $500 or $1,000.00
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|USDC|DAI)/i,      // 500 USD
    /(\d+(?:\.\d+)?)\s*ETH/i,                                  // 0.1 ETH
    /bounty[:\s]+\$?\s*(\d+(?:,\d{3})*)/i,                   // bounty: $500
    /reward[:\s]+\$?\s*(\d+(?:,\d{3})*)/i,                   // reward: 500
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);

      // Determine currency
      let currency = 'USD';
      if (text.toLowerCase().includes('eth')) {
        currency = 'ETH';
        // Convert ETH to USD estimate (rough)
        return { amount: amount * 2000, currency: 'ETH' };
      }
      if (text.toLowerCase().includes('usdc')) {
        currency = 'USDC';
      }

      return { amount, currency };
    }
  }

  return { amount: 0, currency: 'USD' };
}

function mapIssueToBoounty(issue: GitHubIssue): GitHubBounty {
  // Extract repo info from repository_url
  const repoMatch = issue.repository_url.match(/repos\/([^/]+)\/([^/]+)$/);
  const owner = repoMatch?.[1] || 'unknown';
  const repo = repoMatch?.[2] || 'unknown';

  // Extract reward from title and body
  const textToSearch = `${issue.title} ${issue.body || ''}`;
  const { amount, currency } = extractReward(textToSearch);

  // Determine status
  let status: 'open' | 'assigned' | 'closed' = 'open';
  if (issue.state === 'closed') {
    status = 'closed';
  } else if (issue.assignees && issue.assignees.length > 0) {
    status = 'assigned';
  }

  return {
    id: `github:${owner}/${repo}#${issue.number}`,
    title: issue.title,
    reward: amount,
    currency,
    tags: issue.labels.map(l => l.name),
    deadline: null,  // GitHub issues don't have deadlines
    url: issue.html_url,
    description: (issue.body || '').slice(0, 500),
    status,
    repo,
    owner,
    issueNumber: issue.number,
  };
}

/**
 * Scan for bounty issues on GitHub
 */
async function scanBounties(labels?: string[]): Promise<GitHubBounty[]> {
  const targetLabels = labels || ['bounty', 'reward', 'cash-reward', 'paid'];

  const allBounties: GitHubBounty[] = [];

  for (const label of targetLabels) {
    await rateLimit();

    try {
      // Search for open issues with bounty-related labels
      const query = `is:issue is:open label:"${label}"`;
      const params = new URLSearchParams({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: '30',
      });

      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Genesis-AI-Bounty-Hunter',
      };

      // Use GitHub token if available for higher rate limits
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }

      const response = await fetchWithTimeout(
        `${GITHUB_API}/search/issues?${params.toString()}`,
        {
          method: 'GET',
          headers,
        },
        TIMEOUT_MS
      );

      if (!response.ok) {
        if (response.status === 403) {
          console.warn('[GitHubBountyConnector] Rate limited, try setting GITHUB_TOKEN');
        } else {
          console.warn(`[GitHubBountyConnector] API error:`, response.status);
        }
        continue;
      }

      const data = await response.json() as GitHubSearchResponse;

      if (data.items && Array.isArray(data.items)) {
        const bounties = data.items
          .filter(issue => issue.state === 'open')
          .map(mapIssueToBoounty)
          // Filter out zero-reward issues (no bounty amount found)
          .filter(b => b.reward > 0);

        allBounties.push(...bounties);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`[GitHubBountyConnector] Timeout for label: ${label}`);
      } else {
        console.warn(`[GitHubBountyConnector] Error for label ${label}:`, error);
      }
    }
  }

  // Deduplicate by URL
  const uniqueBounties = Array.from(
    new Map(allBounties.map(b => [b.url, b])).values()
  );

  console.log(`[GitHubBountyConnector] Found ${uniqueBounties.length} bounties with rewards`);
  return uniqueBounties;
}

/**
 * Get details of a specific issue
 */
async function getBountyDetails(owner: string, repo: string, issueNumber: number): Promise<GitHubBounty | null> {
  await rateLimit();

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Genesis-AI-Bounty-Hunter',
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetchWithTimeout(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: 'GET',
        headers,
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn(`[GitHubBountyConnector] Issue not found:`, response.status);
      return null;
    }

    const issue = await response.json() as GitHubIssue;
    // Add repository_url for mapping
    issue.repository_url = `https://api.github.com/repos/${owner}/${repo}`;

    return mapIssueToBoounty(issue);
  } catch (error) {
    console.warn(`[GitHubBountyConnector] Error getting issue:`, error);
    return null;
  }
}

export function getGitHubBountyConnector(): GitHubBountyConnector {
  return {
    scanBounties,
    getBountyDetails,
  };
}
