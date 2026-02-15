/**
 * Discovery Layer — Finds new MCP server candidates
 * Uses npm registry search and web search to find MCP servers.
 */

import { CandidateCapability, DiscoverySource } from './types.js';

export class DiscoveryLayer {
  constructor(
    private activeDomains: string[],
    private existingServers: string[],
  ) {}

  async discover(sources: DiscoverySource[]): Promise<CandidateCapability[]> {
    const candidates: CandidateCapability[] = [];

    for (const source of sources) {
      switch (source) {
        case 'npm':
          candidates.push(...await this.searchNpm());
          break;
        case 'github':
          candidates.push(...await this.searchGithub());
          break;
        case 'mcp-registry':
          candidates.push(...await this.searchMcpRegistry());
          break;
      }
    }

    // Deduplicate and filter already-known servers
    return this.deduplicate(candidates);
  }

  private async searchNpm(): Promise<CandidateCapability[]> {
    const candidates: CandidateCapability[] = [];
    const queries = ['mcp-server', '@modelcontextprotocol'];

    for (const query of queries) {
      try {
        const response = await fetch(
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`
        );
        if (!response.ok) continue;

        const data = await response.json() as {
          objects: Array<{
            package: { name: string; description: string; date: string };
            score: { detail: { popularity: number } };
          }>;
        };

        for (const obj of data.objects) {
          const pkg = obj.package;
          if (!pkg.name.includes('mcp')) continue;
          if (this.existingServers.includes(pkg.name)) continue;

          candidates.push({
            id: `npm:${pkg.name}`,
            packageName: pkg.name,
            description: pkg.description || '',
            category: this.inferCategory(pkg.name, pkg.description || ''),
            transport: 'stdio',
            discoveredAt: new Date().toISOString(),
            discoveredFrom: 'npm',
            status: 'discovered',
            lastPublished: pkg.date,
          });
        }
      } catch {
        // Network failure — continue with other sources
      }
    }

    return candidates;
  }

  private async searchGithub(): Promise<CandidateCapability[]> {
    // Placeholder — would use GitHub API or brave-search MCP
    return [];
  }

  private async searchMcpRegistry(): Promise<CandidateCapability[]> {
    // Placeholder — would query official MCP registry when available
    return [];
  }

  private inferCategory(name: string, description: string): string {
    const text = `${name} ${description}`.toLowerCase();
    if (text.includes('finance') || text.includes('market') || text.includes('trading')) return 'finance';
    if (text.includes('search') || text.includes('web') || text.includes('browser')) return 'research';
    if (text.includes('git') || text.includes('code') || text.includes('dev')) return 'development';
    if (text.includes('slack') || text.includes('email') || text.includes('discord')) return 'communication';
    if (text.includes('content') || text.includes('social') || text.includes('media')) return 'content';
    if (text.includes('database') || text.includes('sql') || text.includes('storage')) return 'data';
    return 'general';
  }

  private deduplicate(candidates: CandidateCapability[]): CandidateCapability[] {
    const seen = new Set<string>();
    return candidates.filter(c => {
      if (seen.has(c.packageName)) return false;
      seen.add(c.packageName);
      return true;
    });
  }
}
