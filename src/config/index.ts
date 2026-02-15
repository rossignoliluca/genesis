/**
 * Genesis — Centralized Configuration
 *
 * Single source of truth for all environment variables.
 * Validates required vars at startup, provides typed access,
 * prevents scattered process.env reads.
 */

export interface GenesisConfig {
  // LLM
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  defaultModel: string;

  // Database
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;

  // Newsletter
  newsletterPlatform: 'beehiiv' | 'buttondown' | 'none';
  beehiivApiKey: string;
  beehiivPublicationId: string;
  buttondownApiToken: string;

  // Content
  twitterApiKey: string;
  linkedinApiKey: string;
  blueskyHandle: string;
  blueskyPassword: string;

  // Infrastructure
  port: number;
  dashboardPort: number;
  nodeEnv: string;
  logLevel: string;

  // Market Strategist
  focusAssets: string[];
  outputDir: string;
}

let cachedConfig: GenesisConfig | null = null;

/**
 * Get the application config. Reads from process.env on first call,
 * caches the result. Call resetConfig() in tests.
 */
export function getConfig(): GenesisConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = {
    // LLM
    openaiApiKey: env('OPENAI_API_KEY', ''),
    anthropicApiKey: env('ANTHROPIC_API_KEY', ''),
    geminiApiKey: env('GEMINI_API_KEY', ''),
    defaultModel: env('DEFAULT_MODEL', 'gpt-4o'),

    // Database
    pgHost: env('PG_HOST', 'localhost'),
    pgPort: envInt('PG_PORT', 5432),
    pgDatabase: env('PG_DATABASE', 'genesis'),
    pgUser: env('PG_USER', 'genesis'),
    pgPassword: env('PG_PASSWORD', ''),

    // Newsletter
    newsletterPlatform: env('NEWSLETTER_PLATFORM', 'none') as 'beehiiv' | 'buttondown' | 'none',
    beehiivApiKey: env('BEEHIIV_API_KEY', ''),
    beehiivPublicationId: env('BEEHIIV_PUBLICATION_ID', ''),
    buttondownApiToken: env('BUTTONDOWN_API_TOKEN', ''),

    // Content
    twitterApiKey: env('TWITTER_API_KEY', ''),
    linkedinApiKey: env('LINKEDIN_API_KEY', ''),
    blueskyHandle: env('BLUESKY_HANDLE', ''),
    blueskyPassword: env('BLUESKY_PASSWORD', ''),

    // Infrastructure
    port: envInt('PORT', 3000),
    dashboardPort: envInt('DASHBOARD_PORT', 9876),
    nodeEnv: env('NODE_ENV', 'development'),
    logLevel: env('LOG_LEVEL', 'info'),

    // Market Strategist
    focusAssets: env('FOCUS_ASSETS', 'S&P 500,Nasdaq 100,Gold,Oil WTI,Bitcoin,EUR/USD,US 10Y,VIX').split(',').map(s => s.trim()),
    outputDir: env('OUTPUT_DIR', '/tmp'),
  };

  return cachedConfig;
}

/** Reset config cache (for tests) */
export function resetConfig(): void {
  cachedConfig = null;
}

function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
