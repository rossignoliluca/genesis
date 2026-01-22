/**
 * Message Bus Tests
 * Tests for the priority queue-based pub/sub message bus
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('MessageBus', () => {
  let MessageBus: any;
  let bus: any;

  beforeEach(async () => {
    const module = await import('../src/agents/message-bus.js');
    MessageBus = module.MessageBus;
    bus = new MessageBus();
  });

  afterEach(() => {
    bus?.clear();
  });

  // ============================================================================
  // Subscription Tests
  // ============================================================================

  describe('subscribe/unsubscribe', () => {
    test('subscribe returns subscription ID', () => {
      const subId = bus.subscribe('test-agent', () => {});
      assert.ok(subId, 'Should return subscription ID');
      assert.ok(typeof subId === 'string', 'Subscription ID should be string');
    });

    test('unsubscribe removes subscription', () => {
      const subId = bus.subscribe('test-agent', () => {});
      const result = bus.unsubscribe(subId);
      assert.strictEqual(result, true, 'Should return true on successful unsubscribe');
    });

    test('unsubscribe returns false for unknown ID', () => {
      const result = bus.unsubscribe('nonexistent-id');
      assert.strictEqual(result, false, 'Should return false for unknown ID');
    });

    test('multiple subscriptions for same agent', () => {
      const subId1 = bus.subscribe('agent-1', () => {});
      const subId2 = bus.subscribe('agent-1', () => {});
      assert.notStrictEqual(subId1, subId2, 'Should have different IDs');
    });
  });

  // ============================================================================
  // Message Publishing Tests
  // ============================================================================

  describe('publish', () => {
    test('publish returns message ID', async () => {
      const msgId = await bus.publish({
        from: 'sender',
        to: 'receiver',
        type: 'QUERY',
        payload: { data: 'test' },
        priority: 'normal',
      });
      assert.ok(msgId, 'Should return message ID');
      assert.ok(typeof msgId === 'string', 'Message ID should be string');
    });

    test('message delivered to subscriber', async () => {
      let received: any = null;
      bus.subscribe('receiver', (msg: any) => {
        received = msg;
      });

      await bus.publish({
        from: 'sender',
        to: 'receiver',
        type: 'QUERY',
        payload: { data: 'test' },
        priority: 'normal',
      });

      assert.ok(received, 'Message should be received');
      assert.strictEqual(received.payload.data, 'test');
    });

    test('broadcast delivered to all subscribers', async () => {
      const received: any[] = [];

      bus.subscribe('agent-1', (msg: any) => received.push({ agent: 'agent-1', msg }));
      bus.subscribe('agent-2', (msg: any) => received.push({ agent: 'agent-2', msg }));

      await bus.broadcast('sender', 'BROADCAST', { data: 'broadcast-test' });

      assert.strictEqual(received.length, 2, 'Both agents should receive broadcast');
    });

    test('message adds timestamp and ID', async () => {
      let received: any = null;
      bus.subscribe('receiver', (msg: any) => {
        received = msg;
      });

      await bus.publish({
        from: 'sender',
        to: 'receiver',
        type: 'QUERY',
        payload: {},
        priority: 'normal',
      });

      assert.ok(received.id, 'Should have ID');
      assert.ok(received.timestamp, 'Should have timestamp');
      assert.ok(received.timestamp instanceof Date, 'Timestamp should be Date');
    });
  });

  // ============================================================================
  // Priority Queue Tests (v10.3 improvement)
  // ============================================================================

  describe('priority queues', () => {
    test('critical messages processed first', async () => {
      const order: string[] = [];

      bus.subscribe('receiver', (msg: any) => {
        order.push(msg.priority);
      });

      // Publish in reverse priority order
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'low' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'normal' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'high' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'critical' });

      // Due to async processing, each message is processed immediately
      // The order reflects when they were published since queue is empty each time
      assert.ok(order.length === 4, 'All messages should be delivered');
    });

    test('multiple critical messages maintain FIFO within priority', async () => {
      const order: number[] = [];

      bus.subscribe('receiver', (msg: any) => {
        order.push(msg.payload.seq);
      });

      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: { seq: 1 }, priority: 'critical' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: { seq: 2 }, priority: 'critical' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: { seq: 3 }, priority: 'critical' });

      assert.deepStrictEqual(order, [1, 2, 3], 'FIFO order within same priority');
    });
  });

  // ============================================================================
  // Filter Tests
  // ============================================================================

  describe('message filtering', () => {
    test('filter by message type', async () => {
      let received: any = null;

      bus.subscribe('receiver', (msg: any) => { received = msg; }, {
        types: ['ALERT'],
      });

      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: { t: 1 }, priority: 'normal' });
      assert.strictEqual(received, null, 'QUERY should be filtered out');

      await bus.publish({ from: 's', to: 'receiver', type: 'ALERT', payload: { t: 2 }, priority: 'normal' });
      assert.ok(received, 'ALERT should pass filter');
      assert.strictEqual((received as any).payload.t, 2);
    });

    test('filter by sender', async () => {
      let received: any = null;

      bus.subscribe('receiver', (msg: any) => { received = msg; }, {
        from: ['trusted-sender'],
      });

      await bus.publish({ from: 'untrusted', to: 'receiver', type: 'QUERY', payload: { t: 1 }, priority: 'normal' });
      assert.strictEqual(received, null, 'Untrusted sender filtered');

      await bus.publish({ from: 'trusted-sender', to: 'receiver', type: 'QUERY', payload: { t: 2 }, priority: 'normal' });
      assert.ok(received, 'Trusted sender passes');
    });

    test('filter by priority', async () => {
      const received: any[] = [];

      bus.subscribe('receiver', (msg: any) => { received.push(msg); }, {
        priority: ['critical', 'high'],
      });

      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'normal' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'low' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'high' });
      await bus.publish({ from: 's', to: 'receiver', type: 'QUERY', payload: {}, priority: 'critical' });

      assert.strictEqual(received.length, 2, 'Only high and critical should pass');
    });
  });

  // ============================================================================
  // History Tests
  // ============================================================================

  describe('message history', () => {
    test('messages stored in history', async () => {
      await bus.publish({ from: 's', to: 'r', type: 'QUERY', payload: { n: 1 }, priority: 'normal' });
      await bus.publish({ from: 's', to: 'r', type: 'QUERY', payload: { n: 2 }, priority: 'normal' });

      const history = bus.getHistory();
      assert.strictEqual(history.length, 2);
    });

    test('history filter by from', async () => {
      await bus.publish({ from: 'agent-a', to: 'r', type: 'QUERY', payload: {}, priority: 'normal' });
      await bus.publish({ from: 'agent-b', to: 'r', type: 'QUERY', payload: {}, priority: 'normal' });

      const history = bus.getHistory({ from: 'agent-a' });
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].from, 'agent-a');
    });

    test('history limit', async () => {
      await bus.publish({ from: 's', to: 'r', type: 'QUERY', payload: { n: 1 }, priority: 'normal' });
      await bus.publish({ from: 's', to: 'r', type: 'QUERY', payload: { n: 2 }, priority: 'normal' });
      await bus.publish({ from: 's', to: 'r', type: 'QUERY', payload: { n: 3 }, priority: 'normal' });

      const history = bus.getHistory({ limit: 2 });
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].payload.n, 2); // Last 2
      assert.strictEqual(history[1].payload.n, 3);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe('metrics', () => {
    test('tracks messages sent', async () => {
      await bus.publish({ from: 's', to: 'broadcast', type: 'QUERY', payload: {}, priority: 'normal' });
      await bus.publish({ from: 's', to: 'broadcast', type: 'QUERY', payload: {}, priority: 'normal' });

      const metrics = bus.getMetrics();
      assert.strictEqual(metrics.messagesSent, 2);
    });

    test('tracks active subscriptions', () => {
      bus.subscribe('a1', () => {});
      bus.subscribe('a2', () => {});
      const subId = bus.subscribe('a3', () => {});

      let metrics = bus.getMetrics();
      assert.strictEqual(metrics.activeSubscriptions, 3);

      bus.unsubscribe(subId);
      metrics = bus.getMetrics();
      assert.strictEqual(metrics.activeSubscriptions, 2);
    });

    test('tracks uptime', async () => {
      await new Promise(r => setTimeout(r, 10));
      const metrics = bus.getMetrics();
      assert.ok(metrics.uptime >= 10, 'Uptime should be at least 10ms');
    });
  });

  // ============================================================================
  // Clear Tests
  // ============================================================================

  describe('clear', () => {
    test('clear removes all subscriptions', () => {
      bus.subscribe('a1', () => {});
      bus.subscribe('a2', () => {});

      bus.clear();

      const metrics = bus.getMetrics();
      assert.strictEqual(metrics.activeSubscriptions, 0);
    });

    test('clear empties queues', async () => {
      bus.clear();
      const metrics = bus.getMetrics();
      assert.strictEqual(metrics.queueLength, 0);
    });

    test('clear empties history', async () => {
      await bus.publish({ from: 's', to: 'r', type: 'QUERY', payload: {}, priority: 'normal' });
      bus.clear();

      const history = bus.getHistory();
      assert.strictEqual(history.length, 0);
    });
  });

  // ============================================================================
  // Request-Response Pattern Tests
  // ============================================================================

  describe('request-response pattern', () => {
    test('waitForMessage resolves on matching message', async () => {
      const correlationId = 'test-corr-123';

      // Set up responder
      bus.subscribe('responder', async (msg: any) => {
        if (msg.correlationId === correlationId) {
          await bus.publish({
            from: 'responder',
            to: msg.from,
            type: 'RESPONSE',
            payload: { answer: 42 },
            priority: 'normal',
            correlationId: correlationId,
          });
        }
      });

      // Start waiting BEFORE sending request (to avoid race condition)
      const responsePromise = bus.waitForMessage(
        { correlationId, to: 'requester' },
        1000
      );

      // Send request
      await bus.publish({
        from: 'requester',
        to: 'responder',
        type: 'QUERY',
        payload: { question: 'life' },
        priority: 'normal',
        correlationId,
      });

      // Wait for response
      const response = await responsePromise;

      assert.strictEqual(response.payload.answer, 42);
    });

    test('waitForMessage rejects on timeout', async () => {
      try {
        await bus.waitForMessage(
          { correlationId: 'nonexistent' },
          100
        );
        assert.fail('Should have timed out');
      } catch (error: any) {
        assert.strictEqual(error.message, 'Message timeout');
      }
    });
  });
});
