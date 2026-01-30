/**
 * Genesis A2A Protocol v1.0
 *
 * Agent-to-Agent communication protocol for distributed Genesis instances.
 *
 * Design Principles:
 * - JSON-RPC 2.0 compatible
 * - Transport agnostic (HTTP, WebSocket, MessageBus bridge)
 * - Cryptographically signed messages
 * - MCP tool-calling pattern compatible
 * - Tiered trust model
 *
 * Scientific Grounding:
 * - Global Workspace Theory: Network-wide broadcast for capability discovery
 * - Free Energy Principle: Trust minimizes surprise in task outcomes
 * - Autopoiesis: Agents maintain identity via cryptographic signatures
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Core Protocol Constants
// ============================================================================

export const A2A_PROTOCOL_VERSION = '1.0.0';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Unique identifier for an agent on the network
 * Format: genesis:<instance-id>:<agent-type>
 */
export type A2AAgentId = `genesis:${string}:${string}`;

/**
 * Network address for reaching an agent
 */
export interface A2AEndpoint {
  transport: 'http' | 'websocket' | 'messagebus';
  url: string;
  port?: number;
  secure?: boolean;
}

/**
 * Base A2A Message (JSON-RPC 2.0 compatible)
 */
export interface A2AMessage {
  jsonrpc: '2.0';
  id: string;
  method: A2AMethod;
  params: A2AParams;
  from: A2AAgentId;  // v14.1: Sender agent ID
  signature?: A2ASignature;
  timestamp: string;
  protocol: string;
}

/**
 * A2A Response (JSON-RPC 2.0 compatible)
 */
export interface A2AResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: A2AError;
  signature?: A2ASignature;
  timestamp: string;
}

/**
 * A2A Error structure
 */
export interface A2AError {
  code: A2AErrorCode;
  message: string;
  data?: unknown;
}

/**
 * Protocol methods
 */
export type A2AMethod =
  // Discovery
  | 'a2a.discover'
  | 'a2a.ping'
  | 'a2a.announce'
  // Capabilities
  | 'a2a.capabilities.list'
  | 'a2a.capabilities.advertise'
  | 'a2a.capabilities.query'
  // Task Delegation
  | 'a2a.task.request'
  | 'a2a.task.accept'
  | 'a2a.task.reject'
  | 'a2a.task.progress'
  | 'a2a.task.complete'
  | 'a2a.task.cancel'
  // Results
  | 'a2a.result.submit'
  | 'a2a.result.validate'
  | 'a2a.result.dispute'
  // Trust & Reputation
  | 'a2a.trust.query'
  | 'a2a.trust.attest'
  | 'a2a.trust.report'
  // Payment
  | 'a2a.payment.quote'
  | 'a2a.payment.negotiate'
  | 'a2a.payment.commit'
  | 'a2a.payment.release'
  | 'a2a.payment.dispute'
  // Streams
  | 'a2a.stream.open'
  | 'a2a.stream.data'
  | 'a2a.stream.close';

/**
 * Error codes following JSON-RPC conventions
 */
export enum A2AErrorCode {
  // Standard JSON-RPC errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // A2A specific errors
  AgentNotFound = -32000,
  CapabilityNotFound = -32001,
  TaskNotFound = -32002,
  InsufficientTrust = -32003,
  PaymentRequired = -32004,
  PaymentFailed = -32005,
  TaskRejected = -32006,
  TaskTimeout = -32007,
  ValidationFailed = -32008,
  SignatureInvalid = -32009,
  ProtocolMismatch = -32010,
  RateLimited = -32011,
  AgentBusy = -32012,
  QuotaExceeded = -32013,
}

/**
 * Message parameters union type
 */
export type A2AParams =
  | DiscoveryParams
  | CapabilityParams
  | TaskParams
  | ResultParams
  | TrustParams
  | PaymentParams
  | StreamParams;

// ============================================================================
// Discovery Types
// ============================================================================

export interface DiscoveryParams {
  from: A2AAgentId;
  to?: A2AAgentId;
  filter?: DiscoveryFilter;
}

export interface DiscoveryFilter {
  capabilities?: string[];
  agentTypes?: string[];
  minTrust?: number;
  region?: string;
  limit?: number;
}

export interface AgentAnnouncement {
  agentId: A2AAgentId;
  instanceName: string;
  version: string;
  endpoints: A2AEndpoint[];
  capabilities: AgentCapability[];
  publicKey: string;
  attestations?: TrustAttestation[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Capability Types
// ============================================================================

export interface CapabilityParams {
  from: A2AAgentId;
  to?: A2AAgentId;
  capabilities?: AgentCapability[];
  query?: CapabilityQuery;
}

/**
 * Capability advertisement - MCP compatible
 */
export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  version: string;
  category: CapabilityCategory;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  estimatedDuration?: number;
  costTier: 'free' | 'cheap' | 'moderate' | 'expensive' | 'premium';
  qualityTier: 'basic' | 'good' | 'excellent' | 'expert';
  pricing?: PricingModel;
  rateLimit?: RateLimit;
  requiredTrust?: TrustLevel;
  tags?: string[];
}

export type CapabilityCategory =
  | 'research'
  | 'generation'
  | 'evaluation'
  | 'reasoning'
  | 'memory'
  | 'tools'
  | 'orchestration'
  | 'specialized';

export interface CapabilityQuery {
  category?: CapabilityCategory;
  tags?: string[];
  search?: string;
  maxCostTier?: AgentCapability['costTier'];
  minQualityTier?: AgentCapability['qualityTier'];
}

export interface PricingModel {
  type: 'free' | 'per-request' | 'per-token' | 'per-minute' | 'subscription';
  currency: string;
  basePrice: number;
  variablePrice?: number;
  unit?: 'request' | 'token' | 'minute' | 'mb';
  minCharge?: number;
  maxCharge?: number;
}

export interface RateLimit {
  requests: number;
  window: number;
  burst?: number;
}

// ============================================================================
// Task Delegation Types
// ============================================================================

export interface TaskParams {
  from: A2AAgentId;
  to: A2AAgentId;
  task?: TaskRequest;
  taskId?: string;
  progress?: TaskProgress;
  result?: TaskResult;
  reason?: string;
}

export interface TaskRequest {
  id: string;
  capabilityId: string;
  input: Record<string, unknown>;
  priority: TaskPriority;
  deadline?: string;
  timeout?: number;
  callback?: A2AEndpoint;
  payment?: PaymentCommitment;
  context?: TaskContext;
  retry?: RetryPolicy;
  idempotencyKey?: string;
}

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

export interface TaskContext {
  parentTaskId?: string;
  correlationId?: string;
  workflowId?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
}

export interface TaskProgress {
  taskId: string;
  percentage: number;
  message?: string;
  estimatedRemaining?: number;
  intermediateResult?: unknown;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: unknown;
  error?: A2AError;
  metrics?: TaskMetrics;
  artifacts?: TaskArtifact[];
}

export interface TaskMetrics {
  executionTime: number;
  tokensUsed?: number;
  cost?: number;
  retries?: number;
}

export interface TaskArtifact {
  id: string;
  type: 'file' | 'code' | 'data' | 'image' | 'reference';
  name: string;
  mimeType?: string;
  content?: string;
  url?: string;
  hash?: string;
}

// ============================================================================
// Result Exchange Types
// ============================================================================

export interface ResultParams {
  from: A2AAgentId;
  to: A2AAgentId;
  taskId: string;
  result?: TaskResult;
  validation?: ResultValidation;
  dispute?: ResultDispute;
}

export interface ResultValidation {
  taskId: string;
  status: 'valid' | 'invalid' | 'partial';
  score?: number;
  details?: string;
  issues?: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string;
}

export interface ResultDispute {
  taskId: string;
  reason: string;
  evidence?: unknown;
  resolution: 'refund' | 'redo' | 'partial-refund' | 'arbitration';
}

// ============================================================================
// Trust & Reputation Types
// ============================================================================

export interface TrustParams {
  from: A2AAgentId;
  to?: A2AAgentId;
  about?: A2AAgentId;
  attestation?: TrustAttestation;
  report?: TrustReport;
  query?: TrustQuery;
}

export type TrustLevel =
  | 'untrusted'
  | 'minimal'
  | 'basic'
  | 'verified'
  | 'trusted'
  | 'highly-trusted';

export interface TrustScore {
  agentId: A2AAgentId;
  overall: number;
  components: {
    reliability: number;
    quality: number;
    responsiveness: number;
    financial: number;
  };
  level: TrustLevel;
  interactions: number;
  lastInteraction?: string;
  confidence: number;
}

export interface TrustAttestation {
  id: string;
  from: A2AAgentId;
  about: A2AAgentId;
  type: 'task-completion' | 'quality' | 'behavior' | 'identity' | 'capability';
  rating: number;
  comment?: string;
  taskId?: string;
  timestamp: string;
  signature: A2ASignature;
}

export interface TrustReport {
  id: string;
  from: A2AAgentId;
  about: A2AAgentId;
  type: 'spam' | 'fraud' | 'abuse' | 'quality' | 'payment';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence?: unknown;
  taskId?: string;
}

export interface TrustQuery {
  agentId?: A2AAgentId;
  minLevel?: TrustLevel;
  includeAttestations?: boolean;
  includeReports?: boolean;
}

// ============================================================================
// Payment Types
// ============================================================================

export interface PaymentParams {
  from: A2AAgentId;
  to: A2AAgentId;
  quote?: PaymentQuote;
  negotiation?: PaymentNegotiation;
  commitment?: PaymentCommitment;
  release?: PaymentRelease;
  dispute?: PaymentDispute;
}

export interface PaymentQuote {
  id: string;
  capabilityId: string;
  estimatedInput?: Record<string, unknown>;
  price: number;
  currency: string;
  validUntil: string;
  breakdown?: {
    base: number;
    variable?: number;
    fees?: number;
    discount?: number;
  };
}

export interface PaymentNegotiation {
  quoteId: string;
  counterOffer?: number;
  accept?: boolean;
  rejectReason?: string;
  round: number;
}

export interface PaymentCommitment {
  id: string;
  quoteId: string;
  amount: number;
  currency: string;
  escrowRef?: string;
  conditions?: PaymentCondition[];
}

export interface PaymentCondition {
  type: 'task-complete' | 'validation-pass' | 'timeout' | 'approval';
  params?: Record<string, unknown>;
}

export interface PaymentRelease {
  commitmentId: string;
  amount: number;
  taskId: string;
  reason: 'completed' | 'partial' | 'refund' | 'dispute-resolution';
}

export interface PaymentDispute {
  commitmentId: string;
  taskId: string;
  reason: string;
  evidence?: unknown;
  resolution: 'full-refund' | 'partial-refund' | 'arbitration';
}

// ============================================================================
// Stream Types
// ============================================================================

export interface StreamParams {
  from: A2AAgentId;
  to: A2AAgentId;
  streamId?: string;
  data?: unknown;
  taskId?: string;
  reason?: string;
}

// ============================================================================
// Security Types
// ============================================================================

export interface A2ASignature {
  algorithm: 'ed25519' | 'secp256k1' | 'rsa-sha256';
  publicKey: string;
  value: string;
  timestamp: string;
  nonce: string;
}

export interface A2AKeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: 'ed25519' | 'secp256k1' | 'rsa-sha256';
  keyId: string;
  created: string;
}

// ============================================================================
// Message Factory Functions
// ============================================================================

/**
 * Create a new A2A message
 */
export function createA2AMessage(
  method: A2AMethod,
  params: A2AParams,
  from: A2AAgentId,
  signature?: A2ASignature
): A2AMessage {
  return {
    jsonrpc: '2.0',
    id: randomUUID(),
    method,
    params,
    from,
    signature,
    timestamp: new Date().toISOString(),
    protocol: A2A_PROTOCOL_VERSION,
  };
}

/**
 * Create a success response
 */
export function createA2AResponse(
  requestId: string,
  result: unknown,
  signature?: A2ASignature
): A2AResponse {
  return {
    jsonrpc: '2.0',
    id: requestId,
    result,
    signature,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response
 */
export function createA2AError(
  requestId: string,
  code: A2AErrorCode,
  message: string,
  data?: unknown
): A2AResponse {
  return {
    jsonrpc: '2.0',
    id: requestId,
    error: { code, message, data },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a task request
 */
export function createTaskRequest(
  from: A2AAgentId,
  to: A2AAgentId,
  capabilityId: string,
  input: Record<string, unknown>,
  options: Partial<Omit<TaskRequest, 'id' | 'capabilityId' | 'input'>> = {}
): A2AMessage {
  const task: TaskRequest = {
    id: randomUUID(),
    capabilityId,
    input,
    priority: options.priority || 'normal',
    ...options,
  };

  return createA2AMessage('a2a.task.request', {
    from,
    to,
    task,
  } as TaskParams, from);
}

/**
 * Create a capability advertisement
 */
export function createCapabilityAdvertisement(
  from: A2AAgentId,
  capabilities: AgentCapability[]
): A2AMessage {
  return createA2AMessage('a2a.capabilities.advertise', {
    from,
    capabilities,
  } as CapabilityParams, from);
}
