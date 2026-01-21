/**
 * Genesis A2A Protocol
 *
 * Agent-to-Agent communication for distributed Genesis collaboration.
 *
 * Enables Genesis instances to:
 * - Discover each other on a network
 * - Advertise and query capabilities
 * - Delegate tasks with payment negotiation
 * - Build trust through attestations
 *
 * Scientific Grounding:
 * - Global Workspace Theory: Network-wide capability broadcast
 * - Free Energy Principle: Trust minimizes surprise in outcomes
 * - Autopoiesis: Agents maintain identity via signatures
 */

// Protocol types and constants
export {
  A2A_PROTOCOL_VERSION,
  type A2AAgentId,
  type A2AEndpoint,
  type A2AMessage,
  type A2AResponse,
  type A2AError,
  type A2AMethod,
  type A2AParams,
  A2AErrorCode,
  // Capability types
  type AgentCapability,
  type CapabilityCategory,
  type CapabilityQuery,
  type PricingModel,
  type RateLimit,
  // Discovery types
  type DiscoveryParams,
  type DiscoveryFilter,
  type AgentAnnouncement,
  // Task types
  type TaskRequest,
  type TaskPriority,
  type TaskContext,
  type TaskProgress,
  type TaskResult,
  type TaskMetrics,
  type TaskArtifact,
  type RetryPolicy,
  // Result types
  type ResultParams,
  type ResultValidation,
  type ValidationIssue,
  type ResultDispute,
  // Trust types
  type TrustLevel,
  type TrustScore,
  type TrustAttestation,
  type TrustReport,
  type TrustQuery,
  type TrustParams,
  // Payment types
  type PaymentQuote,
  type PaymentNegotiation,
  type PaymentCommitment,
  type PaymentCondition,
  type PaymentRelease,
  type PaymentDispute,
  type PaymentParams,
  // Security types
  type A2ASignature,
  type A2AKeyPair,
  // Stream types
  type StreamParams,
  // Factory functions
  createA2AMessage,
  createA2AResponse,
  createA2AError,
  createTaskRequest,
  createCapabilityAdvertisement,
} from './protocol.js';

// Client
export {
  A2AClient,
  generateA2AKeyPair,
  type A2AClientConfig,
  type AgentDirectory,
  type PendingRequest,
  type A2AClientEvents,
} from './client.js';

// Server
export {
  A2AServer,
  type A2AServerConfig,
  type ActiveTask,
  type A2AMethodHandler,
  type HandlerContext,
} from './server.js';
