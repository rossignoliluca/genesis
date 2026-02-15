/**
 * Bloomberg MCP Server (Stub)
 *
 * Lightweight custom MCP server for Bloomberg Terminal API integration.
 * This is a stub implementation that returns placeholder data.
 *
 * To enable real Bloomberg data:
 * 1. Set BLOOMBERG_API_KEY in .env
 * 2. Implement actual Bloomberg Terminal API calls
 * 3. Enable server in .mcp.json
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// TYPES
// ============================================================================

interface BloombergQuoteParams {
  ticker: string;
}

interface BloombergNewsParams {
  query: string;
  count?: number;
}

interface BloombergQuoteResult {
  ticker: string;
  price: string;
  change: string;
  changePercent: string;
  volume: string;
  marketCap: string;
  pe: string;
  status: string;
  timestamp: string;
}

interface BloombergNewsResult {
  articles: Array<{
    headline: string;
    summary: string;
    source: string;
    publishedAt: string;
    url: string;
  }>;
  status: string;
  timestamp: string;
}

// ============================================================================
// SERVER IMPLEMENTATION
// ============================================================================

class BloombergMCPServer {
  private server: Server;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.BLOOMBERG_API_KEY;

    this.server = new Server(
      {
        name: 'bloomberg-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'bloomberg_quote',
          description: 'Get real-time market data for a ticker. Returns price, change, volume, market cap, P/E ratio. Requires Bloomberg Terminal API access.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              ticker: {
                type: 'string',
                description: 'Stock ticker symbol (e.g., AAPL, MSFT, BTC-USD)',
              },
            },
            required: ['ticker'],
          },
        },
        {
          name: 'bloomberg_news',
          description: 'Search Bloomberg news articles. Returns headlines, summaries, and sources. Requires Bloomberg Terminal API access.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "Fed rate decision", "Tesla earnings")',
              },
              count: {
                type: 'number',
                description: 'Number of articles to return (default: 10, max: 50)',
              },
            },
            required: ['query'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'bloomberg_quote':
          return this.handleQuote(request.params.arguments as unknown as BloombergQuoteParams);
        case 'bloomberg_news':
          return this.handleNews(request.params.arguments as unknown as BloombergNewsParams);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async handleQuote(params: BloombergQuoteParams): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { ticker } = params;

    // Stub implementation - returns placeholder data
    const result: BloombergQuoteResult = {
      ticker,
      price: 'N/A - Configure Bloomberg API',
      change: 'N/A',
      changePercent: 'N/A',
      volume: 'N/A',
      marketCap: 'N/A',
      pe: 'N/A',
      status: 'stub',
      timestamp: new Date().toISOString(),
    };

    // TODO: Implement real Bloomberg Terminal API call
    // Example:
    // if (this.apiKey) {
    //   const response = await fetch(`https://api.bloomberg.com/v1/quote/${ticker}`, {
    //     headers: { 'Authorization': `Bearer ${this.apiKey}` }
    //   });
    //   const data = await response.json();
    //   result.price = data.price;
    //   result.change = data.change;
    //   // ... etc
    //   result.status = 'live';
    // }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleNews(params: BloombergNewsParams): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { query, count = 10 } = params;

    // Stub implementation - returns placeholder data
    const result: BloombergNewsResult = {
      articles: [],
      status: 'stub - Configure Bloomberg Terminal API',
      timestamp: new Date().toISOString(),
    };

    // TODO: Implement real Bloomberg Terminal API call
    // Example:
    // if (this.apiKey) {
    //   const response = await fetch(`https://api.bloomberg.com/v1/news?q=${encodeURIComponent(query)}&limit=${count}`, {
    //     headers: { 'Authorization': `Bearer ${this.apiKey}` }
    //   });
    //   const data = await response.json();
    //   result.articles = data.articles.map(a => ({
    //     headline: a.headline,
    //     summary: a.summary,
    //     source: a.source,
    //     publishedAt: a.publishedAt,
    //     url: a.url,
    //   }));
    //   result.status = 'live';
    // }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log to stderr so it doesn't interfere with stdio protocol
    console.error('Bloomberg MCP Server running (stub mode)');
    if (!this.apiKey) {
      console.error('Warning: BLOOMBERG_API_KEY not set - returning stub data');
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

const server = new BloombergMCPServer();
server.run().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
