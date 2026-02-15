/**
 * Tool Factory Types — Dynamic tool creation and lifecycle
 */

export type ToolStatus = 'draft' | 'testing' | 'candidate' | 'permanent' | 'deprecated';

export interface DynamicTool {
  id: string;
  name: string;
  description: string;
  version: number;
  status: ToolStatus;
  source: string;
  paramSchema: JSONSchema;
  createdBy: 'agent' | 'user';
  createdFrom: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
  lastUsed: Date;
  createdAt: Date;
}

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: unknown[];
}

export interface ToolGenerationRequest {
  task: string;
  examples?: Array<{
    input: Record<string, unknown>;
    expectedOutput: unknown;
  }>;
  constraints?: string[];
  preferComposition?: boolean;
}

export interface ToolTestResult {
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  errors: string[];
  duration: number;
}

export interface ToolFactoryConfig {
  maxRetries: number;
  maxActiveDynamicTools: number;
  candidateThreshold: number;
  permanentThreshold: number;
  successRateMin: number;
  decayDays: number;
}

export const DEFAULT_FACTORY_CONFIG: ToolFactoryConfig = {
  maxRetries: 3,
  maxActiveDynamicTools: 50,
  candidateThreshold: 3,
  permanentThreshold: 10,
  successRateMin: 0.8,
  decayDays: 30,
};
