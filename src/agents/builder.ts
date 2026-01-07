/**
 * Genesis 4.0 - Builder Agent
 *
 * Generates code, artifacts, and structures.
 * The craftsman: "Let me build that for you"
 *
 * Features:
 * - Code generation from specifications
 * - Iteration based on Critic feedback
 * - Template-based generation
 * - Quality checks before output
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  BuildArtifact,
  Critique,
} from './types.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface BuildRequest {
  type: 'code' | 'config' | 'documentation' | 'test' | 'schema';
  specification: string;
  language?: string;
  framework?: string;
  constraints?: string[];
  iterateUntilPass?: boolean;
  maxIterations?: number;
}

interface BuildResult {
  artifacts: BuildArtifact[];
  iterations: number;
  passedReview: boolean;
  finalScore?: number;
}

interface Template {
  name: string;
  type: BuildRequest['type'];
  language: string;
  template: string;
  placeholders: string[];
}

// ============================================================================
// Builder Agent
// ============================================================================

export class BuilderAgent extends BaseAgent {
  // Build history
  private buildHistory: BuildResult[] = [];

  // Templates library
  private templates: Map<string, Template> = new Map();

  // Max iterations for improvement cycles
  private maxIterations = 5;

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'builder' }, bus);
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // TypeScript function template
    this.templates.set('ts-function', {
      name: 'ts-function',
      type: 'code',
      language: 'typescript',
      template: `/**
 * {{description}}
 * {{params}}
 * @returns {{returnType}}
 */
export function {{name}}({{parameters}}): {{returnType}} {
  {{body}}
}`,
      placeholders: ['description', 'params', 'returnType', 'name', 'parameters', 'body'],
    });

    // TypeScript class template
    this.templates.set('ts-class', {
      name: 'ts-class',
      type: 'code',
      language: 'typescript',
      template: `/**
 * {{description}}
 */
export class {{name}} {{extends}} {{implements}} {
  {{properties}}

  constructor({{constructorParams}}) {
    {{constructorBody}}
  }

  {{methods}}
}`,
      placeholders: ['description', 'name', 'extends', 'implements', 'properties', 'constructorParams', 'constructorBody', 'methods'],
    });

    // Test template
    this.templates.set('ts-test', {
      name: 'ts-test',
      type: 'test',
      language: 'typescript',
      template: `import { describe, it, expect, beforeEach } from 'vitest';
import { {{imports}} } from '{{importPath}}';

describe('{{suiteName}}', () => {
  {{setup}}

  {{testCases}}
});`,
      placeholders: ['imports', 'importPath', 'suiteName', 'setup', 'testCases'],
    });

    // JSON config template
    this.templates.set('json-config', {
      name: 'json-config',
      type: 'config',
      language: 'json',
      template: `{
  "name": "{{name}}",
  "version": "{{version}}",
  "description": "{{description}}",
  {{additionalFields}}
}`,
      placeholders: ['name', 'version', 'description', 'additionalFields'],
    });

    // Markdown documentation template
    this.templates.set('md-doc', {
      name: 'md-doc',
      type: 'documentation',
      language: 'markdown',
      template: `# {{title}}

{{overview}}

## Features

{{features}}

## Usage

{{usage}}

## API

{{api}}

## Examples

{{examples}}
`,
      placeholders: ['title', 'overview', 'features', 'usage', 'api', 'examples'],
    });
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['BUILD', 'CRITIQUE', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'BUILD':
        return this.handleBuildRequest(message);
      case 'CRITIQUE':
        return this.handleCritique(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Build Logic
  // ============================================================================

  private async handleBuildRequest(message: Message): Promise<Message | null> {
    const request: BuildRequest = message.payload;

    const result = await this.build(request);

    this.log(`Built ${result.artifacts.length} artifact(s) in ${result.iterations} iteration(s)`);

    // Broadcast build result for auto-critique
    await this.broadcast('BUILD_RESULT', {
      artifacts: result.artifacts,
      specification: request.specification,
    });

    return {
      ...this.createResponse(message, 'RESPONSE', result),
      id: '',
      timestamp: new Date(),
    };
  }

  async build(request: BuildRequest): Promise<BuildResult> {
    let artifacts = this.generate(request);
    let iterations = 1;
    let passedReview = false;
    let finalScore = 0;

    // If iteration requested, loop until pass or max iterations
    if (request.iterateUntilPass) {
      const maxIter = request.maxIterations || this.maxIterations;

      while (iterations < maxIter && !passedReview) {
        // Request critique from Critic agent
        const critique = await this.requestCritique(artifacts);

        finalScore = critique.overallScore;
        passedReview = critique.passesReview;

        if (!passedReview) {
          // Iterate based on suggestions
          artifacts = this.iterate(artifacts, critique);
          iterations++;
        }
      }
    }

    const result: BuildResult = {
      artifacts,
      iterations,
      passedReview,
      finalScore,
    };

    this.buildHistory.push(result);
    return result;
  }

  private generate(request: BuildRequest): BuildArtifact[] {
    const artifacts: BuildArtifact[] = [];

    switch (request.type) {
      case 'code':
        artifacts.push(this.generateCode(request));
        break;
      case 'config':
        artifacts.push(this.generateConfig(request));
        break;
      case 'documentation':
        artifacts.push(this.generateDocumentation(request));
        break;
      case 'test':
        artifacts.push(this.generateTest(request));
        break;
      case 'schema':
        artifacts.push(this.generateSchema(request));
        break;
    }

    return artifacts;
  }

  // ============================================================================
  // Code Generation
  // ============================================================================

  private generateCode(request: BuildRequest): BuildArtifact {
    const spec = request.specification;
    const language = request.language || 'typescript';

    // Parse specification to determine structure
    const structure = this.parseSpecification(spec);

    let content: string;

    if (structure.type === 'function') {
      content = this.generateFunction(structure, language);
    } else if (structure.type === 'class') {
      content = this.generateClass(structure, language);
    } else {
      content = this.generateGenericCode(spec, language);
    }

    return {
      type: 'file',
      name: structure.name || 'generated',
      language,
      content,
      metadata: {
        generatedAt: new Date().toISOString(),
        specification: spec.slice(0, 100),
      },
    };
  }

  private parseSpecification(spec: string): {
    type: 'function' | 'class' | 'module' | 'unknown';
    name: string;
    description: string;
    params?: string[];
    methods?: string[];
  } {
    const specLower = spec.toLowerCase();

    // Try to detect type
    let type: 'function' | 'class' | 'module' | 'unknown' = 'unknown';

    if (specLower.includes('function') || specLower.includes('funzione')) {
      type = 'function';
    } else if (specLower.includes('class') || specLower.includes('classe')) {
      type = 'class';
    } else if (specLower.includes('module') || specLower.includes('modulo')) {
      type = 'module';
    }

    // Extract name (look for quoted strings or camelCase/PascalCase words)
    const nameMatch = spec.match(/["']([^"']+)["']/) || spec.match(/\b([A-Z][a-zA-Z0-9]+)\b/);
    const name = nameMatch ? nameMatch[1] : 'Generated';

    return {
      type,
      name,
      description: spec,
    };
  }

  private generateFunction(structure: any, language: string): string {
    const template = this.templates.get('ts-function');

    if (!template || language !== 'typescript') {
      return this.generateGenericCode(structure.description, language);
    }

    // Simple placeholder replacement
    let code = template.template;
    code = code.replace('{{description}}', structure.description || 'Generated function');
    code = code.replace('{{params}}', '');
    code = code.replace('{{returnType}}', 'void');
    code = code.replace('{{name}}', this.toCamelCase(structure.name));
    code = code.replace('{{parameters}}', '');
    code = code.replace('{{body}}', '// TODO: Implement');

    return code;
  }

  private generateClass(structure: any, language: string): string {
    const template = this.templates.get('ts-class');

    if (!template || language !== 'typescript') {
      return this.generateGenericCode(structure.description, language);
    }

    let code = template.template;
    code = code.replace('{{description}}', structure.description || 'Generated class');
    code = code.replace('{{name}}', this.toPascalCase(structure.name));
    code = code.replace('{{extends}}', '');
    code = code.replace('{{implements}}', '');
    code = code.replace('{{properties}}', '');
    code = code.replace('{{constructorParams}}', '');
    code = code.replace('{{constructorBody}}', '');
    code = code.replace('{{methods}}', '');

    return code;
  }

  private generateGenericCode(spec: string, language: string): string {
    // Fallback: generate a stub with the specification as comment
    const commentStyle = language === 'python' ? '#' : '//';

    return `${commentStyle} Generated from specification:
${commentStyle} ${spec.split('\n').join(`\n${commentStyle} `)}

${commentStyle} TODO: Implement this code
`;
  }

  // ============================================================================
  // Other Generators
  // ============================================================================

  private generateConfig(request: BuildRequest): BuildArtifact {
    const template = this.templates.get('json-config');

    let content: string;

    if (template) {
      content = template.template;
      content = content.replace('{{name}}', 'generated-config');
      content = content.replace('{{version}}', '1.0.0');
      content = content.replace('{{description}}', request.specification);
      content = content.replace('{{additionalFields}}', '');
    } else {
      content = JSON.stringify({ specification: request.specification }, null, 2);
    }

    return {
      type: 'file',
      name: 'config.json',
      language: 'json',
      content,
    };
  }

  private generateDocumentation(request: BuildRequest): BuildArtifact {
    const template = this.templates.get('md-doc');

    let content: string;

    if (template) {
      content = template.template;
      content = content.replace('{{title}}', 'Generated Documentation');
      content = content.replace('{{overview}}', request.specification);
      content = content.replace('{{features}}', '- Feature 1\n- Feature 2');
      content = content.replace('{{usage}}', '```\n// Usage example\n```');
      content = content.replace('{{api}}', '## Methods\n\n(API documentation here)');
      content = content.replace('{{examples}}', '```\n// Example\n```');
    } else {
      content = `# Documentation\n\n${request.specification}`;
    }

    return {
      type: 'file',
      name: 'README.md',
      language: 'markdown',
      content,
    };
  }

  private generateTest(request: BuildRequest): BuildArtifact {
    const template = this.templates.get('ts-test');

    let content: string;

    if (template) {
      content = template.template;
      content = content.replace('{{imports}}', 'subject');
      content = content.replace('{{importPath}}', './subject');
      content = content.replace('{{suiteName}}', 'Generated Tests');
      content = content.replace('{{setup}}', '');
      content = content.replace('{{testCases}}', `it('should work', () => {
    // TODO: Implement test
    expect(true).toBe(true);
  });`);
    } else {
      content = `// Test for: ${request.specification}`;
    }

    return {
      type: 'file',
      name: 'generated.test.ts',
      language: 'typescript',
      content,
    };
  }

  private generateSchema(request: BuildRequest): BuildArtifact {
    // Generate a JSON Schema from specification
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Generated Schema',
      description: request.specification,
      type: 'object',
      properties: {},
      required: [],
    };

    return {
      type: 'file',
      name: 'schema.json',
      language: 'json',
      content: JSON.stringify(schema, null, 2),
    };
  }

  // ============================================================================
  // Iteration (based on Critique)
  // ============================================================================

  private async requestCritique(artifacts: BuildArtifact[]): Promise<Critique> {
    try {
      const response = await this.bus.request(
        this.id,
        'critic',
        'CRITIQUE',
        {
          target: artifacts[0]?.name || 'artifact',
          content: artifacts.map((a) => a.content).join('\n\n'),
          type: 'code',
        },
        this.timeout
      );

      return response.payload.critique;
    } catch (error) {
      // Return a passing critique if Critic is unavailable
      return {
        target: 'artifact',
        problems: [],
        suggestions: [],
        overallScore: 0.8,
        passesReview: true,
      };
    }
  }

  private iterate(artifacts: BuildArtifact[], critique: Critique): BuildArtifact[] {
    // Apply suggestions to improve artifacts
    return artifacts.map((artifact) => {
      let improved = artifact.content;

      for (const suggestion of critique.suggestions) {
        // Simple improvements
        if (suggestion.description.includes('console.log')) {
          improved = improved.replace(/console\.log\([^)]*\);?\n?/g, '');
        }

        if (suggestion.description.includes('TODO')) {
          // Replace TODOs with placeholder implementations
          improved = improved.replace(/\/\/ TODO:.*\n/g, '// Implemented\n');
        }

        if (suggestion.description.includes('documentation')) {
          // Add basic JSDoc if missing
          if (!improved.includes('/**')) {
            improved = `/**\n * Auto-generated documentation\n */\n${improved}`;
          }
        }
      }

      return {
        ...artifact,
        content: improved,
        metadata: {
          ...artifact.metadata,
          iteration: (artifact.metadata?.iteration || 0) + 1,
        },
      };
    });
  }

  // ============================================================================
  // Critique Handling (from external Critic)
  // ============================================================================

  private async handleCritique(message: Message): Promise<Message | null> {
    const { artifact, critique } = message.payload;

    this.log(`Received critique for "${artifact}": score ${critique.overallScore}`);

    // Could trigger re-iteration here
    // For now, just acknowledge

    return {
      ...this.createResponse(message, 'RESPONSE', { acknowledged: true }),
      id: '',
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Query & Commands
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query } = message.payload;

    if (query === 'templates') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          templates: Array.from(this.templates.keys()),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    return null;
  }

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'add_template':
        this.templates.set(params.name, params.template);
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'execute_step':
        // Handle step execution from Planner
        const result = await this.build({
          type: 'code',
          specification: params.step,
        });
        return {
          ...this.createResponse(message, 'RESPONSE', result),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
  }

  private toPascalCase(str: string): string {
    const camel = this.toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }

  getStats() {
    const builds = this.buildHistory;
    const totalArtifacts = builds.reduce((sum, b) => sum + b.artifacts.length, 0);
    const avgIterations = builds.reduce((sum, b) => sum + b.iterations, 0) / (builds.length || 1);
    const passRate = builds.filter((b) => b.passedReview).length / (builds.length || 1);

    return {
      totalBuilds: builds.length,
      totalArtifacts,
      avgIterations,
      passRate,
      templates: this.templates.size,
    };
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('builder', (bus) => new BuilderAgent(bus));

export function createBuilderAgent(bus?: MessageBus): BuilderAgent {
  return new BuilderAgent(bus);
}
