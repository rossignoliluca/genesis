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
    } else {
      res.writeHead(404);
      res.end('Not Found');
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

export default DashboardServer;
