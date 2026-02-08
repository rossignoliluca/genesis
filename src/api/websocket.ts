/**
 * WebSocket Real-Time API v26.0
 *
 * Real-time bidirectional communication for Genesis:
 * - Live system metrics streaming
 * - Decision events push
 * - Bounty status updates
 * - Content publishing notifications
 * - Consciousness phi monitoring
 * - Chat streaming
 *
 * Supports multiple channels with subscription-based filtering.
 *
 * @module api/websocket
 * @version 26.0.0
 */

import * as http from 'http';
import * as crypto from 'crypto';

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getCognitiveBridge } from '../integration/cognitive-bridge.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';
import { getDecisionEngine } from '../autonomous/decision-engine.js';

// ============================================================================
// Types
// ============================================================================

export type WSChannel =
  | 'metrics'
  | 'decisions'
  | 'bounty'
  | 'content'
  | 'consciousness'
  | 'chat'
  | 'all';

export interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'ping' | 'pong';
  channel?: WSChannel;
  data?: unknown;
  id?: string;
}

export interface WSClient {
  id: string;
  socket: any;  // Raw socket
  subscriptions: Set<WSChannel>;
  lastPing: Date;
  authenticated: boolean;
}

export interface WSBroadcast {
  channel: WSChannel;
  event: string;
  data: unknown;
  timestamp: string;
}

export interface WebSocketConfig {
  port: number;
  heartbeatInterval: number;
  clientTimeout: number;
  maxClients: number;
  requireAuth: boolean;
  authToken?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: WebSocketConfig = {
  port: 3002,
  heartbeatInterval: 30000,  // 30 seconds
  clientTimeout: 60000,  // 60 seconds
  maxClients: 100,
  requireAuth: false,
};

// ============================================================================
// WebSocket Server
// ============================================================================

export class GenesisWebSocket {
  private config: WebSocketConfig;
  private server: http.Server | null = null;
  private clients: Map<string, WSClient> = new Map();
  private bus: GenesisEventBus;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<WebSocketConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
  }

  // ===========================================================================
  // Server Lifecycle
  // ===========================================================================

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // Simple HTTP response for non-upgrade requests
        res.writeHead(200);
        res.end('Genesis WebSocket Server');
      });

      this.server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      this.server.listen(this.config.port, () => {
        console.log(`[GenesisWS] WebSocket server running on port ${this.config.port}`);
        this.setupEventForwarding();
        this.startHeartbeat();
        this.startMetricsStream();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      this.closeClient(client, 'Server shutting down');
    }
    this.clients.clear();

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else {
          console.log('[GenesisWS] WebSocket server stopped');
          resolve();
        }
      });
    });
  }

  // ===========================================================================
  // Connection Handling
  // ===========================================================================

  private handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): void {
    // Check max clients
    if (this.clients.size >= this.config.maxClients) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    // Verify WebSocket upgrade
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Compute accept key
    const acceptKey = this.computeAcceptKey(key);

    // Send handshake response
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    // Create client
    const clientId = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const client: WSClient = {
      id: clientId,
      socket,
      subscriptions: new Set(['metrics']),  // Default subscription
      lastPing: new Date(),
      authenticated: !this.config.requireAuth,
    };

    this.clients.set(clientId, client);

    // Setup socket handlers
    socket.on('data', (data: Buffer) => this.handleMessage(client, data));
    socket.on('close', () => this.handleClose(client));
    socket.on('error', (err: Error) => this.handleError(client, err));

    console.log(`[GenesisWS] Client connected: ${clientId}`);

    // Send welcome message
    this.sendToClient(client, {
      type: 'message',
      channel: 'all',
      data: {
        event: 'connected',
        clientId,
        channels: Array.from(client.subscriptions),
      },
    });
  }

  private computeAcceptKey(key: string): string {
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + magic).digest('base64');
  }

  private handleMessage(client: WSClient, data: Buffer): void {
    try {
      // Decode WebSocket frame
      const decoded = this.decodeFrame(data);
      if (!decoded) return;

      const message: WSMessage = JSON.parse(decoded);
      client.lastPing = new Date();

      switch (message.type) {
        case 'subscribe':
          if (message.channel) {
            client.subscriptions.add(message.channel);
            this.sendToClient(client, {
              type: 'message',
              channel: message.channel,
              data: { event: 'subscribed', channel: message.channel },
            });
          }
          break;

        case 'unsubscribe':
          if (message.channel) {
            client.subscriptions.delete(message.channel);
            this.sendToClient(client, {
              type: 'message',
              channel: message.channel,
              data: { event: 'unsubscribed', channel: message.channel },
            });
          }
          break;

        case 'ping':
          this.sendToClient(client, { type: 'pong', id: message.id });
          break;

        case 'message':
          // Handle incoming messages (e.g., chat)
          if (message.channel === 'chat' && message.data) {
            this.handleChatMessage(client, message.data);
          }
          break;
      }
    } catch (error) {
      console.error(`[GenesisWS] Error handling message:`, error);
    }
  }

  private handleClose(client: WSClient): void {
    this.clients.delete(client.id);
    console.log(`[GenesisWS] Client disconnected: ${client.id}`);
  }

  private handleError(client: WSClient, error: Error): void {
    console.error(`[GenesisWS] Client error (${client.id}):`, error.message);
    this.closeClient(client, 'Error occurred');
  }

  private closeClient(client: WSClient, reason: string): void {
    try {
      // Send close frame
      const closeFrame = Buffer.alloc(2);
      closeFrame[0] = 0x88;  // Close opcode
      closeFrame[1] = 0x00;
      client.socket.write(closeFrame);
      client.socket.end();
    } catch {
      // Socket already closed
    }
    this.clients.delete(client.id);
  }

  // ===========================================================================
  // Frame Encoding/Decoding
  // ===========================================================================

  private decodeFrame(data: Buffer): string | null {
    if (data.length < 2) return null;

    const secondByte = data[1];
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7F;
    let offset = 2;

    if (payloadLength === 126) {
      payloadLength = data.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      // 64-bit length - simplified handling
      payloadLength = data.readUInt32BE(6);
      offset = 10;
    }

    let mask: Buffer | null = null;
    if (isMasked) {
      mask = data.slice(offset, offset + 4);
      offset += 4;
    }

    const payload = data.slice(offset, offset + payloadLength);

    if (mask) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    return payload.toString('utf8');
  }

  private encodeFrame(data: string): Buffer {
    const payload = Buffer.from(data, 'utf8');
    const length = payload.length;

    let header: Buffer;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;  // Text frame, FIN
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }

    return Buffer.concat([header, payload]);
  }

  // ===========================================================================
  // Message Sending
  // ===========================================================================

  private sendToClient(client: WSClient, message: WSMessage | WSBroadcast): void {
    try {
      const frame = this.encodeFrame(JSON.stringify(message));
      client.socket.write(frame);
    } catch (error) {
      console.error(`[GenesisWS] Error sending to client ${client.id}:`, error);
    }
  }

  /**
   * Broadcast to all clients subscribed to a channel
   */
  broadcast(channel: WSChannel, event: string, data: unknown): void {
    const message: WSBroadcast = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const client of this.clients.values()) {
      if (client.subscriptions.has(channel) || client.subscriptions.has('all')) {
        this.sendToClient(client, message);
      }
    }
  }

  // ===========================================================================
  // Event Forwarding
  // ===========================================================================

  private setupEventForwarding(): void {
    // Forward decision events
    this.bus.subscribePrefix('decision.', (event: any) => {
      this.broadcast('decisions', event.topic, event.payload || event);
    });

    // Forward bounty events
    this.bus.subscribePrefix('bounty.', (event: any) => {
      this.broadcast('bounty', event.topic, event.payload || event);
    });

    // Forward content events
    this.bus.subscribePrefix('content.', (event: any) => {
      this.broadcast('content', event.topic, event.payload || event);
    });

    // Forward consciousness events
    this.bus.subscribePrefix('consciousness.', (event: any) => {
      this.broadcast('consciousness', event.topic, event.payload || event);
    });

    // Forward neuromodulation events
    this.bus.subscribePrefix('neuromod.', (event: any) => {
      this.broadcast('metrics', event.topic, event.payload || event);
    });

    // Forward pain events
    this.bus.subscribePrefix('pain.', (event: any) => {
      this.broadcast('metrics', event.topic, event.payload || event);
    });
  }

  // ===========================================================================
  // Metrics Streaming
  // ===========================================================================

  private startMetricsStream(): void {
    this.metricsTimer = setInterval(() => {
      this.broadcastMetrics();
    }, 5000);  // Every 5 seconds
  }

  private broadcastMetrics(): void {
    const bridge = getCognitiveBridge();
    const phiMonitor = getPhiMonitor();
    const decisionEngine = getDecisionEngine();

    const levelData = phiMonitor.getCurrentLevel?.() ?? null;
    const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0);

    const metrics = {
      timestamp: new Date().toISOString(),
      consciousness: {
        phi,
        state: phiMonitor.getState?.() ?? 'unknown',
        trend: phiMonitor.getTrend?.() ?? 'stable',
      },
      cognitive: bridge.getStats(),
      decisions: decisionEngine.getStats(),
      clients: this.clients.size,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };

    this.broadcast('metrics', 'system.metrics', metrics);
  }

  // ===========================================================================
  // Heartbeat
  // ===========================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = new Date();
      const timeout = this.config.clientTimeout;

      for (const [id, client] of this.clients) {
        const elapsed = now.getTime() - client.lastPing.getTime();
        if (elapsed > timeout) {
          console.log(`[GenesisWS] Client timeout: ${id}`);
          this.closeClient(client, 'Timeout');
        } else {
          // Send ping
          this.sendToClient(client, { type: 'ping' });
        }
      }
    }, this.config.heartbeatInterval);
  }

  // ===========================================================================
  // Chat Handling
  // ===========================================================================

  private async handleChatMessage(client: WSClient, data: unknown): Promise<void> {
    // Would integrate with Brain for processing
    const message = data as { content: string };
    if (!message.content) return;

    // Echo for now - would integrate with brain.process()
    this.sendToClient(client, {
      type: 'message',
      channel: 'chat',
      data: {
        event: 'response',
        content: `Echo: ${message.content}`,
        from: 'genesis',
      },
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Send to specific client
   */
  sendTo(clientId: string, channel: WSChannel, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    this.sendToClient(client, {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    return true;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let wsInstance: GenesisWebSocket | null = null;

export function getGenesisWebSocket(config?: Partial<WebSocketConfig>): GenesisWebSocket {
  if (!wsInstance) {
    wsInstance = new GenesisWebSocket(config);
  }
  return wsInstance;
}

export function resetGenesisWebSocket(): void {
  if (wsInstance) {
    wsInstance.stop().catch(console.error);
  }
  wsInstance = null;
}

// ============================================================================
// Convenience function
// ============================================================================

export async function startWebSocketServer(config?: Partial<WebSocketConfig>): Promise<GenesisWebSocket> {
  const ws = getGenesisWebSocket(config);
  await ws.start();
  return ws;
}
