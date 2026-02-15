/**
 * Presentation-as-a-Service HTTP API
 *
 * Exposes PPTX generation as a monetizable HTTP endpoint.
 * Uses the existing generatePresentation() engine under the hood.
 */

import * as http from 'node:http';
import { generatePresentation } from '../tools/presentation.js';
import type { PresentationSpec, PresentationResult } from './types.js';
import { getRevenueTracker } from '../economy/live/revenue-tracker.js';

export interface PresentationAPIConfig {
  port: number;
  host: string;
  pricePerSlide: number;  // USD
  maxSlides: number;
}

const DEFAULT_CONFIG: PresentationAPIConfig = {
  port: 9877,
  host: 'localhost',
  pricePerSlide: 0.50,
  maxSlides: 50,
};

let serverInstance: http.Server | null = null;

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 5 * 1024 * 1024; // 5MB limit

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleGenerate(req: http.IncomingMessage, res: http.ServerResponse, config: PresentationAPIConfig): Promise<void> {
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'Method not allowed' });
    return;
  }

  let spec: PresentationSpec;
  try {
    const body = await readBody(req);
    spec = JSON.parse(body) as PresentationSpec;
  } catch (err) {
    console.error('[Presentation API] Invalid JSON body:', err);
    jsonResponse(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  // Validate required fields
  if (!spec.meta || !spec.slides || !spec.output_path) {
    jsonResponse(res, 400, { error: 'Missing required fields: meta, slides, output_path' });
    return;
  }

  if (!Array.isArray(spec.slides)) {
    jsonResponse(res, 400, { error: 'slides must be an array' });
    return;
  }

  if (spec.slides.length > config.maxSlides) {
    jsonResponse(res, 400, { error: `Too many slides: ${spec.slides.length} (max ${config.maxSlides})` });
    return;
  }

  const price = spec.slides.length * config.pricePerSlide;

  try {
    const result: PresentationResult = await generatePresentation(spec);

    if (result.success) {
      // Record revenue
      getRevenueTracker().record({
        source: 'presentation',
        amount: price,
        currency: 'USD',
        metadata: {
          slides: result.slides,
          charts: result.charts,
          path: result.path,
        },
      });
    }

    res.setHeader('X-402-Price', price.toFixed(2));
    jsonResponse(res, result.success ? 200 : 500, {
      success: result.success,
      path: result.path,
      slides: result.slides,
      charts: result.charts,
      price,
      duration: result.duration,
      error: result.error,
    });
  } catch (err) {
    jsonResponse(res, 500, { error: `Generation failed: ${(err as Error).message}` });
  }
}

export function startPresentationAPI(userConfig?: Partial<PresentationAPIConfig>): http.Server {
  if (serverInstance) return serverInstance;

  const config: PresentationAPIConfig = { ...DEFAULT_CONFIG, ...userConfig };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    try {
      switch (url.pathname) {
        case '/health':
          jsonResponse(res, 200, {
            status: 'ok',
            version: '1.0.0',
            capabilities: ['pptx-generation', 'charts', 'dark-theme'],
          });
          break;

        case '/generate':
          await handleGenerate(req, res, config);
          break;

        case '/pricing':
          jsonResponse(res, 200, {
            pricePerSlide: config.pricePerSlide,
            currency: 'USD',
            maxSlides: config.maxSlides,
          });
          break;

        default:
          jsonResponse(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      jsonResponse(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`[PresentationAPI] Listening on http://${config.host}:${config.port}`);
  });

  serverInstance = server;
  return server;
}

export function stopPresentationAPI(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    console.log('[PresentationAPI] Stopped');
  }
}

export function isPresentationAPIRunning(): boolean {
  return serverInstance !== null;
}
