/**
 * Environment Validator
 *
 * Validates environment variables at startup to catch configuration errors early.
 * Supports required/optional variables, type coercion, and custom validators.
 */

export type EnvType = 'string' | 'number' | 'boolean' | 'url' | 'json';

export interface EnvVarSchema {
  // Variable name
  name: string;
  // Expected type
  type: EnvType;
  // Is this variable required?
  required?: boolean;
  // Default value if not set
  default?: string | number | boolean;
  // Description for error messages
  description?: string;
  // Custom validator function
  validator?: (value: string) => boolean;
  // Custom error message
  errorMessage?: string;
  // Sensitive value (don't log)
  sensitive?: boolean;
}

export interface EnvSchema {
  vars: EnvVarSchema[];
  // Fail fast on first error vs collect all errors
  failFast?: boolean;
  // Log validation results
  logResults?: boolean;
}

export interface EnvValidationError {
  variable: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: EnvValidationError[];
  warnings: string[];
  values: Record<string, string | number | boolean>;
}

// Common validators
export const validators = {
  notEmpty: (value: string) => value.length > 0,
  isUrl: (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  isNumber: (value: string) => !isNaN(Number(value)),
  isBoolean: (value: string) => ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase()),
  isJson: (value: string) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  },
  minLength: (min: number) => (value: string) => value.length >= min,
  maxLength: (max: number) => (value: string) => value.length <= max,
  pattern: (regex: RegExp) => (value: string) => regex.test(value),
  oneOf: (options: string[]) => (value: string) => options.includes(value),
  range: (min: number, max: number) => (value: string) => {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
  },
};

export class EnvValidator {
  private schema: EnvSchema;

  constructor(schema: EnvSchema) {
    this.schema = schema;
  }

  /**
   * Validate environment variables against schema
   */
  validate(env: Record<string, string | undefined> = process.env): EnvValidationResult {
    const errors: EnvValidationError[] = [];
    const warnings: string[] = [];
    const values: Record<string, string | number | boolean> = {};

    for (const varSchema of this.schema.vars) {
      const rawValue = env[varSchema.name];

      // Check required
      if (!rawValue && varSchema.required) {
        errors.push({
          variable: varSchema.name,
          message: varSchema.errorMessage || `Required environment variable ${varSchema.name} is not set`,
          expected: varSchema.description || varSchema.type,
        });

        if (this.schema.failFast) {
          break;
        }
        continue;
      }

      // Use default if not set
      if (!rawValue) {
        if (varSchema.default !== undefined) {
          values[varSchema.name] = varSchema.default;
        }
        continue;
      }

      // Type validation and coercion
      const typeResult = this.validateType(rawValue, varSchema);
      if (!typeResult.valid) {
        errors.push({
          variable: varSchema.name,
          message: typeResult.error || `Invalid type for ${varSchema.name}`,
          expected: varSchema.type,
          received: varSchema.sensitive ? '[REDACTED]' : rawValue,
        });

        if (this.schema.failFast) {
          break;
        }
        continue;
      }

      // Custom validator
      if (varSchema.validator && !varSchema.validator(rawValue)) {
        errors.push({
          variable: varSchema.name,
          message: varSchema.errorMessage || `Validation failed for ${varSchema.name}`,
          received: varSchema.sensitive ? '[REDACTED]' : rawValue,
        });

        if (this.schema.failFast) {
          break;
        }
        continue;
      }

      values[varSchema.name] = typeResult.value!;
    }

    // Check for deprecated/unknown variables
    const knownVars = new Set(this.schema.vars.map(v => v.name));
    for (const key of Object.keys(env)) {
      if (key.startsWith('GENESIS_') && !knownVars.has(key)) {
        warnings.push(`Unknown GENESIS_ variable: ${key}`);
      }
    }

    const result: EnvValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      values,
    };

    if (this.schema.logResults) {
      this.logResults(result);
    }

    return result;
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(env?: Record<string, string | undefined>): Record<string, string | number | boolean> {
    const result = this.validate(env);
    if (!result.valid) {
      const errorMessages = result.errors.map(e => `  - ${e.variable}: ${e.message}`).join('\n');
      throw new Error(`Environment validation failed:\n${errorMessages}`);
    }
    return result.values;
  }

  private validateType(value: string, schema: EnvVarSchema): { valid: boolean; value?: string | number | boolean; error?: string } {
    switch (schema.type) {
      case 'string':
        return { valid: true, value };

      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          return { valid: false, error: `Expected number, got "${value}"` };
        }
        return { valid: true, value: num };
      }

      case 'boolean': {
        const lower = value.toLowerCase();
        if (['true', '1', 'yes'].includes(lower)) {
          return { valid: true, value: true };
        }
        if (['false', '0', 'no'].includes(lower)) {
          return { valid: true, value: false };
        }
        return { valid: false, error: `Expected boolean, got "${value}"` };
      }

      case 'url':
        try {
          new URL(value);
          return { valid: true, value };
        } catch {
          return { valid: false, error: `Invalid URL: "${value}"` };
        }

      case 'json':
        try {
          JSON.parse(value);
          return { valid: true, value };
        } catch {
          return { valid: false, error: `Invalid JSON: "${value}"` };
        }

      default:
        return { valid: true, value };
    }
  }

  private logResults(result: EnvValidationResult): void {
    if (result.valid) {
      console.log('[EnvValidator] ✓ Environment validation passed');
      if (result.warnings.length > 0) {
        console.warn('[EnvValidator] Warnings:');
        result.warnings.forEach(w => console.warn(`  - ${w}`));
      }
    } else {
      console.error('[EnvValidator] ✗ Environment validation failed');
      result.errors.forEach(e => {
        console.error(`  - ${e.variable}: ${e.message}`);
      });
    }
  }
}

// Genesis-specific schema
export const GENESIS_ENV_SCHEMA: EnvSchema = {
  failFast: false,
  logResults: true,
  vars: [
    // API Keys (sensitive)
    {
      name: 'ANTHROPIC_API_KEY',
      type: 'string',
      required: false,
      description: 'Anthropic API key for Claude',
      sensitive: true,
      validator: validators.minLength(10),
    },
    {
      name: 'OPENAI_API_KEY',
      type: 'string',
      required: false,
      description: 'OpenAI API key',
      sensitive: true,
      validator: validators.minLength(10),
    },
    {
      name: 'GEMINI_API_KEY',
      type: 'string',
      required: false,
      description: 'Google Gemini API key',
      sensitive: true,
    },

    // MCP Mode
    {
      name: 'GENESIS_MCP_MODE',
      type: 'string',
      required: false,
      default: 'mock',
      description: 'MCP mode: real or mock',
      validator: validators.oneOf(['real', 'mock']),
    },

    // Logging
    {
      name: 'LOG_LEVEL',
      type: 'string',
      required: false,
      default: 'info',
      description: 'Logging level',
      validator: validators.oneOf(['debug', 'info', 'warn', 'error']),
    },

    // Economy
    {
      name: 'GENESIS_BUDGET_LIMIT',
      type: 'number',
      required: false,
      default: 100,
      description: 'Maximum budget in USD',
    },

    // Network
    {
      name: 'GENESIS_PORT',
      type: 'number',
      required: false,
      default: 3000,
      description: 'Server port',
      validator: validators.range(1, 65535),
    },

    // Rate Limiting
    {
      name: 'GENESIS_RATE_LIMIT_MAX',
      type: 'number',
      required: false,
      default: 100,
      description: 'Maximum requests per caller',
    },
    {
      name: 'GENESIS_RATE_LIMIT_RATE',
      type: 'number',
      required: false,
      default: 10,
      description: 'Requests per second refill rate',
    },
  ],
};

/**
 * Validate Genesis environment
 */
export function validateEnv(env?: Record<string, string | undefined>): EnvValidationResult {
  const validator = new EnvValidator(GENESIS_ENV_SCHEMA);
  return validator.validate(env);
}
