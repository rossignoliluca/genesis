/**
 * Genesis v9.0 - Web Observability Dashboard
 *
 * Provides a lightweight web server for real-time system monitoring.
 * Serves both an API for metrics and a simple HTML dashboard.
 *
 * Features:
 * - Real-time metrics endpoint
 * - Memory/consciousness/agent status
 * - Event stream (SSE)
 * - Static dashboard UI
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { getChatAPI, ChatAPI } from '../api/chat-api.js';

// ============================================================================
// Types
// ============================================================================

export interface DashboardConfig {
  port: number;
  host: string;
  refreshInterval: number;
  enableSSE: boolean;
  metricsPath: string;
}

export interface SystemMetrics {
  timestamp: number;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  consciousness: {
    phi: number;
    state: string;
    integration: number;
    complexity: number;
    attentionFocus: string | null;
    workspaceContents: Array<{ id: string; type: string; salience: number }>;
  };
  kernel: {
    state: string;
    energy: number;
    cycles: number;
    mode: string;
    levels: {
      l1: { active: boolean; load: number };
      l2: { active: boolean; load: number };
      l3: { active: boolean; load: number };
      l4: { active: boolean; load: number };
    };
    freeEnergy: number;
    predictionError: number;
  };
  agents: {
    total: number;
    active: number;
    queued: number;
  };
  memory_system: {
    episodic: number;
    semantic: number;
    procedural: number;
    total: number;
  };
  llm: {
    totalRequests: number;
    totalCost: number;
    averageLatency: number;
    providers: string[];
  };
  mcp: {
    connectedServers: number;
    availableTools: number;
    totalCalls: number;
  };
  selfImprovement?: {
    currentStage: string;
    cycleEnabled: boolean;
    successRate: number;
    totalAttempts: number;
    phi: number;
    errorRate: number;
    memoryReuse: number;
  };
  codeRag?: {
    totalChunks: number;
    indexedFiles: number;
    lastQuery: string | null;
  };
  // Active Inference
  activeInference?: {
    currentCycle: number;
    beliefs: Record<string, string>;
    selectedAction: string | null;
    lastSurprise: number;
    avgSurprise: number;
    isRunning: boolean;
  };
  // Neuromodulation
  neuromod?: {
    dopamine: number;
    serotonin: number;
    norepinephrine: number;
    acetylcholine: number;
    effects: {
      explorationRate: number;
      learningRate: number;
      precisionGain: number;
      discountFactor: number;
    };
  };
  // Nociception (Pain)
  nociception?: {
    totalPain: number;
    threshold: number;
    adaptation: number;
    activeStimuli: Array<{
      location: string;
      intensity: number;
      type: 'acute' | 'chronic' | 'phantom';
    }>;
  };
  // Allostasis
  allostasis?: {
    variables: Array<{
      name: string;
      current: number;
      setpoint: number;
      urgency: number;
    }>;
    isThrottled: boolean;
    isHibernating: boolean;
    deferredVariables: string[];
  };
  // World Model
  worldModel?: {
    totalFacts: number;
    recentPredictions: Array<{
      domain: string;
      prediction: string;
      confidence: number;
      timestamp: number;
    }>;
    consistencyViolations: number;
    causalChainsActive: number;
  };
  // Daemon
  daemon?: {
    state: 'stopped' | 'starting' | 'running' | 'dreaming' | 'maintaining' | 'stopping' | 'error';
    scheduledTasks: number;
    completedTasks: number;
    failedTasks: number;
    dreamPhase: string | null;
    lastMaintenance: number | null;
    nextScheduledTask: {
      name: string;
      scheduledFor: number;
    } | null;
  };
  // Finance/Trading
  finance?: {
    totalPortfolioValue: number;
    unrealizedPnL: number;
    realizedPnL: number;
    positions: Array<{
      symbol: string;
      size: number;
      entryPrice: number;
      currentPrice: number;
      pnl: number;
      direction: 'long' | 'short';
    }>;
    activeSignals: Array<{
      symbol: string;
      direction: 'long' | 'short' | 'neutral';
      strength: number;
    }>;
    regime: string;
    riskLevel: number;
    drawdown: number;
  };
  // Revenue
  revenue?: {
    totalEarned: number;
    activeStreams: string[];
    pendingOpportunities: number;
    avgROI: number;
    recentTasks: Array<{
      stream: string;
      amount: number;
      success: boolean;
      timestamp: number;
    }>;
  };
  // Content
  content?: {
    totalPublished: number;
    totalScheduled: number;
    engagementRate: number;
    topPlatform: string | null;
    recentContent: Array<{
      id: string;
      type: string;
      platforms: string[];
      status: 'draft' | 'scheduled' | 'published';
    }>;
    insights: Array<{
      type: string;
      recommendation: string;
      confidence: number;
    }>;
  };
  // Swarm / Agents Extended
  swarm?: {
    agentCount: number;
    activeCoordinations: number;
    emergentPatterns: string[];
    collectiveIntelligence: number;
    consensusLevel: number;
  };
  // Healing / Self-Repair
  healing?: {
    activeHealing: boolean;
    target: string | null;
    issuesDetected: number;
    issuesRepaired: number;
    lastHealingResult: 'success' | 'partial' | 'failed' | null;
  };
  // Grounding / Verification
  grounding?: {
    claimsVerified: number;
    claimsPending: number;
    factAccuracy: number;
    lastVerification: number | null;
  };
  // v19.0: P4 Cognitive Modules
  cognitive?: {
    semiotics: { hallucinationRisk: number; interpretationCount: number };
    morphogenetic: { colonyHealth: number; repairRate: number };
    strangeLoop: { identityStability: number; metaDepth: number };
    rsi: { cycleCount: number; successRate: number };
    swarm: { orderParameter: number; entropy: number; patternsDetected: number };
    symbiotic: { frictionLevel: number; autonomyScore: number };
    embodiment: { predictionError: number; reflexCount: number };
  };
}

export interface EventData {
  id: string;
  type: string;
  timestamp: number;
  data: unknown;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: DashboardConfig = {
  port: 9876,
  host: 'localhost',
  refreshInterval: 1000,
  enableSSE: true,
  metricsPath: '.genesis/metrics.json',
};

// ============================================================================
// Dashboard HTML
// ============================================================================

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Genesis Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 1px solid #333;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #00ff88;
      font-size: 2.5em;
      text-shadow: 0 0 10px #00ff8844;
    }
    .header .version { color: #888; margin-top: 5px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid #333;
      border-radius: 12px;
      padding: 20px;
      backdrop-filter: blur(10px);
    }
    .card h2 {
      color: #00ff88;
      font-size: 1.1em;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #333;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #222;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #888; }
    .metric-value { color: #fff; font-family: monospace; }
    .metric-value.good { color: #00ff88; }
    .metric-value.warning { color: #ffaa00; }
    .metric-value.critical { color: #ff4444; }
    .phi-display {
      text-align: center;
      padding: 20px;
    }
    .phi-value {
      font-size: 4em;
      font-family: monospace;
      color: #00ff88;
      text-shadow: 0 0 20px #00ff8844;
    }
    .phi-label { color: #888; margin-top: 10px; }
    .progress-bar {
      background: #222;
      border-radius: 10px;
      height: 8px;
      margin-top: 5px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00ff88, #00aaff);
      border-radius: 10px;
      transition: width 0.3s ease;
    }
    .events {
      max-height: 200px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.85em;
    }
    .event {
      padding: 5px;
      border-bottom: 1px solid #222;
    }
    .event-time { color: #00ff88; }
    .event-type { color: #ffaa00; }
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 2s infinite;
    }
    .status-dot.active { background: #00ff88; }
    .status-dot.idle { background: #ffaa00; }
    .status-dot.error { background: #ff4444; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧬 Genesis Dashboard</h1>
    <div class="version">v9.0 - Observability</div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>⚡ Consciousness (φ)</h2>
      <div class="phi-display">
        <div class="phi-value" id="phi">0.00</div>
        <div class="phi-label">Integrated Information</div>
      </div>
      <div class="metric">
        <span class="metric-label">State</span>
        <span class="metric-value" id="consciousness-state">--</span>
      </div>
      <div class="metric">
        <span class="metric-label">Integration</span>
        <span class="metric-value" id="integration">0%</span>
      </div>
    </div>

    <div class="card">
      <h2>🔋 Kernel</h2>
      <div class="metric">
        <span class="metric-label">State</span>
        <span class="metric-value" id="kernel-state">--</span>
      </div>
      <div class="metric">
        <span class="metric-label">Energy</span>
        <span class="metric-value" id="kernel-energy">--</span>
      </div>
      <div class="metric">
        <span class="metric-label">Cycles</span>
        <span class="metric-value" id="kernel-cycles">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Uptime</span>
        <span class="metric-value" id="uptime">0s</span>
      </div>
    </div>

    <div class="card">
      <h2>🤖 Agents</h2>
      <div class="metric">
        <span class="metric-label">Total</span>
        <span class="metric-value" id="agents-total">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Active</span>
        <span class="metric-value good" id="agents-active">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Queued</span>
        <span class="metric-value" id="agents-queued">0</span>
      </div>
    </div>

    <div class="card">
      <h2>🧠 Memory</h2>
      <div class="metric">
        <span class="metric-label">Episodic</span>
        <span class="metric-value" id="memory-episodic">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Semantic</span>
        <span class="metric-value" id="memory-semantic">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Procedural</span>
        <span class="metric-value" id="memory-procedural">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Total</span>
        <span class="metric-value good" id="memory-total">0</span>
      </div>
    </div>

    <div class="card">
      <h2>💻 System Memory</h2>
      <div class="metric">
        <span class="metric-label">Heap Used</span>
        <span class="metric-value" id="heap-used">0 MB</span>
      </div>
      <div class="metric">
        <span class="metric-label">Heap Total</span>
        <span class="metric-value" id="heap-total">0 MB</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="heap-bar" style="width: 0%"></div>
      </div>
      <div class="metric">
        <span class="metric-label">RSS</span>
        <span class="metric-value" id="rss">0 MB</span>
      </div>
    </div>

    <div class="card">
      <h2>🔧 LLM Router</h2>
      <div class="metric">
        <span class="metric-label">Total Requests</span>
        <span class="metric-value" id="llm-requests">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Total Cost</span>
        <span class="metric-value" id="llm-cost">$0.00</span>
      </div>
      <div class="metric">
        <span class="metric-label">Avg Latency</span>
        <span class="metric-value" id="llm-latency">0ms</span>
      </div>
      <div class="metric">
        <span class="metric-label">Providers</span>
        <span class="metric-value" id="llm-providers">--</span>
      </div>
    </div>

    <div class="card">
      <h2>🔌 MCP</h2>
      <div class="metric">
        <span class="metric-label">Connected Servers</span>
        <span class="metric-value" id="mcp-servers">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Available Tools</span>
        <span class="metric-value" id="mcp-tools">0</span>
      </div>
      <div class="metric">
        <span class="metric-label">Total Calls</span>
        <span class="metric-value" id="mcp-calls">0</span>
      </div>
    </div>

    <div class="card">
      <h2>📊 Recent Events</h2>
      <div class="events" id="events">
        <div class="event"><span class="event-time">--:--:--</span> Waiting for events...</div>
      </div>
    </div>
  </div>

  <script>
    const REFRESH_INTERVAL = 1000;

    function formatBytes(bytes) {
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function formatUptime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return h > 0 ? h + 'h ' + m + 'm' : m > 0 ? m + 'm ' + s + 's' : s + 's';
    }

    function updateMetrics(data) {
      // Consciousness
      document.getElementById('phi').textContent = data.consciousness?.phi?.toFixed(3) || '0.000';
      document.getElementById('consciousness-state').textContent = data.consciousness?.state || '--';
      document.getElementById('integration').textContent = Math.round((data.consciousness?.integration || 0) * 100) + '%';

      // Kernel
      document.getElementById('kernel-state').textContent = data.kernel?.state || '--';
      document.getElementById('kernel-energy').textContent = data.kernel?.energy?.toFixed(2) || '--';
      document.getElementById('kernel-cycles').textContent = data.kernel?.cycles || 0;
      document.getElementById('uptime').textContent = formatUptime(data.uptime || 0);

      // Agents
      document.getElementById('agents-total').textContent = data.agents?.total || 0;
      document.getElementById('agents-active').textContent = data.agents?.active || 0;
      document.getElementById('agents-queued').textContent = data.agents?.queued || 0;

      // Memory System
      document.getElementById('memory-episodic').textContent = data.memory_system?.episodic || 0;
      document.getElementById('memory-semantic').textContent = data.memory_system?.semantic || 0;
      document.getElementById('memory-procedural').textContent = data.memory_system?.procedural || 0;
      document.getElementById('memory-total').textContent = data.memory_system?.total || 0;

      // System Memory
      document.getElementById('heap-used').textContent = formatBytes(data.memory?.heapUsed || 0);
      document.getElementById('heap-total').textContent = formatBytes(data.memory?.heapTotal || 0);
      document.getElementById('rss').textContent = formatBytes(data.memory?.rss || 0);
      const heapPercent = data.memory?.heapTotal ? (data.memory.heapUsed / data.memory.heapTotal * 100) : 0;
      document.getElementById('heap-bar').style.width = heapPercent + '%';

      // LLM
      document.getElementById('llm-requests').textContent = data.llm?.totalRequests || 0;
      document.getElementById('llm-cost').textContent = '$' + (data.llm?.totalCost || 0).toFixed(4);
      document.getElementById('llm-latency').textContent = Math.round(data.llm?.averageLatency || 0) + 'ms';
      document.getElementById('llm-providers').textContent = (data.llm?.providers || []).join(', ') || '--';

      // MCP
      document.getElementById('mcp-servers').textContent = data.mcp?.connectedServers || 0;
      document.getElementById('mcp-tools').textContent = data.mcp?.availableTools || 0;
      document.getElementById('mcp-calls').textContent = data.mcp?.totalCalls || 0;
    }

    function addEvent(event) {
      const eventsDiv = document.getElementById('events');
      const time = new Date(event.timestamp).toLocaleTimeString();
      const html = '<div class="event"><span class="event-time">' + time + '</span> ' +
                   '<span class="event-type">[' + event.type + ']</span> ' +
                   JSON.stringify(event.data).slice(0, 50) + '</div>';

      eventsDiv.innerHTML = html + eventsDiv.innerHTML;

      // Keep only last 20 events
      while (eventsDiv.children.length > 20) {
        eventsDiv.removeChild(eventsDiv.lastChild);
      }
    }

    async function fetchMetrics() {
      try {
        const response = await fetch('/api/metrics');
        const data = await response.json();
        updateMetrics(data);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    }

    // Setup SSE for real-time events
    if (typeof EventSource !== 'undefined') {
      const eventSource = new EventSource('/api/events');
      eventSource.onmessage = (e) => {
        const event = JSON.parse(e.data);
        addEvent(event);
      };
      eventSource.onerror = () => {
        console.log('SSE connection lost, reconnecting...');
      };
    }

    // Initial fetch and start polling
    fetchMetrics();
    setInterval(fetchMetrics, REFRESH_INTERVAL);
  </script>
</body>
</html>`;

// ============================================================================
// Dashboard Server
// ============================================================================

export class DashboardServer extends EventEmitter {
  private config: DashboardConfig;
  private server: http.Server | null = null;
  private sseClients: http.ServerResponse[] = [];
  private metricsProvider: (() => SystemMetrics) | null = null;
  private startTime = Date.now();
  private chatAPI: ChatAPI;

  constructor(config: Partial<DashboardConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chatAPI = getChatAPI();
  }

  /**
   * Set metrics provider function
   */
  setMetricsProvider(provider: () => SystemMetrics): void {
    this.metricsProvider = provider;
  }

  /**
   * Get current metrics
   */
  private getMetrics(): SystemMetrics {
    if (this.metricsProvider) {
      return this.metricsProvider();
    }

    // Default metrics from process
    const mem = process.memoryUsage();

    return {
      timestamp: Date.now(),
      uptime: (Date.now() - this.startTime) / 1000,
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
      },
      consciousness: {
        phi: 0,
        state: 'unknown',
        integration: 0,
        complexity: 0,
        attentionFocus: null,
        workspaceContents: [],
      },
      kernel: {
        state: 'unknown',
        energy: 0,
        cycles: 0,
        mode: 'idle',
        levels: {
          l1: { active: false, load: 0 },
          l2: { active: false, load: 0 },
          l3: { active: false, load: 0 },
          l4: { active: false, load: 0 },
        },
        freeEnergy: 0,
        predictionError: 0,
      },
      agents: {
        total: 0,
        active: 0,
        queued: 0,
      },
      memory_system: {
        episodic: 0,
        semantic: 0,
        procedural: 0,
        total: 0,
      },
      llm: {
        totalRequests: 0,
        totalCost: 0,
        averageLatency: 0,
        providers: [],
      },
      mcp: {
        connectedServers: 0,
        availableTools: 0,
        totalCalls: 0,
      },
    };
  }

  /**
   * Handle HTTP request
   */
  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const url = req.url || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (url === '/' || url === '/dashboard') {
      // Serve dashboard HTML
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DASHBOARD_HTML);
    } else if (url === '/api/metrics') {
      // Return metrics JSON
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getMetrics()));
    } else if (url === '/api/events' && this.config.enableSSE) {
      // SSE endpoint
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      this.sseClients.push(res);

      req.on('close', () => {
        const index = this.sseClients.indexOf(res);
        if (index !== -1) {
          this.sseClients.splice(index, 1);
        }
      });
    } else if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: (Date.now() - this.startTime) / 1000 }));
    } else if (url === '/api/mcp/execute' && req.method === 'POST') {
      // MCP Execution Bridge
      this.handleMCPExecution(req, res);
    } else if (url === '/api/mcp/execute' && req.method === 'OPTIONS') {
      // CORS preflight
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      res.end();
    } else if (url?.startsWith('/api/mcp/result/')) {
      // Get MCP result by ID
      const requestId = url.replace('/api/mcp/result/', '');
      this.handleMCPResult(requestId, res);
    } else if (url === '/api/learning/save' && req.method === 'POST') {
      // Save learning state to disk
      this.handleLearningSave(req, res);
    } else if (url === '/api/learning/save' && req.method === 'OPTIONS') {
      // CORS preflight
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      res.end();
    } else if (url === '/api/learning/load' && req.method === 'GET') {
      // Load learning state from disk
      this.handleLearningLoad(res);
    } else if (url?.startsWith('/api/chat') || url?.startsWith('/api/conversations')) {
      // Chat API endpoints
      this.chatAPI.handleRequest(req, res, url).then(handled => {
        if (!handled) {
          res.writeHead(404);
          res.end('Not Found');
        }
      }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  /**
   * Handle MCP execution request
   * Writes request to queue file for Claude Code to process
   */
  private handleMCPExecution(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        const queuePath = path.join(process.cwd(), '.genesis', 'mcp-queue');

        // Ensure queue directory exists
        if (!fs.existsSync(queuePath)) {
          fs.mkdirSync(queuePath, { recursive: true });
        }

        // Write request to queue
        const requestFile = path.join(queuePath, `request-${request.id}.json`);
        fs.writeFileSync(requestFile, JSON.stringify({
          ...request,
          status: 'pending',
          createdAt: Date.now(),
        }, null, 2));

        // Check for result (poll for up to 30 seconds)
        const resultFile = path.join(queuePath, `result-${request.id}.json`);
        let attempts = 0;
        const maxAttempts = 60; // 30 seconds at 500ms intervals

        const checkResult = () => {
          if (fs.existsSync(resultFile)) {
            try {
              const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
              // Clean up files
              try { fs.unlinkSync(requestFile); } catch (err) { console.error('[Dashboard] Failed to unlink request file:', err); }
              try { fs.unlinkSync(resultFile); } catch (err) { console.error('[Dashboard] Failed to unlink result file:', err); }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
              return;
            } catch (e) {
              // Result file exists but isn't ready
            }
          }

          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkResult, 500);
          } else {
            // Timeout - return pending status
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              status: 'pending',
              message: 'MCP execution pending. Run the MCP watcher to process requests.',
              requestId: request.id,
              tool: request.tool,
            }));
          }
        };

        checkResult();

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', details: String(err) }));
      }
    });
  }

  /**
   * Get MCP result by request ID
   */
  private handleMCPResult(requestId: string, res: http.ServerResponse): void {
    const queuePath = path.join(process.cwd(), '.genesis', 'mcp-queue');
    const resultFile = path.join(queuePath, `result-${requestId}.json`);

    if (fs.existsSync(resultFile)) {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Result not found' }));
    }
  }

  /**
   * Save MCP learning state to disk
   * Persists usage patterns, insights, and history for memory integration
   */
  private handleLearningSave(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const learningState = JSON.parse(body);
        const statePath = path.join(process.cwd(), '.genesis', 'mcp-learning-data.json');

        // Ensure .genesis directory exists
        const genesisDir = path.join(process.cwd(), '.genesis');
        if (!fs.existsSync(genesisDir)) {
          fs.mkdirSync(genesisDir, { recursive: true });
        }

        // Save with metadata
        const stateWithMeta = {
          ...learningState,
          savedAt: new Date().toISOString(),
          version: '1.0.0',
        };

        fs.writeFileSync(statePath, JSON.stringify(stateWithMeta, null, 2));

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          savedAt: stateWithMeta.savedAt,
          patterns: learningState.patterns?.length || 0,
        }));
      } catch (err) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  }

  /**
   * Load MCP learning state from disk
   */
  private handleLearningLoad(res: http.ServerResponse): void {
    const statePath = path.join(process.cwd(), '.genesis', 'mcp-learning-data.json');

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (fs.existsSync(statePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        patterns: [],
        totalCalls: 0,
        successfulCalls: 0,
        favoriteTools: [],
        lastSession: null,
        insights: [],
      }));
    }
  }

  /**
   * Broadcast event to all SSE clients
   */
  broadcastEvent(event: EventData): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch (err) {
        // Client disconnected
        console.error('[Dashboard] SSE client write error:', err);
      }
    }
  }

  /**
   * Start the dashboard server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`\n🧬 Genesis Dashboard running at http://${this.config.host}:${this.config.port}\n`);
        this.emit('started', { port: this.config.port, host: this.config.host });
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Close all SSE clients
        for (const client of this.sseClients) {
          client.end();
        }
        this.sseClients = [];

        this.server.close(() => {
          this.server = null;
          this.emit('stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let globalDashboard: DashboardServer | null = null;

/**
 * Get or create the global dashboard instance
 */
export function getDashboard(config?: Partial<DashboardConfig>): DashboardServer {
  if (!globalDashboard) {
    globalDashboard = new DashboardServer(config);
  }
  return globalDashboard;
}

/**
 * Start the dashboard server
 */
export async function startDashboard(config?: Partial<DashboardConfig>): Promise<string> {
  const dashboard = getDashboard(config);
  await dashboard.start();
  return dashboard.getUrl();
}

/**
 * Stop the dashboard server
 */
export async function stopDashboard(): Promise<void> {
  if (globalDashboard) {
    await globalDashboard.stop();
  }
}

/**
 * Broadcast an event to dashboard clients
 */
export function broadcastToDashboard(type: string, data: unknown): void {
  if (globalDashboard) {
    globalDashboard.broadcastEvent({
      id: Date.now().toString(36),
      type,
      timestamp: Date.now(),
      data,
    });
  }
}

// ============================================================================
// Self-Improvement Event Helpers
// ============================================================================

/**
 * Broadcast self-improvement cycle start
 */
export function broadcastCycleStarted(): void {
  broadcastToDashboard('selfimprovement:cycle_started', { timestamp: Date.now() });
}

/**
 * Broadcast stage change in improvement cycle
 */
export function broadcastStageChanged(stage: 'idle' | 'observe' | 'reflect' | 'propose' | 'apply' | 'verify'): void {
  broadcastToDashboard('selfimprovement:stage_changed', { stage, timestamp: Date.now() });
}

/**
 * Broadcast a new improvement proposal
 */
export function broadcastProposalCreated(proposal: {
  id: string;
  category: string;
  target: string;
  change: string;
  reason: string;
  expected: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reversible: boolean;
}): void {
  broadcastToDashboard('selfimprovement:proposal_created', { proposal, timestamp: Date.now() });
}

/**
 * Broadcast sandbox progress
 */
export function broadcastSandboxProgress(sandboxPath: string | null, steps: Array<{
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  progress?: number;
}>): void {
  broadcastToDashboard('selfimprovement:sandbox_progress', { sandboxPath, steps, timestamp: Date.now() });
}

/**
 * Broadcast invariant check results
 */
export function broadcastInvariantChecked(results: Array<{
  id: string;
  name: string;
  passed: boolean;
  message?: string;
}>): void {
  broadcastToDashboard('selfimprovement:invariant_checked', { results, timestamp: Date.now() });
}

/**
 * Broadcast build output line
 */
export function broadcastBuildOutput(line: string): void {
  broadcastToDashboard('selfimprovement:build_output', { line, timestamp: Date.now() });
}

/**
 * Broadcast successful modification
 */
export function broadcastModificationApplied(data: {
  id: string;
  description: string;
  commitHash?: string;
  metrics?: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
}): void {
  broadcastToDashboard('selfimprovement:modification_applied', { ...data, timestamp: Date.now() });
}

/**
 * Broadcast failed modification
 */
export function broadcastModificationFailed(data: {
  id: string;
  description: string;
  reason: string;
  rollbackHash?: string;
}): void {
  broadcastToDashboard('selfimprovement:modification_failed', { ...data, timestamp: Date.now() });
}

/**
 * Broadcast metrics update
 */
export function broadcastMetricsUpdated(metrics: {
  phi: number;
  errorRate: number;
  memoryReuse: number;
  responseTime?: number;
}): void {
  broadcastToDashboard('selfimprovement:metrics_updated', { ...metrics, timestamp: Date.now() });
}

// ============================================================================
// Code RAG Event Helpers
// ============================================================================

/**
 * Broadcast code query execution
 */
export function broadcastCodeQueryExecuted(query: string, resultsCount: number, topFile?: string): void {
  broadcastToDashboard('coderag:query_executed', { query, resultsCount, topFile, timestamp: Date.now() });
}

/**
 * Broadcast file analysis progress
 */
export function broadcastFileAnalyzed(file: string, progress: number): void {
  broadcastToDashboard('coderag:file_analyzed', { file, progress, timestamp: Date.now() });
}

/**
 * Broadcast understanding update
 */
export function broadcastUnderstandingUpdated(modules: Record<string, number>): void {
  broadcastToDashboard('coderag:understanding_updated', { modules, timestamp: Date.now() });
}

// ============================================================================
// Learning Event Helpers
// ============================================================================

/**
 * Broadcast new lesson stored
 */
export function broadcastLessonStored(lesson: {
  id: string;
  content: string;
  type: 'positive' | 'negative';
  confidence: number;
  category: string;
}): void {
  broadcastToDashboard('learning:lesson_stored', { ...lesson, timestamp: Date.now() });
}

/**
 * Broadcast lesson recall
 */
export function broadcastLessonRecalled(lessonId: string): void {
  broadcastToDashboard('learning:lesson_recalled', { lessonId, timestamp: Date.now() });
}

// ============================================================================
// Active Inference Event Helpers
// ============================================================================

export function broadcastActiveInferenceCycle(data: {
  cycle: number;
  beliefs?: Record<string, string>;
  action?: string;
}): void {
  broadcastToDashboard('active-inference:cycle', { ...data, timestamp: Date.now() });
}

export function broadcastActiveInferenceSurprise(data: {
  surprise: number;
  threshold: number;
  action: string;
  outcome: string;
}): void {
  broadcastToDashboard('active-inference:surprise', { ...data, timestamp: Date.now() });
}

export function broadcastActiveInferenceStopped(data: {
  reason: string;
  cycles: number;
  avgSurprise: number;
}): void {
  broadcastToDashboard('active-inference:stopped', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Neuromodulation Event Helpers
// ============================================================================

export function broadcastNeuromodLevels(data: {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  acetylcholine: number;
  effects: {
    explorationRate: number;
    learningRate: number;
    precisionGain: number;
    discountFactor: number;
  };
}): void {
  broadcastToDashboard('neuromod:levels', { ...data, timestamp: Date.now() });
}

export function broadcastNeuromodSignal(data: {
  type: 'reward' | 'punishment' | 'novelty' | 'threat' | 'calm';
  magnitude: number;
  cause: string;
}): void {
  broadcastToDashboard('neuromod:signal', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Nociception (Pain) Event Helpers
// ============================================================================

export function broadcastPainStimulus(data: {
  location: string;
  intensity: number;
  type: 'acute' | 'chronic' | 'phantom';
}): void {
  broadcastToDashboard('pain:stimulus', { ...data, timestamp: Date.now() });
}

export function broadcastPainState(data: {
  totalPain: number;
  threshold: number;
  adaptation: number;
}): void {
  broadcastToDashboard('pain:state', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Allostasis Event Helpers
// ============================================================================

export function broadcastAllostasisRegulation(data: {
  variable: string;
  currentValue: number;
  setpoint: number;
  action: string;
  urgency: number;
}): void {
  broadcastToDashboard('allostasis:regulation', { ...data, timestamp: Date.now() });
}

export function broadcastAllostasisSetpointAdapted(data: {
  variable: string;
  oldSetpoint: number;
  newSetpoint: number;
  reason: string;
}): void {
  broadcastToDashboard('allostasis:setpoint_adapted', { ...data, timestamp: Date.now() });
}

export function broadcastAllostasisThrottle(magnitude: number): void {
  broadcastToDashboard('allostasis:throttle', { magnitude, timestamp: Date.now() });
}

export function broadcastAllostasisDefer(variable: string): void {
  broadcastToDashboard('allostasis:defer', { variable, timestamp: Date.now() });
}

export function broadcastAllostasisHibernate(duration: number): void {
  broadcastToDashboard('allostasis:hibernate', { duration, timestamp: Date.now() });
}

// ============================================================================
// World Model Event Helpers
// ============================================================================

export function broadcastWorldPrediction(data: {
  domain: string;
  prediction: string;
  confidence: number;
}): void {
  broadcastToDashboard('worldmodel:prediction', { ...data, timestamp: Date.now() });
}

export function broadcastConsistencyViolation(data: {
  claim: string;
  conflictsWith: string;
  resolution: string;
}): void {
  broadcastToDashboard('worldmodel:consistency_violation', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Daemon Event Helpers
// ============================================================================

export function broadcastDaemonState(data: {
  state: 'stopped' | 'starting' | 'running' | 'dreaming' | 'maintaining' | 'stopping' | 'error';
  previousState?: string;
}): void {
  broadcastToDashboard('daemon:state', { ...data, timestamp: Date.now() });
}

export function broadcastDaemonTask(data: {
  taskId?: string;
  taskName?: string;
  status: 'scheduled' | 'started' | 'completed' | 'failed' | 'cancelled';
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'idle';
  durationMs?: number;
  error?: string;
}): void {
  broadcastToDashboard('daemon:task', { ...data, timestamp: Date.now() });
}

export function broadcastDaemonDream(data: {
  phase: 'started' | 'completed' | 'interrupted' | 'phase_changed';
  dreamPhase?: string;
  consolidations?: number;
  creativeInsights?: number;
  durationMs?: number;
}): void {
  broadcastToDashboard('daemon:dream', { ...data, timestamp: Date.now() });
}

export function broadcastDaemonMaintenance(data: {
  status: 'started' | 'completed' | 'issue_detected';
  issuesFound?: number;
  issuesFixed?: number;
  memoryReclaimed?: number;
}): void {
  broadcastToDashboard('daemon:maintenance', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Finance/Trading Event Helpers
// ============================================================================

export function broadcastMarketData(data: {
  symbol: string;
  price: number;
  volatility: number;
  volume: number;
}): void {
  broadcastToDashboard('finance:market', { ...data, timestamp: Date.now() });
}

export function broadcastTradingSignal(data: {
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  uncertainty: number;
  action: 'buy' | 'sell' | 'hold';
}): void {
  broadcastToDashboard('finance:signal', { ...data, timestamp: Date.now() });
}

export function broadcastPositionOpened(data: {
  symbol: string;
  size: number;
  entryPrice: number;
  direction: 'long' | 'short';
}): void {
  broadcastToDashboard('finance:position_opened', { ...data, timestamp: Date.now() });
}

export function broadcastPositionClosed(data: {
  symbol: string;
  size: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnL: number;
}): void {
  broadcastToDashboard('finance:position_closed', { ...data, timestamp: Date.now() });
}

export function broadcastDrawdownAlert(data: {
  symbol: string;
  drawdown: number;
  painLevel: number;
  threshold: number;
}): void {
  broadcastToDashboard('finance:drawdown_alert', { ...data, timestamp: Date.now() });
}

export function broadcastRegimeChange(data: {
  symbol: string;
  previousRegime: string;
  newRegime: string;
  confidence: number;
}): void {
  broadcastToDashboard('finance:regime_change', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Revenue Event Helpers
// ============================================================================

export function broadcastRevenueOpportunity(data: {
  opportunityId: string;
  stream: string;
  estimatedRevenue: number;
  estimatedCost: number;
  roi: number;
  risk: number;
}): void {
  broadcastToDashboard('revenue:opportunity', { ...data, timestamp: Date.now() });
}

export function broadcastRevenueTask(data: {
  taskId: string;
  stream: string;
  success: boolean;
  actualRevenue: number;
  actualCost: number;
}): void {
  broadcastToDashboard('revenue:task', { ...data, timestamp: Date.now() });
}

export function broadcastRevenueStream(data: {
  stream: string;
  status: 'active' | 'paused' | 'error';
  totalEarned: number;
  successRate: number;
}): void {
  broadcastToDashboard('revenue:stream', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Content Event Helpers
// ============================================================================

export function broadcastContentCreated(data: {
  contentId: string;
  type: string;
  topic: string;
  platforms: string[];
  keywords: string[];
}): void {
  broadcastToDashboard('content:created', { ...data, timestamp: Date.now() });
}

export function broadcastContentPublished(data: {
  contentId: string;
  platform: string;
  postId: string;
  url?: string;
  status: 'success' | 'failed';
  error?: string;
}): void {
  broadcastToDashboard('content:published', { ...data, timestamp: Date.now() });
}

export function broadcastContentEngagement(data: {
  contentId: string;
  platform: string;
  impressions: number;
  engagements: number;
  engagementRate: number;
}): void {
  broadcastToDashboard('content:engagement', { ...data, timestamp: Date.now() });
}

export function broadcastContentInsight(data: {
  insightType: 'best_platform' | 'optimal_time' | 'trending_topic' | 'performance_alert';
  platform?: string;
  recommendation: string;
  confidence: number;
}): void {
  broadcastToDashboard('content:insight', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Swarm/Coordination Event Helpers
// ============================================================================

export function broadcastSwarmCoordination(data: {
  agentCount: number;
  coordinationType: string;
  emergentPattern?: string;
  consensusLevel: number;
}): void {
  broadcastToDashboard('swarm:coordination', { ...data, timestamp: Date.now() });
}

export function broadcastEmergentPattern(data: {
  pattern: string;
  agents: string[];
  confidence: number;
}): void {
  broadcastToDashboard('swarm:emergence', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Healing Event Helpers
// ============================================================================

export function broadcastHealingStarted(target: string): void {
  broadcastToDashboard('healing:started', { target, timestamp: Date.now() });
}

export function broadcastHealingCompleted(data: {
  target: string;
  success: boolean;
  issuesFixed: number;
}): void {
  broadcastToDashboard('healing:completed', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Grounding/Verification Event Helpers
// ============================================================================

export function broadcastClaimVerified(data: {
  claim: string;
  verified: boolean;
  confidence: number;
  source?: string;
}): void {
  broadcastToDashboard('grounding:verified', { ...data, timestamp: Date.now() });
}

// ============================================================================
// v19.0: P4 Cognitive Module Event Helpers
// ============================================================================

export function broadcastSemioticsEvent(data: {
  type: string;
  sign?: string;
  claim?: string;
  risk?: number;
  confidence?: number;
}): void {
  broadcastToDashboard('semiotics:event', { ...data, timestamp: Date.now() });
}

export function broadcastMorphogeneticEvent(data: {
  type: string;
  agentId: string;
  errorCount?: number;
  severity?: number;
  success?: boolean;
}): void {
  broadcastToDashboard('morphogenetic:event', { ...data, timestamp: Date.now() });
}

export function broadcastStrangeLoopEvent(data: {
  type: string;
  stability?: number;
  content?: string;
  level?: number;
}): void {
  broadcastToDashboard('strange-loop:event', { ...data, timestamp: Date.now() });
}

export function broadcastRSIEvent(data: {
  type: string;
  cycleNumber: number;
  success?: boolean;
  limitationsFound?: number;
}): void {
  broadcastToDashboard('rsi:event', { ...data, timestamp: Date.now() });
}

export function broadcastAutopoiesisEvent(data: {
  cycleNumber: number;
  observationCount: number;
  opportunities: string[];
}): void {
  broadcastToDashboard('autopoiesis:event', { ...data, timestamp: Date.now() });
}

export function broadcastEmbodimentEvent(data: {
  type: string;
  sensorId?: string;
  predictionError?: number;
  reflexType?: string;
}): void {
  broadcastToDashboard('embodiment:event', { ...data, timestamp: Date.now() });
}

export function broadcastSymbioticEvent(data: {
  type: string;
  frictionLevel?: number;
  autonomyScore?: number;
  cognitiveLoad?: number;
}): void {
  broadcastToDashboard('symbiotic:event', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Consciousness Extended Event Helpers
// ============================================================================

export function broadcastAttentionShift(data: {
  from: string | null;
  to: string;
  reason: string;
}): void {
  broadcastToDashboard('consciousness:attention_shift', { ...data, timestamp: Date.now() });
}

export function broadcastWorkspaceIgnition(data: {
  contentId: string;
  sourceModule: string;
  contentType: string;
  salience: number;
}): void {
  broadcastToDashboard('consciousness:ignition', { ...data, timestamp: Date.now() });
}

export function broadcastPhiUpdate(data: {
  phi: number;
  previousPhi: number;
  delta: number;
}): void {
  broadcastToDashboard('consciousness:phi_update', { ...data, timestamp: Date.now() });
}

// ============================================================================
// Kernel Extended Event Helpers
// ============================================================================

export function broadcastKernelCycle(data: {
  cycle: number;
  mode: string;
  totalFE: number;
  levels: Record<string, number>;
  emotional: { valence: number; arousal: number };
}): void {
  broadcastToDashboard('kernel:cycle', { ...data, timestamp: Date.now() });
}

export function broadcastKernelModeChange(data: {
  newMode: string;
  previousMode: string;
}): void {
  broadcastToDashboard('kernel:mode_change', { ...data, timestamp: Date.now() });
}

export function broadcastKernelPanic(data: {
  reason: string;
  severity: 'warning' | 'critical' | 'fatal';
  recoverable: boolean;
}): void {
  broadcastToDashboard('kernel:panic', { ...data, timestamp: Date.now() });
}

export default DashboardServer;
