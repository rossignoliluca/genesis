/**
 * Lifecycle Module Tests
 *
 * Tests for production hardening:
 * - Graceful shutdown with drain period
 * - Token bucket rate limiting
 * - Environment validation
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Shutdown Manager Tests
// ============================================================================

describe('Shutdown Manager', () => {
  let ShutdownManager: typeof import('../dist/src/lifecycle/shutdown-manager.js').ShutdownManager;
  let ShutdownPhase: typeof import('../dist/src/lifecycle/shutdown-manager.js').ShutdownPhase;
  let ShutdownPriority: typeof import('../dist/src/lifecycle/shutdown-manager.js').ShutdownPriority;
  let shutdownHelpers: typeof import('../dist/src/lifecycle/shutdown-manager.js').shutdownHelpers;
  let manager: InstanceType<typeof ShutdownManager>;

  beforeEach(async () => {
    const module = await import('../dist/src/lifecycle/shutdown-manager.js');
    ShutdownManager = module.ShutdownManager;
    ShutdownPhase = module.ShutdownPhase;
    ShutdownPriority = module.ShutdownPriority;
    shutdownHelpers = module.shutdownHelpers;
    manager = new ShutdownManager({ logProgress: false });
  });

  describe('initialization', () => {
    test('creates manager with default config', () => {
      assert.ok(manager, 'Manager should be created');
      assert.strictEqual(manager.isInShutdown(), false);
    });

    test('creates manager with custom config', () => {
      const custom = new ShutdownManager({
        gracePeriodMs: 5000,
        forceTimeoutMs: 10000,
        logProgress: false,
      });
      assert.ok(custom);
    });
  });

  describe('hook registration', () => {
    test('registers shutdown hook', () => {
      manager.onShutdown('test-hook', async () => {});
      const hooks = manager.getHooks();
      assert.strictEqual(hooks.length, 1);
      assert.strictEqual(hooks[0].name, 'test-hook');
    });

    test('registers with custom priority', () => {
      manager.onShutdown('high', async () => {}, { priority: ShutdownPriority.HIGH });
      manager.onShutdown('low', async () => {}, { priority: ShutdownPriority.LOW });
      manager.onShutdown('critical', async () => {}, { priority: ShutdownPriority.CRITICAL });

      const hooks = manager.getHooks();
      assert.strictEqual(hooks[0].name, 'critical');
      assert.strictEqual(hooks[1].name, 'high');
      assert.strictEqual(hooks[2].name, 'low');
    });

    test('registers with custom phase', () => {
      manager.onShutdown('drain', async () => {}, { phase: ShutdownPhase.DRAIN });
      manager.onShutdown('cleanup', async () => {}, { phase: ShutdownPhase.CLEANUP });

      const hooks = manager.getHooks();
      assert.strictEqual(hooks[0].phase, ShutdownPhase.DRAIN);
      assert.strictEqual(hooks[1].phase, ShutdownPhase.CLEANUP);
    });

    test('clears all hooks', () => {
      manager.onShutdown('test1', async () => {});
      manager.onShutdown('test2', async () => {});
      assert.strictEqual(manager.getHooks().length, 2);

      manager.clearHooks();
      assert.strictEqual(manager.getHooks().length, 0);
    });
  });

  describe('in-flight tracking', () => {
    test('tracks in-flight requests', () => {
      assert.strictEqual(manager.getInFlightCount(), 0);

      const release1 = manager.trackRequest();
      assert.strictEqual(manager.getInFlightCount(), 1);

      const release2 = manager.trackRequest();
      assert.strictEqual(manager.getInFlightCount(), 2);

      release1();
      assert.strictEqual(manager.getInFlightCount(), 1);

      release2();
      assert.strictEqual(manager.getInFlightCount(), 0);
    });

    test('rejects new requests during shutdown', async () => {
      await manager.shutdown();

      assert.throws(() => {
        manager.trackRequest();
      }, /shutting down/);
    });
  });

  describe('shutdown execution', () => {
    test('executes hooks in order', async () => {
      const order: string[] = [];

      manager.register({
        name: 'first',
        priority: ShutdownPriority.CRITICAL,
        phase: ShutdownPhase.DRAIN,
        handler: async () => { order.push('first'); },
      });

      manager.register({
        name: 'second',
        priority: ShutdownPriority.NORMAL,
        phase: ShutdownPhase.CLEANUP,
        handler: async () => { order.push('second'); },
      });

      manager.register({
        name: 'third',
        priority: ShutdownPriority.LOW,
        phase: ShutdownPhase.TERMINATE,
        handler: async () => { order.push('third'); },
      });

      await manager.shutdown();

      assert.deepStrictEqual(order, ['first', 'second', 'third']);
    });

    test('returns success result when all hooks pass', async () => {
      manager.onShutdown('test', async () => {});

      const result = await manager.shutdown();

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.duration >= 0);
    });

    test('returns failure result when hook throws', async () => {
      manager.onShutdown('failing', async () => {
        throw new Error('Test error');
      });

      const result = await manager.shutdown();

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].hook, 'failing');
    });

    test('continues after hook failure', async () => {
      const executed: string[] = [];

      manager.onShutdown('before', async () => { executed.push('before'); });
      manager.onShutdown('failing', async () => { throw new Error('fail'); });
      manager.onShutdown('after', async () => { executed.push('after'); });

      await manager.shutdown();

      assert.ok(executed.includes('before'));
      assert.ok(executed.includes('after'));
    });

    test('deduplicates shutdown calls', async () => {
      let callCount = 0;
      manager.onShutdown('counter', async () => { callCount++; });

      // Call shutdown multiple times
      const promises = [
        manager.shutdown(),
        manager.shutdown(),
        manager.shutdown(),
      ];

      await Promise.all(promises);

      assert.strictEqual(callCount, 1);
    });

    test('emits shutdown events', async () => {
      let started = false;
      let completed = false;

      manager.on('shutdownStarted', () => { started = true; });
      manager.on('shutdownCompleted', () => { completed = true; });

      await manager.shutdown();

      assert.strictEqual(started, true);
      assert.strictEqual(completed, true);
    });
  });

  describe('shutdown helpers', () => {
    test('clearInterval helper', async () => {
      let cleared = false;
      const intervalId = setInterval(() => {}, 1000);
      // Override clearInterval for testing
      const originalClear = clearInterval;
      (global as any).clearInterval = (id: NodeJS.Timeout) => {
        cleared = true;
        originalClear(id);
      };

      const hook = shutdownHelpers.clearInterval('test', intervalId);
      await hook.handler();

      (global as any).clearInterval = originalClear;
      assert.strictEqual(cleared, true);
    });

    test('stopService helper', async () => {
      let stopped = false;
      const service = { stop: async () => { stopped = true; } };

      const hook = shutdownHelpers.stopService('test', service);
      await hook.handler();

      assert.strictEqual(stopped, true);
    });

    test('abort helper', async () => {
      const controller = new AbortController();

      const hook = shutdownHelpers.abort('test', controller);
      await hook.handler();

      assert.strictEqual(controller.signal.aborted, true);
    });
  });
});

// ============================================================================
// Rate Limiter Tests
// ============================================================================

describe('Rate Limiter', () => {
  let RateLimiter: typeof import('../dist/src/lifecycle/rate-limiter.js').RateLimiter;
  let TokenBucket: typeof import('../dist/src/lifecycle/rate-limiter.js').TokenBucket;
  let limiter: InstanceType<typeof RateLimiter>;

  beforeEach(async () => {
    const module = await import('../dist/src/lifecycle/rate-limiter.js');
    RateLimiter = module.RateLimiter;
    TokenBucket = module.TokenBucket;
    limiter = new RateLimiter({
      maxTokens: 10,
      refillRate: 1,
      defaultCost: 1,
      bucketTtlMs: 60000,
      cleanupIntervalMs: 60000,
    });
  });

  afterEach(() => {
    limiter.stop();
  });

  describe('TokenBucket', () => {
    test('creates bucket with max tokens', () => {
      const bucket = new TokenBucket(100, 10);
      assert.strictEqual(bucket.getTokens(), 100);
    });

    test('consumes tokens', () => {
      const bucket = new TokenBucket(10, 1);

      const result = bucket.tryConsume(3);
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.remaining, 7);
    });

    test('rejects when insufficient tokens', () => {
      const bucket = new TokenBucket(5, 1);
      bucket.tryConsume(5); // Use all tokens

      const result = bucket.tryConsume(1);
      assert.strictEqual(result.allowed, false);
      assert.ok(result.retryAfterMs! > 0);
    });

    test('refills tokens over time', async () => {
      const bucket = new TokenBucket(10, 100); // 100 tokens/sec
      bucket.tryConsume(10); // Use all tokens
      assert.strictEqual(bucket.getTokens(), 0);

      // Wait 50ms for ~5 tokens to refill
      await new Promise(r => setTimeout(r, 50));

      const tokens = bucket.getTokens();
      assert.ok(tokens >= 4 && tokens <= 6, `Expected ~5 tokens, got ${tokens}`);
    });
  });

  describe('RateLimiter', () => {
    test('allows requests under limit', () => {
      const result = limiter.check('user1');
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.remaining, 9);
    });

    test('tracks separate callers independently', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      const result1 = limiter.check('user1');
      const result2 = limiter.check('user2');

      assert.strictEqual(result1.remaining, 6);
      assert.strictEqual(result2.remaining, 9);
    });

    test('rejects when limit exceeded', () => {
      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        limiter.check('user1');
      }

      const result = limiter.check('user1');
      assert.strictEqual(result.allowed, false);
      assert.ok(result.retryAfterMs! > 0);
    });

    test('peek does not consume tokens', () => {
      const before = limiter.peek('user1');
      const after = limiter.peek('user1');

      assert.strictEqual(before.remaining, after.remaining);
    });

    test('reserve returns release function', () => {
      const { success, release } = limiter.reserve('user1', 5);
      assert.strictEqual(success, true);

      let result = limiter.peek('user1');
      assert.strictEqual(result.remaining, 5);

      release();

      result = limiter.peek('user1');
      assert.strictEqual(result.remaining, 10);
    });

    test('reset clears caller bucket', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      limiter.reset('user1');

      const result = limiter.check('user1');
      assert.strictEqual(result.remaining, 9);
    });

    test('resetAll clears all buckets', () => {
      limiter.check('user1');
      limiter.check('user2');

      limiter.resetAll();

      const stats = limiter.getStats();
      assert.strictEqual(stats.activeBuckets, 0);
    });

    test('getHeaders returns rate limit headers', () => {
      limiter.check('user1');

      const headers = limiter.getHeaders('user1');

      assert.ok('X-RateLimit-Limit' in headers);
      assert.ok('X-RateLimit-Remaining' in headers);
      assert.ok('X-RateLimit-Reset' in headers);
    });

    test('getStats returns limiter state', () => {
      limiter.check('user1');
      limiter.check('user2');

      const stats = limiter.getStats();

      assert.strictEqual(stats.activeBuckets, 2);
      assert.ok(stats.totalTokensRemaining > 0);
    });
  });
});

// ============================================================================
// Environment Validator Tests
// ============================================================================

describe('Environment Validator', () => {
  let EnvValidator: typeof import('../dist/src/lifecycle/env-validator.js').EnvValidator;
  let validators: typeof import('../dist/src/lifecycle/env-validator.js').validators;

  beforeEach(async () => {
    const module = await import('../dist/src/lifecycle/env-validator.js');
    EnvValidator = module.EnvValidator;
    validators = module.validators;
  });

  describe('validators', () => {
    test('notEmpty', () => {
      assert.strictEqual(validators.notEmpty('hello'), true);
      assert.strictEqual(validators.notEmpty(''), false);
    });

    test('isUrl', () => {
      assert.strictEqual(validators.isUrl('https://example.com'), true);
      assert.strictEqual(validators.isUrl('not-a-url'), false);
    });

    test('isNumber', () => {
      assert.strictEqual(validators.isNumber('123'), true);
      assert.strictEqual(validators.isNumber('12.34'), true);
      assert.strictEqual(validators.isNumber('abc'), false);
    });

    test('isBoolean', () => {
      assert.strictEqual(validators.isBoolean('true'), true);
      assert.strictEqual(validators.isBoolean('false'), true);
      assert.strictEqual(validators.isBoolean('1'), true);
      assert.strictEqual(validators.isBoolean('maybe'), false);
    });

    test('isJson', () => {
      assert.strictEqual(validators.isJson('{"key": "value"}'), true);
      assert.strictEqual(validators.isJson('invalid'), false);
    });

    test('minLength', () => {
      const check = validators.minLength(5);
      assert.strictEqual(check('hello'), true);
      assert.strictEqual(check('hi'), false);
    });

    test('maxLength', () => {
      const check = validators.maxLength(5);
      assert.strictEqual(check('hi'), true);
      assert.strictEqual(check('hello world'), false);
    });

    test('pattern', () => {
      const check = validators.pattern(/^[a-z]+$/);
      assert.strictEqual(check('hello'), true);
      assert.strictEqual(check('Hello123'), false);
    });

    test('oneOf', () => {
      const check = validators.oneOf(['a', 'b', 'c']);
      assert.strictEqual(check('a'), true);
      assert.strictEqual(check('d'), false);
    });

    test('range', () => {
      const check = validators.range(1, 100);
      assert.strictEqual(check('50'), true);
      assert.strictEqual(check('0'), false);
      assert.strictEqual(check('101'), false);
    });
  });

  describe('EnvValidator', () => {
    test('validates required variables', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'REQUIRED_VAR', type: 'string', required: true },
        ],
      });

      const result = validator.validate({});

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].variable, 'REQUIRED_VAR');
    });

    test('uses default values', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'OPTIONAL_VAR', type: 'string', default: 'default-value' },
        ],
      });

      const result = validator.validate({});

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.values['OPTIONAL_VAR'], 'default-value');
    });

    test('coerces number type', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'NUM_VAR', type: 'number' },
        ],
      });

      const result = validator.validate({ NUM_VAR: '42' });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.values['NUM_VAR'], 42);
    });

    test('coerces boolean type', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'BOOL_TRUE', type: 'boolean' },
          { name: 'BOOL_FALSE', type: 'boolean' },
        ],
      });

      const result = validator.validate({
        BOOL_TRUE: 'true',
        BOOL_FALSE: '0',
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.values['BOOL_TRUE'], true);
      assert.strictEqual(result.values['BOOL_FALSE'], false);
    });

    test('validates URL type', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'URL_VAR', type: 'url' },
        ],
      });

      const validResult = validator.validate({ URL_VAR: 'https://example.com' });
      assert.strictEqual(validResult.valid, true);

      const invalidResult = validator.validate({ URL_VAR: 'not-a-url' });
      assert.strictEqual(invalidResult.valid, false);
    });

    test('runs custom validators', () => {
      const validator = new EnvValidator({
        vars: [
          {
            name: 'CUSTOM_VAR',
            type: 'string',
            validator: (v) => v.startsWith('prefix_'),
          },
        ],
      });

      const validResult = validator.validate({ CUSTOM_VAR: 'prefix_value' });
      assert.strictEqual(validResult.valid, true);

      const invalidResult = validator.validate({ CUSTOM_VAR: 'no_prefix' });
      assert.strictEqual(invalidResult.valid, false);
    });

    test('fails fast when configured', () => {
      const validator = new EnvValidator({
        failFast: true,
        vars: [
          { name: 'VAR1', type: 'string', required: true },
          { name: 'VAR2', type: 'string', required: true },
        ],
      });

      const result = validator.validate({});

      assert.strictEqual(result.errors.length, 1);
    });

    test('collects all errors when not fail fast', () => {
      const validator = new EnvValidator({
        failFast: false,
        vars: [
          { name: 'VAR1', type: 'string', required: true },
          { name: 'VAR2', type: 'string', required: true },
        ],
      });

      const result = validator.validate({});

      assert.strictEqual(result.errors.length, 2);
    });

    test('validateOrThrow throws on error', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'REQUIRED', type: 'string', required: true },
        ],
      });

      assert.throws(() => {
        validator.validateOrThrow({});
      }, /Environment validation failed/);
    });

    test('validates JSON type', () => {
      const validator = new EnvValidator({
        vars: [
          { name: 'JSON_VAR', type: 'json' },
        ],
      });

      const validResult = validator.validate({ JSON_VAR: '{"key": "value"}' });
      assert.strictEqual(validResult.valid, true);

      const invalidResult = validator.validate({ JSON_VAR: 'not json' });
      assert.strictEqual(invalidResult.valid, false);
    });
  });
});
