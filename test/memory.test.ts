/**
 * Memory Module Tests
 *
 * Tests for the memory system:
 * - Forgetting (Ebbinghaus curve, retention, stability)
 * - Episodic Store (events, context, temporal)
 * - Semantic Store (facts, concepts, hierarchy)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Forgetting Module Tests
// ============================================================================

describe('Forgetting Module', () => {
  let forgettingModule: any;

  beforeEach(async () => {
    forgettingModule = await import('../src/memory/forgetting.js');
  });

  describe('FORGETTING_THRESHOLDS', () => {
    test('has all required thresholds', () => {
      const { FORGETTING_THRESHOLDS } = forgettingModule;

      assert.ok('FORGET' in FORGETTING_THRESHOLDS, 'Should have FORGET');
      assert.ok('WEAK' in FORGETTING_THRESHOLDS, 'Should have WEAK');
      assert.ok('STRONG' in FORGETTING_THRESHOLDS, 'Should have STRONG');
      assert.ok('DEFAULT_STABILITY' in FORGETTING_THRESHOLDS, 'Should have DEFAULT_STABILITY');
      assert.ok('MAX_STABILITY' in FORGETTING_THRESHOLDS, 'Should have MAX_STABILITY');
    });

    test('thresholds are ordered correctly', () => {
      const { FORGETTING_THRESHOLDS } = forgettingModule;

      assert.ok(FORGETTING_THRESHOLDS.FORGET < FORGETTING_THRESHOLDS.WEAK,
        'FORGET should be less than WEAK');
      assert.ok(FORGETTING_THRESHOLDS.WEAK < FORGETTING_THRESHOLDS.STRONG,
        'WEAK should be less than STRONG');
      assert.ok(FORGETTING_THRESHOLDS.STRONG <= 1,
        'STRONG should be <= 1');
    });
  });

  describe('calculateRetention', () => {
    test('returns R0 for immediate access (t=0)', () => {
      const { calculateRetention } = forgettingModule;

      const params = { R0: 1.0, S: 1.0 };
      const now = Date.now();
      const retention = calculateRetention(params, now, now);

      assert.strictEqual(retention, 1.0, 'Retention should be R0 at t=0');
    });

    test('retention decays over time', () => {
      const { calculateRetention } = forgettingModule;

      const params = { R0: 1.0, S: 1.0 }; // S=1 day
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);

      const retention = calculateRetention(params, oneDayAgo, now);

      // After 1 day with S=1: R = 1 * e^(-1/1) = e^(-1) ≈ 0.368
      assert.ok(retention > 0.3, 'Retention should be > 0.3');
      assert.ok(retention < 0.4, 'Retention should be < 0.4');
    });

    test('higher stability means slower decay', () => {
      const { calculateRetention } = forgettingModule;

      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);

      const lowStability = calculateRetention({ R0: 1.0, S: 0.5 }, oneDayAgo, now);
      const highStability = calculateRetention({ R0: 1.0, S: 5.0 }, oneDayAgo, now);

      assert.ok(highStability > lowStability,
        'Higher stability should mean higher retention after same time');
    });

    test('retention is clamped between 0 and 1', () => {
      const { calculateRetention } = forgettingModule;

      const params = { R0: 1.5, S: 0.1 }; // High R0, very low stability
      const now = Date.now();
      const longAgo = now - (365 * 24 * 60 * 60 * 1000); // 1 year ago

      const retention = calculateRetention(params, longAgo, now);

      assert.ok(retention >= 0, 'Retention should be >= 0');
      assert.ok(retention <= 1, 'Retention should be <= 1');
    });

    test('Ebbinghaus formula: R = R0 * e^(-t/S)', () => {
      const { calculateRetention } = forgettingModule;

      const R0 = 0.9;
      const S = 2.0; // 2 days stability
      const params = { R0, S };
      const now = Date.now();
      const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);

      const retention = calculateRetention(params, twoDaysAgo, now);

      // Expected: 0.9 * e^(-2/2) = 0.9 * e^(-1) ≈ 0.331
      const expected = R0 * Math.exp(-2 / S);
      assert.ok(Math.abs(retention - expected) < 0.01,
        `Retention should follow Ebbinghaus formula, got ${retention}, expected ${expected}`);
    });
  });

  describe('shouldForget', () => {
    test('returns true for very old memories', () => {
      const { shouldForget, FORGETTING_THRESHOLDS } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0, // 1 day stability
        lastAccessed: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        importance: 0.5,
        emotionalValence: 0,
      };

      const result = shouldForget(memory);

      assert.strictEqual(result, true, 'Very old memory should be forgotten');
    });

    test('returns false for recent memories', () => {
      const { shouldForget } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(), // Just now
        importance: 0.5,
        emotionalValence: 0,
      };

      const result = shouldForget(memory);

      assert.strictEqual(result, false, 'Recent memory should not be forgotten');
    });

    test('respects custom threshold', () => {
      const { shouldForget } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        importance: 0.5,
        emotionalValence: 0,
      };

      // With very high threshold, even recent memories should be "forgotten"
      const resultHighThreshold = shouldForget(memory, 0.9);
      // With very low threshold, should not be forgotten
      const resultLowThreshold = shouldForget(memory, 0.01);

      assert.strictEqual(resultHighThreshold, true, 'High threshold should trigger forget');
      assert.strictEqual(resultLowThreshold, false, 'Low threshold should not trigger forget');
    });
  });

  describe('updateStabilityOnRecall', () => {
    test('successful recall increases stability', () => {
      const { updateStabilityOnRecall } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const newStability = updateStabilityOnRecall(memory, true);

      assert.ok(newStability > memory.S, 'Successful recall should increase stability');
    });

    test('failed recall decreases stability', () => {
      const { updateStabilityOnRecall } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 2.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const newStability = updateStabilityOnRecall(memory, false);

      assert.ok(newStability < memory.S, 'Failed recall should decrease stability');
    });

    test('high importance gives bonus', () => {
      const { updateStabilityOnRecall } = forgettingModule;

      const normalMemory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const importantMemory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.9, // High importance
        emotionalValence: 0,
      };

      const normalStability = updateStabilityOnRecall(normalMemory, true);
      const importantStability = updateStabilityOnRecall(importantMemory, true);

      assert.ok(importantStability > normalStability,
        'High importance should give stability bonus');
    });

    test('emotional valence gives bonus', () => {
      const { updateStabilityOnRecall } = forgettingModule;

      const neutralMemory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const emotionalMemory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0.8, // Strong positive emotion
      };

      const neutralStability = updateStabilityOnRecall(neutralMemory, true);
      const emotionalStability = updateStabilityOnRecall(emotionalMemory, true);

      assert.ok(emotionalStability > neutralStability,
        'High emotional valence should give stability bonus');
    });

    test('stability is capped at MAX_STABILITY', () => {
      const { updateStabilityOnRecall, FORGETTING_THRESHOLDS } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: FORGETTING_THRESHOLDS.MAX_STABILITY - 1, // Close to max
        lastAccessed: new Date(),
        importance: 0.9,
        emotionalValence: 0.9,
      };

      const newStability = updateStabilityOnRecall(memory, true);

      assert.ok(newStability <= FORGETTING_THRESHOLDS.MAX_STABILITY,
        'Stability should be capped at MAX_STABILITY');
    });
  });

  describe('calculateInitialParams', () => {
    test('returns valid params object', () => {
      const { calculateInitialParams } = forgettingModule;

      const params = calculateInitialParams({});

      assert.ok('R0' in params, 'Should have R0');
      assert.ok('S' in params, 'Should have S');
      assert.ok(params.R0 > 0, 'R0 should be positive');
      assert.ok(params.S > 0, 'S should be positive');
    });

    test('high importance increases R0', () => {
      const { calculateInitialParams } = forgettingModule;

      const lowImportance = calculateInitialParams({ importance: 0.1 });
      const highImportance = calculateInitialParams({ importance: 0.9 });

      assert.ok(highImportance.R0 >= lowImportance.R0,
        'Higher importance should increase R0');
    });
  });

  describe('calculateOptimalReviewTime', () => {
    test('returns positive value', () => {
      const { calculateOptimalReviewTime } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const reviewTime = calculateOptimalReviewTime(memory, 0.9);

      assert.ok(reviewTime >= 0, 'Review time should be non-negative');
    });

    test('lower target retention means longer interval', () => {
      const { calculateOptimalReviewTime } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const highRetention = calculateOptimalReviewTime(memory, 0.95);
      const lowRetention = calculateOptimalReviewTime(memory, 0.5);

      assert.ok(lowRetention > highRetention,
        'Lower target retention should mean longer interval');
    });
  });

  describe('getReviewSchedule', () => {
    test('returns array of review times', () => {
      const { getReviewSchedule } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const schedule = getReviewSchedule(memory, 0.9, 5);

      assert.ok(Array.isArray(schedule), 'Should return array');
      assert.strictEqual(schedule.length, 5, 'Should have 5 review times');
    });

    test('review intervals increase over time (spaced repetition)', () => {
      const { getReviewSchedule } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(),
        importance: 0.5,
        emotionalValence: 0,
      };

      const schedule = getReviewSchedule(memory, 0.9, 5);

      // Calculate intervals
      const intervals = schedule.map((t: number, i: number) => i === 0 ? t : t - schedule[i - 1]);

      // Intervals should generally increase
      for (let i = 1; i < intervals.length; i++) {
        assert.ok(intervals[i] >= intervals[i - 1] * 0.9,
          'Intervals should generally increase');
      }
    });
  });

  describe('getMemoriesToForget', () => {
    test('filters memories below threshold', () => {
      const { getMemoriesToForget } = forgettingModule;

      const memories = [
        {
          id: '1',
          R0: 1.0,
          S: 1.0,
          lastAccessed: new Date(), // Recent, keep
          importance: 0.5,
          emotionalValence: 0,
        },
        {
          id: '2',
          R0: 1.0,
          S: 0.1,
          lastAccessed: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Old, forget
          importance: 0.5,
          emotionalValence: 0,
        },
      ];

      const toForget = getMemoriesToForget(memories);

      assert.ok(toForget.some((m: any) => m.id === '2'), 'Old memory should be forgotten');
      assert.ok(!toForget.some((m: any) => m.id === '1'), 'Recent memory should be kept');
    });
  });

  describe('getRetentionDetails', () => {
    test('returns complete retention info', () => {
      const { getRetentionDetails } = forgettingModule;

      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        importance: 0.5,
        emotionalValence: 0,
      };

      const details = getRetentionDetails(memory);

      assert.ok('retention' in details, 'Should have retention');
      assert.ok('elapsedDays' in details, 'Should have elapsedDays');
      assert.ok('predictedHalfLife' in details, 'Should have predictedHalfLife');
      assert.ok('shouldForget' in details, 'Should have shouldForget');
    });

    test('elapsed days is calculated correctly', () => {
      const { getRetentionDetails } = forgettingModule;

      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const memory = {
        R0: 1.0,
        S: 1.0,
        lastAccessed: new Date(twoDaysAgo),
        importance: 0.5,
        emotionalValence: 0,
      };

      const details = getRetentionDetails(memory);

      assert.ok(Math.abs(details.elapsedDays - 2) < 0.01,
        `Elapsed days should be ~2, got ${details.elapsedDays}`);
    });
  });
});

// ============================================================================
// Episodic Store Tests
// ============================================================================

describe('Episodic Store', () => {
  let episodicModule: any;
  let EpisodicStore: any;

  beforeEach(async () => {
    episodicModule = await import('../src/memory/episodic.js');
    EpisodicStore = episodicModule.EpisodicStore;
  });

  describe('initialization', () => {
    test('creates store with default config', () => {
      const store = new EpisodicStore();
      assert.ok(store, 'Should create store');
    });

    test('creates store with custom config', () => {
      const store = new EpisodicStore({
        maxSize: 100,
        autoForget: false,
      });
      assert.ok(store, 'Should create with custom config');
    });

    test('initial stats show empty store', () => {
      const store = new EpisodicStore();
      const stats = store.stats();

      assert.strictEqual(stats.total, 0, 'Total should be 0');
    });
  });

  describe('createEpisode', () => {
    test('creates episode with required fields', () => {
      const store = new EpisodicStore();

      const episode = store.createEpisode({
        what: 'User asked about weather',
      });

      assert.ok(episode.id, 'Should have id');
      assert.ok(episode.created, 'Should have created date');
      assert.strictEqual(episode.type, 'episodic', 'Type should be episodic');
      assert.strictEqual(episode.content.what, 'User asked about weather', 'Content.what should match');
    });

    test('creates episode with all optional fields', () => {
      const store = new EpisodicStore();

      const episode = store.createEpisode({
        what: 'Complex interaction',
        details: { result: 'success' },
        when: new Date('2024-01-15'),
        duration: 5000,
        where: { location: 'terminal', context: 'development' },
        who: { agents: ['user', 'genesis'], roles: { genesis: 'assistant' } },
        feeling: { valence: 0.8, arousal: 0.5, label: 'satisfaction' },
        importance: 0.9,
        tags: ['test', 'important'],
        associations: ['previous-episode-id'],
        source: 'chat',
      });

      assert.ok(episode.where, 'Should have where');
      assert.ok(episode.who, 'Should have who');
      assert.ok(episode.feeling, 'Should have feeling');
      assert.strictEqual(episode.importance, 0.9, 'Importance should match');
      assert.deepStrictEqual(episode.tags, ['test', 'important'], 'Tags should match');
    });

    test('assigns initial forgetting params', () => {
      const store = new EpisodicStore();

      const episode = store.createEpisode({
        what: 'Test episode',
        importance: 0.8,
        feeling: { valence: 0.5, arousal: 0.3 },
      });

      assert.ok(episode.R0 > 0, 'Should have R0');
      assert.ok(episode.S > 0, 'Should have S');
    });
  });

  describe('get/update/delete', () => {
    test('get retrieves stored episode', () => {
      const store = new EpisodicStore();

      const stored = store.createEpisode({ what: 'Test' });
      const retrieved = store.get(stored.id);

      assert.ok(retrieved, 'Should retrieve episode');
      assert.strictEqual(retrieved?.content.what, 'Test', 'Content should match');
    });

    test('get updates access count', () => {
      const store = new EpisodicStore();

      const stored = store.createEpisode({ what: 'Test' });
      const initialCount = stored.accessCount;

      store.get(stored.id);
      store.get(stored.id);

      const retrieved = store.get(stored.id);
      assert.ok(retrieved!.accessCount > initialCount, 'Access count should increase');
    });

    test('get returns undefined for non-existent id', () => {
      const store = new EpisodicStore();

      const retrieved = store.get('non-existent-id');

      assert.strictEqual(retrieved, undefined, 'Should return undefined');
    });

    test('delete removes episode', () => {
      const store = new EpisodicStore();

      const stored = store.createEpisode({ what: 'Test' });
      const deleted = store.delete(stored.id);

      assert.strictEqual(deleted, true, 'Delete should return true');
      assert.strictEqual(store.get(stored.id), undefined, 'Episode should be gone');
    });

    test('delete returns false for non-existent id', () => {
      const store = new EpisodicStore();

      const deleted = store.delete('non-existent-id');

      assert.strictEqual(deleted, false, 'Delete should return false');
    });
  });

  describe('query', () => {
    test('query by tag', () => {
      const store = new EpisodicStore();

      store.createEpisode({ what: 'Episode 1', tags: ['important'] });
      store.createEpisode({ what: 'Episode 2', tags: ['test'] });
      store.createEpisode({ what: 'Episode 3', tags: ['important', 'test'] });

      const results = store.query({ tags: { $contains: 'important' } });

      // Episodes 1 and 3 have 'important' tag
      assert.ok(results.length >= 2, 'Should find at least 2 important episodes');
    });

    test('query by time range', () => {
      const store = new EpisodicStore();

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      store.createEpisode({ what: 'Recent', when: new Date() });
      store.createEpisode({ what: 'Yesterday', when: yesterday });
      store.createEpisode({ what: 'Old', when: twoDaysAgo });

      // This should find episodes after 30 hours ago
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const results = store.query({ created: { $gt: thirtyHoursAgo } });

      assert.ok(results.length >= 1, 'Should find at least 1 recent episode');
    });
  });

  describe('getRecent', () => {
    test('returns most recent episodes', () => {
      const store = new EpisodicStore();

      for (let i = 0; i < 5; i++) {
        store.createEpisode({ what: `Episode ${i}` });
      }

      const recent = store.getRecent(3);

      assert.strictEqual(recent.length, 3, 'Should return 3 episodes');
    });

    test('returns all if less than limit', () => {
      const store = new EpisodicStore();

      store.createEpisode({ what: 'Only one' });

      const recent = store.getRecent(10);

      assert.strictEqual(recent.length, 1, 'Should return 1 episode');
    });
  });

  describe('stats', () => {
    test('stats returns valid stats', () => {
      const store = new EpisodicStore();

      store.createEpisode({ what: 'Episode 1', importance: 0.8 });
      store.createEpisode({ what: 'Episode 2', importance: 0.5 });

      const stats = store.stats();

      assert.strictEqual(stats.total, 2, 'Total should be 2');
    });
  });
});

// ============================================================================
// Semantic Store Tests
// ============================================================================

describe('Semantic Store', () => {
  let semanticModule: any;
  let SemanticStore: any;

  beforeEach(async () => {
    semanticModule = await import('../src/memory/semantic.js');
    SemanticStore = semanticModule.SemanticStore;
  });

  describe('initialization', () => {
    test('creates store with default config', () => {
      const store = new SemanticStore();
      assert.ok(store, 'Should create store');
    });

    test('semantic memories have higher default stability', () => {
      const store = new SemanticStore();

      const fact = store.createFact({
        concept: 'Test Concept',
        category: 'testing',
      });

      // Semantic memories should have higher stability than episodic
      assert.ok(fact.S >= 10, 'Semantic stability should be high');
    });
  });

  describe('createFact', () => {
    test('creates fact with required fields', () => {
      const store = new SemanticStore();

      const fact = store.createFact({
        concept: 'TypeScript',
        category: 'programming-languages',
      });

      assert.ok(fact.id, 'Should have id');
      assert.strictEqual(fact.type, 'semantic', 'Type should be semantic');
      assert.strictEqual(fact.content.concept, 'TypeScript', 'Concept should match');
      assert.strictEqual(fact.category, 'programming-languages', 'Category should match');
    });

    test('creates fact with hierarchy', () => {
      const store = new SemanticStore();

      const fact = store.createFact({
        concept: 'Dog',
        category: 'animals',
        superordinates: ['Mammal', 'Animal'],
        subordinates: ['Poodle', 'Labrador'],
        related: ['Cat', 'Wolf'],
      });

      assert.deepStrictEqual(fact.superordinates, ['Mammal', 'Animal'], 'Superordinates should match');
      assert.deepStrictEqual(fact.subordinates, ['Poodle', 'Labrador'], 'Subordinates should match');
      assert.deepStrictEqual(fact.related, ['Cat', 'Wolf'], 'Related should match');
    });

    test('assigns default confidence', () => {
      const store = new SemanticStore();

      const fact = store.createFact({
        concept: 'Test',
        category: 'test',
      });

      assert.ok(fact.confidence >= 0.5, 'Default confidence should be reasonable');
      assert.ok(fact.confidence <= 1, 'Confidence should be <= 1');
    });
  });

  describe('concept deduplication', () => {
    test('merges duplicate concepts', () => {
      const store = new SemanticStore();

      const first = store.createFact({
        concept: 'JavaScript',
        category: 'programming',
        sources: ['MDN'],
      });

      const second = store.createFact({
        concept: 'JavaScript', // Same concept
        category: 'programming',
        sources: ['W3Schools'],
      });

      // Should be the same memory (merged)
      const stats = store.stats();
      assert.strictEqual(stats.total, 1, 'Should only have 1 memory');
    });

    test('case-insensitive concept matching', () => {
      const store = new SemanticStore();

      store.createFact({
        concept: 'React',
        category: 'frameworks',
      });

      store.createFact({
        concept: 'react', // Lowercase
        category: 'frameworks',
      });

      const stats = store.stats();
      assert.strictEqual(stats.total, 1, 'Should merge case-insensitive');
    });
  });

  describe('getByConcept', () => {
    test('retrieves by concept name', () => {
      const store = new SemanticStore();

      store.createFact({
        concept: 'Python',
        definition: 'A programming language',
        category: 'programming',
      });

      const retrieved = store.getByConcept('Python');

      assert.ok(retrieved, 'Should find concept');
      assert.strictEqual(retrieved?.content.definition, 'A programming language',
        'Definition should match');
    });

    test('returns undefined for unknown concept', () => {
      const store = new SemanticStore();

      const retrieved = store.getByConcept('NonExistent');

      assert.strictEqual(retrieved, undefined, 'Should return undefined');
    });
  });

  describe('getByCategory', () => {
    test('retrieves all in category', () => {
      const store = new SemanticStore();

      store.createFact({ concept: 'JavaScript', category: 'languages' });
      store.createFact({ concept: 'Python', category: 'languages' });
      store.createFact({ concept: 'React', category: 'frameworks' });

      const languages = store.getByCategory('languages');

      assert.strictEqual(languages.length, 2, 'Should find 2 languages');
    });
  });

  describe('getRelated', () => {
    test('finds related concepts', () => {
      const store = new SemanticStore();

      store.createFact({
        concept: 'Dog',
        category: 'animals',
        related: ['Cat', 'Wolf'],
      });

      store.createFact({
        concept: 'Cat',
        category: 'animals',
        related: ['Dog', 'Lion'],
      });

      const dogFact = store.getByConcept('Dog');
      assert.ok(dogFact?.related.includes('Cat'), 'Dog should be related to Cat');
    });
  });
});
