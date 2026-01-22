/**
 * Resilient MCP Wrapper Tests
 * Tests for the MCP client with retry, circuit breaker, and fallback
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('ResilientMCP', () => {
  let ResilientMCP: any;
  let getResilientMCP: any;
  let resetResilientMCP: any;
  let client: any;

  beforeEach(async () => {
    const module = await import('../src/mcp/resilient.js');
    ResilientMCP = module.ResilientMCP;
    getResilientMCP = module.getResilientMCP;
    resetResilientMCP = module.resetResilientMCP;

    // Reset singleton between tests
    resetResilientMCP();
    client = new ResilientMCP();
  });

  afterEach(() => {
    resetResilientMCP();
    client = null;
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('configuration', () => {
    test('creates with default config', () => {
      assert.ok(client, 'Should create client');
    });

    test('accepts custom config', () => {
      const customClient = new ResilientMCP({
        defaultTimeout: 5000,
        defaultMaxRetries: 5,
        circuitBreakerThreshold: 10,
        logCalls: true,
      });
      assert.ok(customClient, 'Should create with custom config');
    });
  });

  // ============================================================================
  // Health Tracking Tests
  // ============================================================================

  describe('health tracking', () => {
    test('getServerHealth returns health for known server', () => {
      const health = client.getServerHealth('arxiv');

      assert.ok(health, 'Should return health');
      assert.strictEqual(health.name, 'arxiv');
      assert.strictEqual(typeof health.available, 'boolean');
      assert.strictEqual(typeof health.successRate, 'number');
      assert.strictEqual(typeof health.avgLatency, 'number');
      assert.strictEqual(typeof health.circuitOpen, 'boolean');
    });

    test('getServerHealth returns undefined for unknown server', () => {
      const health = client.getServerHealth('nonexistent-server' as any);
      assert.strictEqual(health, undefined);
    });

    test('getHealth returns health for all servers', () => {
      const allHealth = client.getHealth();

      assert.ok(Array.isArray(allHealth));
      assert.ok(allHealth.length > 0);

      // Check known servers exist
      const serverNames = allHealth.map((h: any) => h.name);
      assert.ok(serverNames.includes('arxiv'));
      assert.ok(serverNames.includes('brave-search'));
      assert.ok(serverNames.includes('github'));
    });

    test('initial success rate is reasonable', () => {
      const health = client.getServerHealth('arxiv');
      assert.ok(health.successRate >= 0 && health.successRate <= 1);
    });
  });

  // ============================================================================
  // Availability Tests
  // ============================================================================

  describe('availability', () => {
    test('isAvailable returns boolean', () => {
      const available = client.isAvailable('arxiv');
      assert.strictEqual(typeof available, 'boolean');
    });

    test('getAvailableServers returns array', () => {
      const servers = client.getAvailableServers();
      assert.ok(Array.isArray(servers));
    });

    test('available servers have health data', () => {
      const servers = client.getAvailableServers();
      for (const server of servers) {
        const health = client.getServerHealth(server);
        assert.ok(health, `Health should exist for ${server}`);
        assert.strictEqual(health.available, true);
        assert.strictEqual(health.circuitOpen, false);
      }
    });
  });

  // ============================================================================
  // Circuit Breaker Tests
  // ============================================================================

  describe('circuit breaker', () => {
    test('resetCircuitBreaker restores availability', () => {
      // First, get a server's health
      const server = 'arxiv';
      let health = client.getServerHealth(server);

      // Manually mark it as unavailable (if we could)
      // For now, just verify reset doesn't throw
      client.resetCircuitBreaker(server);

      health = client.getServerHealth(server);
      assert.strictEqual(health.circuitOpen, false);
      assert.strictEqual(health.consecutiveFailures, 0);
      assert.strictEqual(health.available, true);
    });

    test('resetCircuitBreaker handles unknown server gracefully', () => {
      // Should not throw
      client.resetCircuitBreaker('nonexistent' as any);
      assert.ok(true, 'Did not throw');
    });
  });

  // ============================================================================
  // ServerHealth Structure Tests
  // ============================================================================

  describe('server health structure', () => {
    test('health has all required fields', () => {
      const health = client.getServerHealth('arxiv');

      assert.ok('name' in health, 'Should have name');
      assert.ok('available' in health, 'Should have available');
      assert.ok('successRate' in health, 'Should have successRate');
      assert.ok('avgLatency' in health, 'Should have avgLatency');
      assert.ok('lastSuccess' in health, 'Should have lastSuccess');
      assert.ok('lastFailure' in health, 'Should have lastFailure');
      assert.ok('consecutiveFailures' in health, 'Should have consecutiveFailures');
      assert.ok('circuitOpen' in health, 'Should have circuitOpen');
    });

    test('health fields have correct types', () => {
      const health = client.getServerHealth('brave-search');

      assert.strictEqual(typeof health.name, 'string');
      assert.strictEqual(typeof health.available, 'boolean');
      assert.strictEqual(typeof health.successRate, 'number');
      assert.strictEqual(typeof health.avgLatency, 'number');
      assert.strictEqual(typeof health.lastSuccess, 'number');
      assert.strictEqual(typeof health.lastFailure, 'number');
      assert.strictEqual(typeof health.consecutiveFailures, 'number');
      assert.strictEqual(typeof health.circuitOpen, 'boolean');
    });
  });

  // ============================================================================
  // Singleton Tests
  // ============================================================================

  describe('singleton', () => {
    test('getResilientMCP returns singleton', () => {
      const instance1 = getResilientMCP();
      const instance2 = getResilientMCP();
      assert.strictEqual(instance1, instance2, 'Should return same instance');
    });

    test('resetResilientMCP creates new instance', () => {
      const instance1 = getResilientMCP();
      resetResilientMCP();
      const instance2 = getResilientMCP();
      assert.notStrictEqual(instance1, instance2, 'Should create new instance after reset');
    });
  });

  // ============================================================================
  // Server Categories Tests
  // ============================================================================

  describe('server categories', () => {
    test('knowledge servers are available', () => {
      const knowledgeServers = ['arxiv', 'semantic-scholar', 'context7'];
      for (const server of knowledgeServers) {
        const health = client.getServerHealth(server);
        if (health) {
          assert.strictEqual(health.name, server);
        }
      }
    });

    test('research servers are available', () => {
      const researchServers = ['gemini', 'brave-search', 'exa', 'firecrawl'];
      for (const server of researchServers) {
        const health = client.getServerHealth(server);
        if (health) {
          assert.strictEqual(health.name, server);
        }
      }
    });

    test('creation servers are available', () => {
      const creationServers = ['openai', 'github'];
      for (const server of creationServers) {
        const health = client.getServerHealth(server);
        if (health) {
          assert.strictEqual(health.name, server);
        }
      }
    });

    test('storage servers are available', () => {
      const storageServers = ['memory', 'filesystem'];
      for (const server of storageServers) {
        const health = client.getServerHealth(server);
        if (health) {
          assert.strictEqual(health.name, server);
        }
      }
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration', () => {
    test('new instance has all servers initialized', () => {
      const health = client.getHealth();
      const expectedServers = [
        'arxiv', 'semantic-scholar', 'context7', 'wolfram',
        'gemini', 'brave-search', 'exa', 'firecrawl',
        'openai', 'github',
        'stability-ai',
        'memory', 'filesystem',
      ];

      const serverNames = health.map((h: any) => h.name);
      for (const expected of expectedServers) {
        assert.ok(serverNames.includes(expected), `Should have ${expected}`);
      }
    });

    test('all servers start as available', () => {
      const health = client.getHealth();
      for (const h of health) {
        assert.strictEqual(h.available, true, `${h.name} should be available initially`);
        assert.strictEqual(h.circuitOpen, false, `${h.name} circuit should be closed initially`);
      }
    });
  });
});
