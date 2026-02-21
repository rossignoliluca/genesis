/**
 * Genesis 6.0 - Daemon Process Manager
 *
 * Handles background process spawning, PID management, and IPC.
 *
 * Architecture:
 * - Parent process spawns detached child
 * - Child creates Unix socket for IPC
 * - CLI commands communicate via socket
 */

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';
import { createDaemon, Daemon, DaemonStatus } from './index.js';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.env.HOME || '/tmp', '.genesis');
const PID_FILE = path.join(DATA_DIR, 'daemon.pid');
const SOCKET_PATH = path.join(DATA_DIR, 'daemon.sock');
const LOG_FILE = path.join(DATA_DIR, 'daemon.log');

// ============================================================================
// Types
// ============================================================================

export interface IPCRequest {
  id: string;
  method: 'status' | 'stop' | 'dream' | 'maintenance' | 'tasks' | 'ping';
  params?: Record<string, any>;
}

export interface IPCResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface DaemonProcessInfo {
  running: boolean;
  pid: number | null;
  uptime: number | null;
  socketPath: string;
}

// ============================================================================
// Process Manager
// ============================================================================

export class DaemonProcessManager {
  private daemon: Daemon | null = null;
  private server: net.Server | null = null;
  private logStream: fs.WriteStream | null = null;

  constructor() {
    this.ensureDataDir();

    // FIX: Ensure log stream is closed on process exit
    process.on('exit', () => {
      this.closeLogging();
    });
  }

  // ============================================================================
  // Data Directory
  // ============================================================================

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // ============================================================================
  // PID Management
  // ============================================================================

  private writePid(): void {
    fs.writeFileSync(PID_FILE, String(process.pid));
  }

  private readPid(): number | null {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch (err) {
      console.error('[DaemonProcess] Failed to read PID file:', err);
      return null;
    }
  }

  private removePid(): void {
    try {
      fs.unlinkSync(PID_FILE);
    } catch (err) {
      // Ignore
      console.error('[DaemonProcess] Failed to remove PID file:', err);
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      console.error('[DaemonProcess] Process not running:', err);
      return false;
    }
  }

  // ============================================================================
  // Socket Management
  // ============================================================================

  private cleanupSocket(): void {
    try {
      if (fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH);
      }
    } catch (err) {
      // Ignore
      console.error('[DaemonProcess] Failed to cleanup socket:', err);
    }
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private initLogging(): void {
    this.logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    // Redirect console to log file
    const originalLog = console.log;
    const originalError = console.error;
    const stream = this.logStream;

    console.log = (...args) => {
      const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
      stream.write(msg);
    };

    console.error = (...args) => {
      const msg = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}\n`;
      stream.write(msg);
    };
  }

  private closeLogging(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  // ============================================================================
  // IPC Server
  // ============================================================================

  // FIX v14.1: Maximum buffer size to prevent OOM from malicious large messages
  private static readonly MAX_IPC_BUFFER_SIZE = 1024 * 1024; // 1MB max

  private startIPCServer(): void {
    this.cleanupSocket();

    this.server = net.createServer((socket) => {
      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();

        // FIX v14.1: Prevent buffer overflow DoS attack
        if (buffer.length > DaemonProcessManager.MAX_IPC_BUFFER_SIZE) {
          console.error('IPC buffer overflow: client sent too much data without newline');
          this.sendResponse(socket, {
            id: 'overflow',
            success: false,
            error: 'Message too large (max 1MB)',
          });
          buffer = '';
          socket.destroy();
          return;
        }

        // Process complete messages (newline-delimited JSON)
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            // FIX v14.1: Also limit individual message size
            if (line.length > DaemonProcessManager.MAX_IPC_BUFFER_SIZE) {
              this.sendResponse(socket, {
                id: 'overflow',
                success: false,
                error: 'Message too large',
              });
              continue;
            }
            this.handleIPCRequest(socket, line.trim());
          }
        }
      });

      socket.on('error', (err) => {
        console.error('IPC socket error:', err.message);
      });
    });

    this.server.listen(SOCKET_PATH, () => {
      console.log(`IPC server listening on ${SOCKET_PATH}`);
    });

    this.server.on('error', (err) => {
      console.error('IPC server error:', err);
    });
  }

  private handleIPCRequest(socket: net.Socket, data: string): void {
    let request: IPCRequest;

    try {
      request = JSON.parse(data);
    } catch (err) {
      console.error('[DaemonProcess] Failed to parse IPC request:', err);
      this.sendResponse(socket, { id: 'unknown', success: false, error: 'Invalid JSON' });
      return;
    }

    const respond = (success: boolean, data?: any, error?: string) => {
      this.sendResponse(socket, { id: request.id, success, data, error });
    };

    try {
      switch (request.method) {
        case 'ping':
          respond(true, { pong: true });
          break;

        case 'status':
          if (this.daemon) {
            respond(true, this.daemon.status());
          } else {
            respond(false, null, 'Daemon not initialized');
          }
          break;

        case 'stop':
          respond(true, { stopping: true });
          // Schedule stop after response is sent
          setImmediate(() => this.stopDaemon());
          break;

        case 'dream':
          if (this.daemon) {
            this.daemon.dream(request.params || {})
              .then((results) => respond(true, results))
              .catch((err) => respond(false, null, err.message));
          } else {
            respond(false, null, 'Daemon not initialized');
          }
          break;

        case 'maintenance':
          if (this.daemon) {
            this.daemon.runMaintenance()
              .then((report) => respond(true, report))
              .catch((err) => respond(false, null, err.message));
          } else {
            respond(false, null, 'Daemon not initialized');
          }
          break;

        case 'tasks':
          if (this.daemon) {
            const tasks = this.daemon.getTasks().map((t) => ({
              id: t.id,
              name: t.name,
              schedule: t.schedule,
              state: t.state,
              lastRun: t.lastRun,
              nextRun: t.nextRun,
            }));
            respond(true, { tasks });
          } else {
            respond(false, null, 'Daemon not initialized');
          }
          break;

        default:
          respond(false, null, `Unknown method: ${request.method}`);
      }
    } catch (err) {
      respond(false, null, err instanceof Error ? err.message : String(err));
    }
  }

  private sendResponse(socket: net.Socket, response: IPCResponse): void {
    try {
      socket.write(JSON.stringify(response) + '\n');
    } catch (err) {
      // Socket may be closed
      console.error('[DaemonProcess] Failed to send IPC response:', err);
    }
  }

  private stopIPCServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.cleanupSocket();
  }

  // ============================================================================
  // Daemon Lifecycle
  // ============================================================================

  /**
   * Start daemon in current process (for background mode)
   */
  startDaemon(): void {
    console.log('Starting Genesis daemon...');

    // Write PID
    this.writePid();

    // Initialize logging
    this.initLogging();

    // Create daemon
    this.daemon = createDaemon({
      log: (msg, level) => console.log(`[${level?.toUpperCase() || 'INFO'}] ${msg}`),
    }, {
      logLevel: 'info',
    });

    // Start IPC server
    this.startIPCServer();

    // Start daemon
    this.daemon.start();

    // Handle shutdown signals
    process.on('SIGTERM', () => this.stopDaemon());
    process.on('SIGINT', () => this.stopDaemon());
    process.on('SIGHUP', () => this.stopDaemon());

    console.log(`Daemon started (PID: ${process.pid})`);
  }

  /**
   * Stop daemon
   */
  stopDaemon(): void {
    console.log('Stopping Genesis daemon...');

    if (this.daemon) {
      this.daemon.stop();
      this.daemon = null;
    }

    this.stopIPCServer();
    this.removePid();
    this.closeLogging();

    console.log('Daemon stopped');
    process.exit(0);
  }

  // ============================================================================
  // CLI Interface
  // ============================================================================

  /**
   * Check if daemon is running
   */
  getInfo(): DaemonProcessInfo {
    const pid = this.readPid();
    const running = pid !== null && this.isProcessRunning(pid);

    // Clean up stale PID file
    if (!running && pid !== null) {
      this.removePid();
    }

    return {
      running,
      pid: running ? pid : null,
      uptime: null, // Would need to query via IPC
      socketPath: SOCKET_PATH,
    };
  }

  /**
   * Spawn daemon as background process
   */
  async spawn(): Promise<{ success: boolean; pid?: number; error?: string }> {
    const info = this.getInfo();
    if (info.running) {
      return { success: false, error: `Daemon already running (PID: ${info.pid})` };
    }

    // Find the entry point
    const entryPoint = process.argv[1];
    const args = ['daemon', 'run'];

    // Spawn detached child
    const child = spawn(process.execPath, [entryPoint, ...args], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, GENESIS_DAEMON_MODE: 'background' },
    });

    child.unref();

    // Wait a moment for the daemon to start
    await new Promise((r) => setTimeout(r, 1000));

    // Verify it started
    const newInfo = this.getInfo();
    if (newInfo.running) {
      return { success: true, pid: newInfo.pid! };
    } else {
      return { success: false, error: 'Daemon failed to start' };
    }
  }

  /**
   * Stop running daemon via IPC
   */
  async kill(): Promise<{ success: boolean; error?: string }> {
    const info = this.getInfo();
    if (!info.running) {
      return { success: false, error: 'Daemon is not running' };
    }

    try {
      // Try IPC first
      const response = await this.ipcCall('stop');
      if (response.success) {
        // Wait for process to exit
        await new Promise((r) => setTimeout(r, 1000));
        return { success: true };
      }
    } catch (err) {
      // IPC failed, try SIGTERM
      console.error('[DaemonProcess] IPC stop failed, falling back to SIGTERM:', err);
    }

    // Fallback to SIGTERM
    if (info.pid) {
      try {
        process.kill(info.pid, 'SIGTERM');
        await new Promise((r) => setTimeout(r, 1000));
        return { success: true };
      } catch (err) {
        console.error('[DaemonProcess] Failed to kill process:', err);
        return { success: false, error: 'Failed to kill process' };
      }
    }

    return { success: false, error: 'Unknown error' };
  }

  /**
   * Send IPC command to daemon
   */
  async ipcCall(method: IPCRequest['method'], params?: Record<string, any>): Promise<IPCResponse> {
    const info = this.getInfo();
    if (!info.running) {
      throw new Error('Daemon is not running');
    }

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(SOCKET_PATH);
      const id = Math.random().toString(36).slice(2);
      let timeout: NodeJS.Timeout;

      socket.on('connect', () => {
        const request: IPCRequest = { id, method, params };
        socket.write(JSON.stringify(request) + '\n');

        timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('IPC timeout'));
        }, 10000);
      });

      socket.on('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          socket.end();
          resolve(response);
        } catch (err) {
          console.error('[DaemonProcess] Failed to parse IPC response:', err);
          socket.destroy();
          reject(new Error('Invalid response'));
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        reject(err);
      });
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let processManager: DaemonProcessManager | null = null;

export function getProcessManager(): DaemonProcessManager {
  if (!processManager) {
    processManager = new DaemonProcessManager();
  }
  return processManager;
}

// ============================================================================
// Constants Export
// ============================================================================

export { DATA_DIR, PID_FILE, SOCKET_PATH, LOG_FILE };
