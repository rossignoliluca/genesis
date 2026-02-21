/**
 * Genesis MCP Streaming Results
 *
 * Real-time streaming of tool results with progress updates.
 * Enables live feedback during long-running operations.
 *
 * Features:
 * - Async iterator for results
 * - Progress events (started, progress, chunk, complete, error)
 * - Timeout handling with partial results
 * - Buffered vs unbuffered modes
 * - Event emitter integration
 */

import { EventEmitter } from 'events';
import { MCPServerName } from '../types.js';
import { getMCPClient, MCPCallResult } from './index.js';

// ============================================================================
// Types
// ============================================================================

export type StreamEventType = 'started' | 'progress' | 'chunk' | 'complete' | 'error' | 'timeout';

export interface StreamEvent<T = any> {
  type: StreamEventType;
  server: MCPServerName;
  tool: string;
  timestamp: Date;
  data?: T;
  progress?: number; // 0-100
  error?: Error;
  latency?: number;
}

export interface StreamOptions {
  // Emit progress events at this interval (ms)
  progressInterval?: number;
  // Timeout for the entire operation (ms)
  timeout?: number;
  // Buffer chunks before emitting (useful for text)
  bufferSize?: number;
  // Emit partial results on timeout
  partialOnTimeout?: boolean;
}

export interface StreamableResult<T = any> {
  // Promise that resolves with final result
  promise: Promise<MCPCallResult<T>>;
  // Event emitter for streaming
  events: EventEmitter;
  // Async iterator for chunks
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent<T>>;
  // Cancel the operation
  cancel(): void;
  // Check if still running
  isRunning(): boolean;
}

// ============================================================================
// Streaming Wrapper
// ============================================================================

export class StreamingMCPWrapper extends EventEmitter {
  private mcpClient = getMCPClient();
  private activeStreams: Map<string, { controller: AbortController; startTime: number }> = new Map();

  /**
   * Call an MCP tool with streaming support
   */
  callStreaming<T = any>(
    server: MCPServerName,
    tool: string,
    params: Record<string, any>,
    options: StreamOptions = {}
  ): StreamableResult<T> {
    const streamId = `${server}.${tool}.${Date.now()}`;
    const controller = new AbortController();
    const startTime = Date.now();

    this.activeStreams.set(streamId, { controller, startTime });

    const events = new EventEmitter();
    let cancelled = false;
    let completed = false;
    const chunks: T[] = [];

    // Emit started event
    const startEvent: StreamEvent = {
      type: 'started',
      server,
      tool,
      timestamp: new Date(),
    };
    events.emit('started', startEvent);
    this.emit('stream:started', startEvent);

    // Set up progress interval
    let progressInterval: NodeJS.Timeout | undefined;
    if (options.progressInterval) {
      let progressCount = 0;
      progressInterval = setInterval(() => {
        if (!completed && !cancelled) {
          progressCount++;
          const progressEvent: StreamEvent = {
            type: 'progress',
            server,
            tool,
            timestamp: new Date(),
            progress: Math.min(95, progressCount * 10), // Synthetic progress
            latency: Date.now() - startTime,
          };
          events.emit('progress', progressEvent);
          this.emit('stream:progress', progressEvent);
        }
      }, options.progressInterval);
    }

    // Set up timeout
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (options.timeout) {
      timeoutHandle = setTimeout(() => {
        if (!completed) {
          cancelled = true;
          controller.abort();

          const timeoutEvent: StreamEvent<T> = {
            type: 'timeout',
            server,
            tool,
            timestamp: new Date(),
            latency: Date.now() - startTime,
            data: options.partialOnTimeout && chunks.length > 0 ? chunks[chunks.length - 1] : undefined,
          };
          events.emit('timeout', timeoutEvent);
          this.emit('stream:timeout', timeoutEvent);
        }
      }, options.timeout);
    }

    // Execute the call
    const promise = (async () => {
      try {
        const result = await this.mcpClient.call<T>(server, tool, params);

        if (cancelled) {
          throw new Error('Stream cancelled');
        }

        completed = true;

        // Emit chunk for the result
        const chunkEvent: StreamEvent<T> = {
          type: 'chunk',
          server,
          tool,
          timestamp: new Date(),
          data: result.data,
          latency: Date.now() - startTime,
        };
        events.emit('chunk', chunkEvent);
        this.emit('stream:chunk', chunkEvent);

        if (result.data) {
          chunks.push(result.data);
        }

        // Emit complete event
        const completeEvent: StreamEvent<T> = {
          type: 'complete',
          server,
          tool,
          timestamp: new Date(),
          data: result.data,
          progress: 100,
          latency: Date.now() - startTime,
        };
        events.emit('complete', completeEvent);
        this.emit('stream:complete', completeEvent);

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        const errorEvent: StreamEvent = {
          type: 'error',
          server,
          tool,
          timestamp: new Date(),
          error: err,
          latency: Date.now() - startTime,
        };
        events.emit('error', errorEvent);
        this.emit('stream:error', errorEvent);

        return {
          success: false,
          error: err.message,
          server,
          tool,
          mode: 'real' as const,
          latency: Date.now() - startTime,
          timestamp: new Date(),
        };
      } finally {
        // Cleanup
        if (progressInterval) clearInterval(progressInterval);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.activeStreams.delete(streamId);
      }
    })();

    // Create async iterator
    const asyncIterator = async function* (): AsyncGenerator<StreamEvent<T>> {
      const queue: StreamEvent<T>[] = [];
      let resolveNext: ((value: IteratorResult<StreamEvent<T>>) => void) | null = null;
      let done = false;

      const push = (event: StreamEvent<T>) => {
        if (resolveNext) {
          resolveNext({ value: event, done: false });
          resolveNext = null;
        } else {
          queue.push(event);
        }
      };

      const onComplete = (e: StreamEvent<T>) => {
        push(e);
        done = true;
      };
      const onError = (e: StreamEvent<T>) => {
        push(e);
        done = true;
      };
      const onTimeout = (e: StreamEvent<T>) => {
        push(e);
        done = true;
      };

      events.on('started', push);
      events.on('progress', push);
      events.on('chunk', push);
      events.on('complete', onComplete);
      events.on('error', onError);
      events.on('timeout', onTimeout);

      try {
        while (!done || queue.length > 0) {
          if (queue.length > 0) {
            yield queue.shift()!;
          } else {
            const event = await new Promise<StreamEvent<T>>((resolve) => {
              resolveNext = (result) => resolve(result.value);
            });
            yield event;
          }
        }
      } finally {
        // Clean up event listeners
        events.removeListener('started', push);
        events.removeListener('progress', push);
        events.removeListener('chunk', push);
        events.removeListener('complete', onComplete);
        events.removeListener('error', onError);
        events.removeListener('timeout', onTimeout);
      }
    };

    return {
      promise,
      events,
      [Symbol.asyncIterator]: asyncIterator,
      cancel: () => {
        cancelled = true;
        controller.abort();
      },
      isRunning: () => !completed && !cancelled,
    };
  }

  /**
   * Call multiple tools with merged streaming
   */
  callParallelStreaming<T = any>(
    calls: Array<{ server: MCPServerName; tool: string; params: Record<string, any> }>,
    options: StreamOptions = {}
  ): StreamableResult<T[]> {
    const events = new EventEmitter();
    const results: T[] = [];
    let completedCount = 0;
    let cancelled = false;
    const startTime = Date.now();

    const streams = calls.map((call) => this.callStreaming<T>(call.server, call.tool, call.params, options));

    // Store listener references for cleanup
    const cleanupFunctions: Array<() => void> = [];

    // Forward all events
    for (let i = 0; i < streams.length; i++) {
      const stream = streams[i];

      const onStarted = (e: StreamEvent<T>) => events.emit('started', { ...e, index: i });
      const onProgress = (e: StreamEvent<T>) => events.emit('progress', { ...e, index: i });
      const onChunk = (e: StreamEvent<T>) => {
        if (e.data) results[i] = e.data;
        events.emit('chunk', { ...e, index: i });
      };
      const onComplete = (e: StreamEvent<T>) => {
        completedCount++;
        if (e.data) results[i] = e.data;
        events.emit('progress', {
          ...e,
          index: i,
          progress: (completedCount / calls.length) * 100,
        });
        if (completedCount === calls.length) {
          events.emit('complete', {
            type: 'complete',
            server: 'parallel',
            tool: 'batch',
            timestamp: new Date(),
            data: results,
            progress: 100,
            latency: Date.now() - startTime,
          });
        }
      };
      const onError = (e: StreamEvent<T>) => events.emit('error', { ...e, index: i });

      stream.events.on('started', onStarted);
      stream.events.on('progress', onProgress);
      stream.events.on('chunk', onChunk);
      stream.events.on('complete', onComplete);
      stream.events.on('error', onError);

      // Store cleanup function
      cleanupFunctions.push(() => {
        stream.events.removeListener('started', onStarted);
        stream.events.removeListener('progress', onProgress);
        stream.events.removeListener('chunk', onChunk);
        stream.events.removeListener('complete', onComplete);
        stream.events.removeListener('error', onError);
      });
    }

    const promise = Promise.all(streams.map((s) => s.promise)).then((allResults) => {
      // Clean up all listeners when promise completes
      cleanupFunctions.forEach(fn => fn());

      return {
        success: allResults.every((r) => r.success),
        data: allResults.map((r) => r.data) as T[],
        server: 'parallel' as const,  // MCPServerName type
        tool: 'batch',
        mode: 'real' as const,
        latency: Date.now() - startTime,
        timestamp: new Date(),
      };
    }).catch((error) => {
      // Clean up on error too
      cleanupFunctions.forEach(fn => fn());
      throw error;
    });

    const asyncIterator = async function* (): AsyncGenerator<StreamEvent<T[]>> {
      for (const stream of streams) {
        for await (const event of stream) {
          yield event as StreamEvent<T[]>;
        }
      }
    };

    return {
      promise,
      events,
      [Symbol.asyncIterator]: asyncIterator,
      cancel: () => {
        cancelled = true;
        streams.forEach((s) => s.cancel());
        cleanupFunctions.forEach(fn => fn());
      },
      isRunning: () => !cancelled && completedCount < calls.length,
    };
  }

  /**
   * Get count of active streams
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Cancel all active streams
   */
  cancelAll(): void {
    for (const [id, { controller }] of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();
  }
}

// ============================================================================
// Progress Reporter
// ============================================================================

export class ProgressReporter {
  private startTime: number = 0;
  private lastUpdate: number = 0;
  private spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIndex = 0;

  start(label: string): void {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    process.stdout.write(`${this.getSpinner()} ${label}...`);
  }

  update(progress?: number): void {
    const elapsed = Date.now() - this.startTime;
    const progressStr = progress !== undefined ? ` ${progress.toFixed(0)}%` : '';
    process.stdout.write(`\r${this.getSpinner()} Working...${progressStr} (${this.formatTime(elapsed)})`);
  }

  complete(label: string): void {
    const elapsed = Date.now() - this.startTime;
    process.stdout.write(`\r✓ ${label} (${this.formatTime(elapsed)})\n`);
  }

  error(label: string): void {
    const elapsed = Date.now() - this.startTime;
    process.stdout.write(`\r✗ ${label} (${this.formatTime(elapsed)})\n`);
  }

  private getSpinner(): string {
    this.spinnerIndex = (this.spinnerIndex + 1) % this.spinner.length;
    return this.spinner[this.spinnerIndex];
  }

  private formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let streamingInstance: StreamingMCPWrapper | null = null;

export function getStreamingWrapper(): StreamingMCPWrapper {
  if (!streamingInstance) {
    streamingInstance = new StreamingMCPWrapper();
  }
  return streamingInstance;
}

export function callStreaming<T = any>(
  server: MCPServerName,
  tool: string,
  params: Record<string, any>,
  options?: StreamOptions
): StreamableResult<T> {
  return getStreamingWrapper().callStreaming<T>(server, tool, params, options);
}
