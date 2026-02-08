/**
 * Service Request Endpoint
 *
 * HTTP endpoint for receiving service requests from clients.
 * Integrates with revenue activation and economic fiber.
 *
 * Endpoints:
 * - POST /api/services/request - Submit a new service request
 * - GET /api/services/catalog - Get available services
 * - GET /api/services/status/:id - Check request status
 * - POST /api/services/quote - Get a quote for a service
 *
 * @module revenue/service-endpoint
 * @version 19.0.0
 */

import * as http from 'http';
import { SERVICE_CATALOG, type ServiceOffering } from './activation.js';

// ============================================================================
// Types
// ============================================================================

export interface ServiceRequest {
  id: string;
  serviceId: string;
  clientEmail: string;
  clientName: string;
  requirements: string;
  budget?: number;
  deadline?: string;
  status: 'pending' | 'quoted' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  quote?: ServiceQuote;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceQuote {
  amount: number;
  currency: 'USD' | 'USDC';
  breakdown: string[];
  validUntil: Date;
  estimatedDelivery: string;
}

export interface ServiceEndpointConfig {
  port: number;
  host: string;
  corsOrigins: string[];
}

// ============================================================================
// Request Store (In-Memory for now, can be replaced with DB)
// ============================================================================

const requests = new Map<string, ServiceRequest>();

function generateId(): string {
  return `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Request Handlers
// ============================================================================

function handleCatalog(res: http.ServerResponse): void {
  const catalog = SERVICE_CATALOG.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    pricing: s.pricing,
    deliveryTime: s.deliveryTime,
    skills: s.skills,
  }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ services: catalog, count: catalog.length }));
}

function handleRequestSubmit(body: string, res: http.ServerResponse): void {
  try {
    const data = JSON.parse(body);

    // Validate required fields
    if (!data.serviceId || !data.clientEmail || !data.requirements) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: serviceId, clientEmail, requirements' }));
      return;
    }

    // Validate service exists
    const service = SERVICE_CATALOG.find(s => s.id === data.serviceId);
    if (!service) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown service: ${data.serviceId}` }));
      return;
    }

    // Create request
    const request: ServiceRequest = {
      id: generateId(),
      serviceId: data.serviceId,
      clientEmail: data.clientEmail,
      clientName: data.clientName || 'Anonymous',
      requirements: data.requirements,
      budget: data.budget,
      deadline: data.deadline,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Auto-generate quote for fixed-price services
    if (service.pricing.type === 'fixed') {
      request.quote = {
        amount: service.pricing.amount,
        currency: 'USD',
        breakdown: [`${service.name}: $${service.pricing.amount}`],
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        estimatedDelivery: service.deliveryTime,
      };
      request.status = 'quoted';
    }

    requests.set(request.id, request);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      request: {
        id: request.id,
        status: request.status,
        quote: request.quote,
        message: request.quote
          ? `Quote ready: $${request.quote.amount}. Contact genesis@example.com to proceed.`
          : 'Request received. We will send you a quote within 24 hours.',
      },
    }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }
}

function handleRequestStatus(requestId: string, res: http.ServerResponse): void {
  const request = requests.get(requestId);

  if (!request) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request not found' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    id: request.id,
    serviceId: request.serviceId,
    status: request.status,
    quote: request.quote,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }));
}

function handleQuote(body: string, res: http.ServerResponse): void {
  try {
    const data = JSON.parse(body);

    if (!data.serviceId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing serviceId' }));
      return;
    }

    const service = SERVICE_CATALOG.find(s => s.id === data.serviceId);
    if (!service) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown service: ${data.serviceId}` }));
      return;
    }

    // Calculate quote based on pricing type
    let amount: number;
    const breakdown: string[] = [];

    switch (service.pricing.type) {
      case 'fixed':
        amount = service.pricing.amount;
        breakdown.push(`${service.name}: $${amount}`);
        break;
      case 'per-word':
        const wordCount = data.wordCount || 1000;
        amount = Math.ceil(service.pricing.amount * wordCount);
        breakdown.push(`${wordCount} words @ $${service.pricing.amount}/word = $${amount}`);
        break;
      case 'hourly':
        const hours = data.estimatedHours || 4;
        amount = service.pricing.amount * hours;
        breakdown.push(`${hours} hours @ $${service.pricing.amount}/hour = $${amount}`);
        break;
      default:
        amount = service.pricing.amount;
        breakdown.push(`${service.name}: $${amount}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      serviceId: service.id,
      serviceName: service.name,
      quote: {
        amount,
        currency: 'USD',
        breakdown,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        estimatedDelivery: service.deliveryTime,
      },
      paymentMethods: ['USDC (Base L2)', 'Stripe'],
      nextStep: 'Submit a request with your requirements to proceed.',
    }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }
}

// ============================================================================
// Server
// ============================================================================

export function createServiceEndpoint(config: Partial<ServiceEndpointConfig> = {}): http.Server {
  const port = config.port ?? 9877;
  const host = config.host ?? '0.0.0.0';
  const corsOrigins = config.corsOrigins ?? ['*'];

  const server = http.createServer((req, res) => {
    // CORS headers
    const origin = req.headers.origin || '*';
    if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // Route requests
    if (path === '/api/services/catalog' && req.method === 'GET') {
      handleCatalog(res);
      return;
    }

    if (path === '/api/services/request' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => handleRequestSubmit(body, res));
      return;
    }

    if (path.startsWith('/api/services/status/') && req.method === 'GET') {
      const requestId = path.split('/').pop() || '';
      handleRequestStatus(requestId, res);
      return;
    }

    if (path === '/api/services/quote' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => handleQuote(body, res));
      return;
    }

    // Health check
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'genesis-services', version: '19.0.0' }));
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  console.log(`[ServiceEndpoint] Starting on http://${host}:${port}`);

  return server.listen(port, host);
}

// ============================================================================
// Exports
// ============================================================================

export function getServiceRequests(): ServiceRequest[] {
  return Array.from(requests.values());
}

export function getServiceRequest(id: string): ServiceRequest | undefined {
  return requests.get(id);
}

export function updateServiceRequest(id: string, updates: Partial<ServiceRequest>): boolean {
  const request = requests.get(id);
  if (!request) return false;

  Object.assign(request, updates, { updatedAt: new Date() });
  requests.set(id, request);
  return true;
}
