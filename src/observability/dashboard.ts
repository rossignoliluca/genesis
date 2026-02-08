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
  };
  kernel: {
    state: string;
    energy: number;
    cycles: number;
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

  constructor(config: Partial<DashboardConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
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
      },
      kernel: {
        state: 'unknown',
        energy: 0,
        cycles: 0,
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
              try { fs.unlinkSync(requestFile); } catch {}
              try { fs.unlinkSync(resultFile); } catch {}
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
      } catch {
        // Client disconnected
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

export default DashboardServer;
