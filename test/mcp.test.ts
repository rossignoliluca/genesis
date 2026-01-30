/**
 * MCP Module Tests
 *
 * Tests for MCP utilities:
 * - Cache (TTL, LRU, stats)
 * - Transformers (pipeline, common transforms)
 * - Tool chain composition
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// MCP Cache Tests
// ============================================================================

describe('MCP Cache', () => {
  let cacheModule: any;
  let MCPCache: any;

  beforeEach(async () => {
    cacheModule = await import('../dist/src/mcp/cache.js');
    MCPCache = cacheModule.MCPCache;
    // Reset singleton between tests
    cacheModule.resetMCPCache();
  });

  afterEach(() => {
    cacheModule.resetMCPCache();
  });

  describe('initialization', () => {
    test('creates cache with default config', () => {
      const cache = new MCPCache();
      assert.ok(cache, 'Should create cache');
    });

    test('creates cache with custom config', () => {
      const cache = new MCPCache({
        maxEntries: 100,
        maxSize: 1024 * 1024,
        defaultTTL: 60000,
      });
      assert.ok(cache, 'Should create with custom config');
    });

    test('initial stats are zero', () => {
      const cache = new MCPCache();
      const stats = cache.getStats();

      assert.strictEqual(stats.hits, 0, 'hits should be 0');
      assert.strictEqual(stats.misses, 0, 'misses should be 0');
      assert.strictEqual(stats.entries, 0, 'entries should be 0');
      assert.strictEqual(stats.totalSize, 0, 'totalSize should be 0');
      assert.strictEqual(stats.hitRate, 0, 'hitRate should be 0');
    });
  });

  describe('get/set operations', () => {
    test('set and get returns cached value', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000 }
      });

      const data = { test: 'value', nested: { a: 1 } };
      cache.set('memory', 'read_graph', { query: 'test' }, data);

      const result = cache.get('memory', 'read_graph', { query: 'test' });

      assert.ok(result, 'Should return cached entry');
      assert.deepStrictEqual(result.data, data, 'Data should match');
    });

    test('get returns null for non-existent key', () => {
      const cache = new MCPCache();

      const result = cache.get('memory', 'unknown_tool', { query: 'test' });

      assert.strictEqual(result, null, 'Should return null');
    });

    test('different params generate different cache keys', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000 }
      });

      cache.set('memory', 'search', { query: 'test1' }, { data: 1 });
      cache.set('memory', 'search', { query: 'test2' }, { data: 2 });

      const result1 = cache.get('memory', 'search', { query: 'test1' });
      const result2 = cache.get('memory', 'search', { query: 'test2' });

      assert.strictEqual(result1?.data.data, 1, 'First query should return 1');
      assert.strictEqual(result2?.data.data, 2, 'Second query should return 2');
    });

    test('same params generate same cache key', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000 }
      });

      cache.set('memory', 'search', { query: 'test', limit: 10 }, { data: 'original' });

      // Same params, different order - should hit cache with semantic keys
      const result = cache.get('memory', 'search', { limit: 10, query: 'test' });

      assert.ok(result, 'Should hit cache');
    });
  });

  describe('TTL expiration', () => {
    test('zero TTL servers do not cache', () => {
      const cache = new MCPCache(); // openai has TTL=0 by default

      cache.set('openai', 'chat', { prompt: 'test' }, { response: 'hello' });

      const result = cache.get('openai', 'chat', { prompt: 'test' });

      // TTL=0 means don't cache
      assert.strictEqual(result, null, 'Zero TTL should not cache');
    });

    test('expired entries return null', async () => {
      const cache = new MCPCache({
        serverTTL: { memory: 10 } // 10ms TTL
      });

      cache.set('memory', 'test', { a: 1 }, { data: 'test' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20));

      const result = cache.get('memory', 'test', { a: 1 });

      assert.strictEqual(result, null, 'Expired entry should return null');
    });
  });

  describe('statistics', () => {
    test('hits and misses are tracked', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000 }
      });

      cache.set('memory', 'test', { q: 1 }, { data: 'test' });

      // Hit
      cache.get('memory', 'test', { q: 1 });

      // Miss
      cache.get('memory', 'test', { q: 2 });
      cache.get('memory', 'unknown', { q: 1 });

      const stats = cache.getStats();

      assert.strictEqual(stats.hits, 1, 'Should have 1 hit');
      assert.strictEqual(stats.misses, 2, 'Should have 2 misses');
      assert.ok(stats.hitRate > 0, 'Hit rate should be positive');
      assert.ok(stats.hitRate < 1, 'Hit rate should be less than 1');
    });

    test('entries count is accurate', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000, github: 60000 }
      });

      cache.set('memory', 'a', { x: 1 }, { data: 1 });
      cache.set('memory', 'b', { x: 2 }, { data: 2 });
      cache.set('github', 'c', { x: 3 }, { data: 3 });

      const stats = cache.getStats();

      assert.strictEqual(stats.entries, 3, 'Should have 3 entries');
    });

    test('per-server stats are tracked', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000, github: 60000 }
      });

      cache.set('memory', 'a', { x: 1 }, { data: 1 });
      cache.get('memory', 'a', { x: 1 }); // hit
      cache.get('memory', 'a', { x: 2 }); // miss

      cache.set('github', 'b', { y: 1 }, { data: 2 });
      cache.get('github', 'b', { y: 1 }); // hit

      const stats = cache.getStats();

      assert.strictEqual(stats.byServer.memory?.hits, 1, 'Memory should have 1 hit');
      assert.strictEqual(stats.byServer.memory?.misses, 1, 'Memory should have 1 miss');
      assert.strictEqual(stats.byServer.github?.hits, 1, 'GitHub should have 1 hit');
    });
  });

  describe('LRU eviction', () => {
    test('evicts oldest when maxEntries reached', () => {
      const cache = new MCPCache({
        maxEntries: 3,
        serverTTL: { memory: 60000 }
      });

      // Add 3 entries
      cache.set('memory', 'a', { x: 1 }, { data: 'a' });
      cache.set('memory', 'b', { x: 2 }, { data: 'b' });
      cache.set('memory', 'c', { x: 3 }, { data: 'c' });

      // Access 'a' to make it recently used
      cache.get('memory', 'a', { x: 1 });

      // Add 4th entry - should evict 'b' (oldest not recently accessed)
      cache.set('memory', 'd', { x: 4 }, { data: 'd' });

      const stats = cache.getStats();
      assert.ok(stats.entries <= 3, 'Should not exceed maxEntries');
    });
  });

  describe('invalidation', () => {
    test('invalidate by server', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000, github: 60000 }
      });

      cache.set('memory', 'a', { x: 1 }, { data: 1 });
      cache.set('memory', 'b', { x: 2 }, { data: 2 });
      cache.set('github', 'c', { x: 3 }, { data: 3 });

      const invalidated = cache.invalidate({ server: 'memory' });

      assert.strictEqual(invalidated, 2, 'Should invalidate 2 memory entries');

      // Memory should be gone
      assert.strictEqual(cache.get('memory', 'a', { x: 1 }), null);
      assert.strictEqual(cache.get('memory', 'b', { x: 2 }), null);

      // GitHub should remain
      assert.ok(cache.get('github', 'c', { x: 3 }), 'GitHub should still exist');
    });

    test('clear removes all entries', () => {
      const cache = new MCPCache({
        serverTTL: { memory: 60000, github: 60000 }
      });

      cache.set('memory', 'a', { x: 1 }, { data: 1 });
      cache.set('github', 'b', { x: 2 }, { data: 2 });

      cache.clear();

      const stats = cache.getStats();
      assert.strictEqual(stats.entries, 0, 'Should have 0 entries');
      assert.strictEqual(stats.hits, 0, 'Should reset hits');
      assert.strictEqual(stats.misses, 0, 'Should reset misses');
    });
  });

  describe('singleton', () => {
    test('getMCPCache returns same instance', () => {
      const cache1 = cacheModule.getMCPCache();
      const cache2 = cacheModule.getMCPCache();

      assert.strictEqual(cache1, cache2, 'Should be same instance');
    });

    test('resetMCPCache creates new instance', () => {
      const cache1 = cacheModule.getMCPCache();
      cache1.set('memory', 'test', { x: 1 }, { data: 'test' });

      cacheModule.resetMCPCache();

      const cache2 = cacheModule.getMCPCache();
      const result = cache2.get('memory', 'test', { x: 1 });

      assert.strictEqual(result, null, 'New cache should be empty');
    });
  });
});

// ============================================================================
// MCP Transformers Tests
// ============================================================================

describe('MCP Transformers', () => {
  let transformersModule: any;

  beforeEach(async () => {
    transformersModule = await import('../dist/src/mcp/transformers.js');
  });

  describe('transform pipeline', () => {
    test('basic pipe chain works', () => {
      const { transform } = transformersModule;

      const result = transform(10)
        .pipe((x: number) => x * 2)
        .pipe((x: number) => x + 5)
        .value();

      assert.strictEqual(result, 25, '10 * 2 + 5 = 25');
    });

    test('valueOr provides fallback', () => {
      const { transform } = transformersModule;

      const result = transform(null as any)
        .pipe((x: any) => x?.value)
        .valueOr('fallback');

      assert.strictEqual(result, 'fallback', 'Should return fallback');
    });

    test('async pipeline works', async () => {
      const { transformAsync } = transformersModule;

      const result = await transformAsync(Promise.resolve(5))
        .pipe((x: number) => x * 3)
        .pipeAsync(async (x: number) => x + 1)
        .value();

      assert.strictEqual(result, 16, '5 * 3 + 1 = 16');
    });
  });

  describe('extract transformer', () => {
    test('extracts nested property', () => {
      const { extract } = transformersModule;

      const data = { a: { b: { c: 42 } } };
      const result = extract('a.b.c')(data);

      assert.strictEqual(result, 42, 'Should extract nested value');
    });

    test('returns undefined for missing path', () => {
      const { extract } = transformersModule;

      const data = { a: { b: 1 } };
      const result = extract('a.b.c.d')(data);

      assert.strictEqual(result, undefined, 'Should return undefined');
    });
  });

  describe('filter transformer', () => {
    test('filters array', () => {
      const { filter } = transformersModule;

      const data = [1, 2, 3, 4, 5];
      const result = filter((x: number) => x > 2)(data);

      assert.deepStrictEqual(result, [3, 4, 5], 'Should filter values > 2');
    });

    test('returns empty for non-array', () => {
      const { filter } = transformersModule;

      const result = filter((x: any) => x)(null);

      assert.deepStrictEqual(result, [], 'Should return empty array');
    });
  });

  describe('map transformer', () => {
    test('maps array', () => {
      const { map } = transformersModule;

      const data = [1, 2, 3];
      const result = map((x: number) => x * 2)(data);

      assert.deepStrictEqual(result, [2, 4, 6], 'Should double values');
    });

    test('includes index in mapper', () => {
      const { map } = transformersModule;

      const data = ['a', 'b', 'c'];
      const result = map((x: string, i: number) => `${i}:${x}`)(data);

      assert.deepStrictEqual(result, ['0:a', '1:b', '2:c'], 'Should include index');
    });
  });

  describe('reduce transformer', () => {
    test('reduces to single value', () => {
      const { reduce } = transformersModule;

      const data = [1, 2, 3, 4];
      const result = reduce((acc: number, x: number) => acc + x, 0)(data);

      assert.strictEqual(result, 10, '1+2+3+4 = 10');
    });

    test('returns initial for non-array', () => {
      const { reduce } = transformersModule;

      const result = reduce((acc: any, x: any) => acc, 'initial')(null);

      assert.strictEqual(result, 'initial', 'Should return initial value');
    });
  });

  describe('take transformer', () => {
    test('takes first N items', () => {
      const { take } = transformersModule;

      const data = [1, 2, 3, 4, 5];
      const result = take(3)(data);

      assert.deepStrictEqual(result, [1, 2, 3], 'Should take first 3');
    });

    test('takes all if N > length', () => {
      const { take } = transformersModule;

      const data = [1, 2];
      const result = take(10)(data);

      assert.deepStrictEqual(result, [1, 2], 'Should take all available');
    });
  });

  describe('unique transformer', () => {
    test('removes duplicates', () => {
      const { unique } = transformersModule;

      const data = [1, 2, 2, 3, 3, 3];
      const result = unique()(data);

      assert.deepStrictEqual(result, [1, 2, 3], 'Should remove duplicates');
    });

    test('removes duplicates by key function', () => {
      const { unique } = transformersModule;

      const data = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' }, // duplicate id
      ];
      const result = unique((x: any) => x.id)(data);

      assert.strictEqual(result.length, 2, 'Should have 2 unique items');
      assert.deepStrictEqual(result.map((x: any) => x.id), [1, 2], 'IDs should be unique');
    });
  });

  describe('groupBy transformer', () => {
    test('groups by key', () => {
      const { groupBy } = transformersModule;

      const data = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      const result = groupBy((x: any) => x.type)(data);

      assert.deepStrictEqual(Object.keys(result).sort(), ['a', 'b'], 'Should have groups a and b');
      assert.strictEqual(result.a.length, 2, 'Group a should have 2 items');
      assert.strictEqual(result.b.length, 1, 'Group b should have 1 item');
    });
  });

  describe('sort transformer', () => {
    test('sorts ascending by default', () => {
      const { sort } = transformersModule;

      const data = [3, 1, 4, 1, 5, 9];
      const result = sort()(data);

      assert.deepStrictEqual(result, [1, 1, 3, 4, 5, 9], 'Should sort ascending');
    });

    test('sorts with custom comparator', () => {
      const { sort } = transformersModule;

      const data = [1, 5, 3];
      const result = sort((a: number, b: number) => b - a)(data);

      assert.deepStrictEqual(result, [5, 3, 1], 'Should sort descending');
    });

    test('does not mutate original', () => {
      const { sort } = transformersModule;

      const data = [3, 1, 2];
      const result = sort()(data);

      assert.deepStrictEqual(data, [3, 1, 2], 'Original should be unchanged');
      assert.deepStrictEqual(result, [1, 2, 3], 'Result should be sorted');
    });
  });

  describe('pluck transformer', () => {
    test('extracts property from each item', () => {
      const { pluck } = transformersModule;

      const data = [
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
      ];
      const result = pluck('name')(data);

      assert.deepStrictEqual(result, ['a', 'b'], 'Should extract names');
    });
  });

  describe('flatten transformer', () => {
    test('flattens nested arrays', () => {
      const { flatten } = transformersModule;

      const data = [[1, 2], [3], [4, 5, 6]];
      const result = flatten()(data);

      assert.deepStrictEqual(result, [1, 2, 3, 4, 5, 6], 'Should flatten');
    });
  });

  describe('defaultTo transformer', () => {
    test('returns value if not null/undefined', () => {
      const { defaultTo } = transformersModule;

      const result = defaultTo('default')('value');

      assert.strictEqual(result, 'value', 'Should return original value');
    });

    test('returns default for null', () => {
      const { defaultTo } = transformersModule;

      const result = defaultTo('default')(null);

      assert.strictEqual(result, 'default', 'Should return default');
    });

    test('returns default for undefined', () => {
      const { defaultTo } = transformersModule;

      const result = defaultTo('default')(undefined);

      assert.strictEqual(result, 'default', 'Should return default');
    });
  });

  describe('compose transformer', () => {
    test('composes multiple transformers', () => {
      const { compose, filter, map, take } = transformersModule;

      const pipeline = compose(
        filter((x: number) => x % 2 === 0), // evens
        map((x: number) => x * 10),         // * 10
        take(2)                              // first 2
      );

      const data = [1, 2, 3, 4, 5, 6];
      const result = pipeline(data);

      assert.deepStrictEqual(result, [20, 40], 'Should compose correctly');
    });
  });

  describe('domain transformers', () => {
    test('extractSearchResults handles various formats', () => {
      const { extractSearchResults } = transformersModule;

      const formats = [
        { results: [1, 2] },
        { web: { results: [3, 4] } },
        { data: [5, 6] },
        { pages: [7, 8] },
      ];

      for (const format of formats) {
        const result = extractSearchResults()(format);
        assert.ok(Array.isArray(result), 'Should return array');
        assert.ok(result.length > 0, 'Should have results');
      }
    });

    test('extractPapers handles various formats', () => {
      const { extractPapers } = transformersModule;

      const formats = [
        { papers: [{ title: 'a' }] },
        { results: [{ title: 'b' }] },
        { data: [{ title: 'c' }] },
      ];

      for (const format of formats) {
        const result = extractPapers()(format);
        assert.ok(Array.isArray(result), 'Should return array');
        assert.ok(result.length > 0, 'Should have papers');
      }
    });

    test('normalizeSearchResult creates consistent format', () => {
      const { normalizeSearchResult } = transformersModule;

      const input = {
        title: 'Test Title',
        link: 'https://example.com',
        snippet: 'A test snippet',
      };

      const result = normalizeSearchResult()(input);

      assert.strictEqual(result.title, 'Test Title', 'Should have title');
      assert.strictEqual(result.url, 'https://example.com', 'Should have url');
      assert.strictEqual(result.description, 'A test snippet', 'Should have description');
    });

    test('normalizePaper creates consistent format', () => {
      const { normalizePaper } = transformersModule;

      const input = {
        paperId: '12345',
        title: 'AI Paper',
        authors: [{ name: 'John' }, { name: 'Jane' }],
        abstract: 'About AI',
        citationCount: 100,
      };

      const result = normalizePaper()(input);

      assert.strictEqual(result.id, '12345', 'Should have id');
      assert.strictEqual(result.title, 'AI Paper', 'Should have title');
      assert.deepStrictEqual(result.authors, ['John', 'Jane'], 'Should have authors');
      assert.strictEqual(result.abstract, 'About AI', 'Should have abstract');
      assert.strictEqual(result.citations, 100, 'Should have citations');
    });

    test('summarize truncates long text', () => {
      const { summarize } = transformersModule;

      const longText = 'a'.repeat(100);
      const result = summarize(20)(longText);

      assert.ok(result.length <= 20, 'Should be <= maxLength');
      assert.ok(result.endsWith('...'), 'Should end with ellipsis');
    });

    test('summarize leaves short text unchanged', () => {
      const { summarize } = transformersModule;

      const shortText = 'short';
      const result = summarize(20)(shortText);

      assert.strictEqual(result, shortText, 'Should not change short text');
    });

    test('extractUrls finds URLs in text', () => {
      const { extractUrls } = transformersModule;

      const text = 'Check out https://example.com and http://test.org for more info';
      const result = extractUrls()(text);

      assert.ok(result.includes('https://example.com'), 'Should find https URL');
      assert.ok(result.includes('http://test.org'), 'Should find http URL');
    });

    test('extractCode finds code blocks', () => {
      const { extractCode } = transformersModule;

      const content = {
        markdown: 'Here is code:\n```javascript\nconst x = 1;\n```\nMore text\n```python\nprint("hi")\n```'
      };

      const result = extractCode()(content);

      assert.strictEqual(result.length, 2, 'Should find 2 code blocks');
      assert.ok(result[0].includes('const x = 1'), 'Should extract JS code');
      assert.ok(result[1].includes('print'), 'Should extract Python code');
    });

    test('toMarkdownList formats as markdown', () => {
      const { toMarkdownList } = transformersModule;

      const items = ['First', 'Second', 'Third'];
      const result = toMarkdownList()(items);

      assert.ok(result.includes('- First'), 'Should have markdown bullet');
      assert.ok(result.includes('- Second'), 'Should have markdown bullet');
      assert.strictEqual(result.split('\n').length, 3, 'Should have 3 lines');
    });

    test('toNumberedList formats with numbers', () => {
      const { toNumberedList } = transformersModule;

      const items = ['First', 'Second'];
      const result = toNumberedList()(items);

      assert.ok(result.includes('1. First'), 'Should have numbered item');
      assert.ok(result.includes('2. Second'), 'Should have numbered item');
    });
  });

  describe('when conditional transformer', () => {
    test('applies thenTransform when predicate is true', () => {
      const { when } = transformersModule;

      const transformer = when(
        (x: number) => x > 5,
        (x: number) => x * 2,
        (x: number) => x
      );

      assert.strictEqual(transformer(10), 20, 'Should apply thenTransform');
    });

    test('applies elseTransform when predicate is false', () => {
      const { when } = transformersModule;

      const transformer = when(
        (x: number) => x > 5,
        (x: number) => x * 2,
        (x: number) => x + 1
      );

      assert.strictEqual(transformer(3), 4, 'Should apply elseTransform');
    });

    test('returns input when no elseTransform', () => {
      const { when } = transformersModule;

      const transformer = when(
        (x: number) => x > 5,
        (x: number) => x * 2
      );

      assert.strictEqual(transformer(3), 3, 'Should return original');
    });
  });

  describe('tryPaths transformer', () => {
    test('returns first matching path', () => {
      const { tryPaths } = transformersModule;

      const data = { a: null, b: { c: 'found' } };
      const result = tryPaths('a.x', 'b.c', 'd.e')(data);

      assert.strictEqual(result, 'found', 'Should find b.c');
    });

    test('returns undefined when no path matches', () => {
      const { tryPaths } = transformersModule;

      const data = { a: 1 };
      const result = tryPaths('x', 'y', 'z')(data);

      assert.strictEqual(result, undefined, 'Should return undefined');
    });
  });

  describe('prebuilt pipelines', () => {
    test('processArxivResults normalizes papers', () => {
      const { processArxivResults } = transformersModule;

      const data = {
        papers: [
          { id: '1', title: 'Paper A', citationCount: 50 },
          { id: '2', title: 'Paper B', citationCount: 100 },
        ]
      };

      const result = processArxivResults()(data);

      assert.strictEqual(result.length, 2, 'Should have 2 papers');
      // Should be sorted by citations (descending)
      assert.strictEqual(result[0].title, 'Paper B', 'Most cited should be first');
    });

    test('processSearchResults normalizes and dedupes', () => {
      const { processSearchResults } = transformersModule;

      const data = {
        results: [
          { title: 'A', url: 'http://a.com' },
          { title: 'B', url: 'http://b.com' },
          { title: 'A dupe', url: 'http://a.com' }, // duplicate URL
        ]
      };

      const result = processSearchResults()(data);

      assert.strictEqual(result.length, 2, 'Should dedupe by URL');
    });
  });
});
