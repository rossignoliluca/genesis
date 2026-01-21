/**
 * Genesis MCP Result Transformers
 *
 * Composable data transformations for MCP tool results.
 * Pipe-style API for chaining transformations.
 *
 * Features:
 * - Common transformers (extract, filter, map, reduce)
 * - Domain-specific transformers (papers, search, code)
 * - Type-safe pipeline composition
 * - Error handling in pipelines
 * - Custom transformer creation
 */

// ============================================================================
// Types
// ============================================================================

export type Transformer<TIn, TOut> = (input: TIn) => TOut;
export type AsyncTransformer<TIn, TOut> = (input: TIn) => Promise<TOut>;

export interface TransformPipeline<T> {
  // Apply transformer and return new pipeline
  pipe<TOut>(transformer: Transformer<T, TOut>): TransformPipeline<TOut>;
  pipeAsync<TOut>(transformer: AsyncTransformer<T, TOut>): AsyncTransformPipeline<TOut>;
  // Execute pipeline
  value(): T;
  // Execute with fallback on error
  valueOr<TDefault>(fallback: TDefault): T | TDefault;
}

export interface AsyncTransformPipeline<T> {
  pipe<TOut>(transformer: Transformer<T, TOut>): AsyncTransformPipeline<TOut>;
  pipeAsync<TOut>(transformer: AsyncTransformer<T, TOut>): AsyncTransformPipeline<TOut>;
  value(): Promise<T>;
  valueOr<TDefault>(fallback: TDefault): Promise<T | TDefault>;
}

// ============================================================================
// Pipeline Implementation
// ============================================================================

class SyncPipeline<T> implements TransformPipeline<T> {
  constructor(private data: T) {}

  pipe<TOut>(transformer: Transformer<T, TOut>): TransformPipeline<TOut> {
    return new SyncPipeline(transformer(this.data));
  }

  pipeAsync<TOut>(transformer: AsyncTransformer<T, TOut>): AsyncTransformPipeline<TOut> {
    return new AsyncPipelineImpl(Promise.resolve(this.data).then(transformer));
  }

  value(): T {
    return this.data;
  }

  valueOr<TDefault>(fallback: TDefault): T | TDefault {
    return this.data ?? fallback;
  }
}

class AsyncPipelineImpl<T> implements AsyncTransformPipeline<T> {
  constructor(private dataPromise: Promise<T>) {}

  pipe<TOut>(transformer: Transformer<T, TOut>): AsyncTransformPipeline<TOut> {
    return new AsyncPipelineImpl(this.dataPromise.then(transformer));
  }

  pipeAsync<TOut>(transformer: AsyncTransformer<T, TOut>): AsyncTransformPipeline<TOut> {
    return new AsyncPipelineImpl(this.dataPromise.then(transformer));
  }

  async value(): Promise<T> {
    return this.dataPromise;
  }

  async valueOr<TDefault>(fallback: TDefault): Promise<T | TDefault> {
    try {
      const result = await this.dataPromise;
      return result ?? fallback;
    } catch {
      return fallback;
    }
  }
}

export function transform<T>(data: T): TransformPipeline<T> {
  return new SyncPipeline(data);
}

export function transformAsync<T>(data: Promise<T>): AsyncTransformPipeline<T> {
  return new AsyncPipelineImpl(data);
}

// ============================================================================
// Common Transformers
// ============================================================================

/**
 * Extract a nested property by path
 */
export function extract<TIn, TOut = any>(path: string): Transformer<TIn, TOut | undefined> {
  return (input: TIn) => {
    const parts = path.split('.');
    let current: any = input;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current as TOut;
  };
}

/**
 * Filter an array
 */
export function filter<T>(predicate: (item: T, index: number) => boolean): Transformer<T[], T[]> {
  return (input: T[]) => (Array.isArray(input) ? input.filter(predicate) : []);
}

/**
 * Map over an array
 */
export function map<TIn, TOut>(mapper: (item: TIn, index: number) => TOut): Transformer<TIn[], TOut[]> {
  return (input: TIn[]) => (Array.isArray(input) ? input.map(mapper) : []);
}

/**
 * Reduce an array
 */
export function reduce<T, TOut>(
  reducer: (acc: TOut, item: T, index: number) => TOut,
  initial: TOut
): Transformer<T[], TOut> {
  return (input: T[]) => (Array.isArray(input) ? input.reduce(reducer, initial) : initial);
}

/**
 * Take first N items
 */
export function take<T>(n: number): Transformer<T[], T[]> {
  return (input: T[]) => (Array.isArray(input) ? input.slice(0, n) : []);
}

/**
 * Sort an array
 */
export function sort<T>(compareFn?: (a: T, b: T) => number): Transformer<T[], T[]> {
  return (input: T[]) => (Array.isArray(input) ? [...input].sort(compareFn) : []);
}

/**
 * Get unique items by key
 */
export function unique<T>(keyFn: (item: T) => any = (x) => x): Transformer<T[], T[]> {
  return (input: T[]) => {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    return input.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
}

/**
 * Group by key
 */
export function groupBy<T>(keyFn: (item: T) => string): Transformer<T[], Record<string, T[]>> {
  return (input: T[]) => {
    if (!Array.isArray(input)) return {};
    return input.reduce((acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };
}

/**
 * Default value if null/undefined
 */
export function defaultTo<T>(fallback: T): Transformer<T | null | undefined, T> {
  return (input: T | null | undefined) => input ?? fallback;
}

/**
 * Pluck a property from each item
 */
export function pluck<T, K extends keyof T>(key: K): Transformer<T[], T[K][]> {
  return (input: T[]) => (Array.isArray(input) ? input.map((item) => item[key]) : []);
}

/**
 * Flatten nested arrays
 */
export function flatten<T>(): Transformer<T[][], T[]> {
  return (input: T[][]) => (Array.isArray(input) ? input.flat() : []);
}

// ============================================================================
// Domain-Specific Transformers (MCP Results)
// ============================================================================

/**
 * Extract papers from arXiv/semantic-scholar results
 */
export function extractPapers(): Transformer<any, any[]> {
  return (input: any) => {
    if (!input) return [];
    return input.papers || input.results || input.data || [];
  };
}

/**
 * Extract search results from brave/exa/firecrawl
 */
export function extractSearchResults(): Transformer<any, any[]> {
  return (input: any) => {
    if (!input) return [];
    return (
      input.results ||
      input.web?.results ||
      input.data ||
      input.pages ||
      []
    );
  };
}

/**
 * Normalize search result to common format
 */
export interface NormalizedSearchResult {
  title: string;
  url: string;
  description: string;
  source: string;
}

export function normalizeSearchResult(): Transformer<any, NormalizedSearchResult> {
  return (input: any) => ({
    title: input.title || input.name || 'Untitled',
    url: input.url || input.link || input.href || '',
    description: input.description || input.snippet || input.abstract || '',
    source: input.source || input.domain || extractDomain(input.url || ''),
  });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Normalize paper to common format
 */
export interface NormalizedPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  year?: number;
  citations?: number;
}

export function normalizePaper(): Transformer<any, NormalizedPaper> {
  return (input: any) => ({
    id: input.id || input.paperId || input.arxivId || '',
    title: input.title || 'Untitled',
    authors: Array.isArray(input.authors)
      ? input.authors.map((a: any) => (typeof a === 'string' ? a : a.name || ''))
      : [],
    abstract: input.abstract || input.summary || '',
    url: input.url || input.link || `https://arxiv.org/abs/${input.id || ''}`,
    year: input.year || input.publicationDate?.split('-')[0],
    citations: input.citationCount || input.citations,
  });
}

/**
 * Filter by minimum citation count
 */
export function minCitations(min: number): Transformer<NormalizedPaper[], NormalizedPaper[]> {
  return filter((paper) => (paper.citations || 0) >= min);
}

/**
 * Sort papers by citations (descending)
 */
export function sortByCitations(): Transformer<NormalizedPaper[], NormalizedPaper[]> {
  return sort((a, b) => (b.citations || 0) - (a.citations || 0));
}

/**
 * Extract code from firecrawl/exa results
 */
export function extractCode(): Transformer<any, string[]> {
  return (input: any) => {
    const content = input.content || input.markdown || input.text || '';
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = content.match(codeBlockRegex) || [];
    return matches.map((block: string) => block.replace(/```\w*\n?/g, '').trim());
  };
}

/**
 * Extract URLs from content
 */
export function extractUrls(): Transformer<any, string[]> {
  return (input: any) => {
    const content = typeof input === 'string' ? input : JSON.stringify(input);
    const urlRegex = /https?:\/\/[^\s"'<>)]+/g;
    return content.match(urlRegex) || [];
  };
}

/**
 * Summarize content to max length
 */
export function summarize(maxLength: number): Transformer<string, string> {
  return (input: string) => {
    if (!input || input.length <= maxLength) return input || '';
    return input.slice(0, maxLength - 3) + '...';
  };
}

/**
 * Format as markdown list
 */
export function toMarkdownList(): Transformer<string[], string> {
  return (input: string[]) =>
    Array.isArray(input) ? input.map((item) => `- ${item}`).join('\n') : '';
}

/**
 * Format as numbered list
 */
export function toNumberedList(): Transformer<string[], string> {
  return (input: string[]) =>
    Array.isArray(input) ? input.map((item, i) => `${i + 1}. ${item}`).join('\n') : '';
}

// ============================================================================
// Transformer Composition
// ============================================================================

/**
 * Compose multiple transformers into one
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compose<TIn, TOut>(...transformers: Transformer<any, any>[]): Transformer<TIn, TOut> {
  return (input: TIn) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return transformers.reduce((acc, transformer) => transformer(acc), input as any) as TOut;
  };
}

/**
 * Create a transformer that tries multiple paths and returns first success
 */
export function tryPaths<TIn, TOut>(...paths: string[]): Transformer<TIn, TOut | undefined> {
  return (input: TIn) => {
    for (const path of paths) {
      const result = extract<TIn, TOut>(path)(input);
      if (result !== undefined) return result;
    }
    return undefined;
  };
}

/**
 * Conditional transformer
 */
export function when<T>(
  predicate: (input: T) => boolean,
  thenTransform: Transformer<T, T>,
  elseTransform?: Transformer<T, T>
): Transformer<T, T> {
  return (input: T) => {
    if (predicate(input)) {
      return thenTransform(input);
    }
    return elseTransform ? elseTransform(input) : input;
  };
}

// ============================================================================
// Prebuilt Pipelines
// ============================================================================

/**
 * Process arXiv search results into normalized papers
 */
export function processArxivResults(): Transformer<any, NormalizedPaper[]> {
  return compose(
    extractPapers(),
    map(normalizePaper()),
    sortByCitations()
  );
}

/**
 * Process web search results into normalized format
 */
export function processSearchResults(): Transformer<any, NormalizedSearchResult[]> {
  return compose(
    extractSearchResults(),
    map(normalizeSearchResult()),
    unique((r: NormalizedSearchResult) => r.url)
  );
}

/**
 * Extract and summarize key information
 */
export function extractKeyInfo(maxItems: number = 5): Transformer<any, string[]> {
  return compose(
    extractSearchResults(),
    map(normalizeSearchResult()),
    take(maxItems),
    map((r: NormalizedSearchResult) => `${r.title}: ${summarize(100)(r.description)}`)
  );
}
