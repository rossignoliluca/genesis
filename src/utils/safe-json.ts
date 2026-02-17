/**
 * Safe JSON.parse that never throws.
 * Returns defaultValue on parse failure instead of crashing.
 */
export function safeJsonParse<T>(input: string, defaultValue: T): T {
  try {
    return JSON.parse(input) as T;
  } catch (err) {
    console.error('[SafeJson] safeJsonParse failed:', err);
    return defaultValue;
  }
}

/**
 * Safe JSON.parse that returns null on failure.
 */
export function tryJsonParse<T = unknown>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch (err) {
    console.error('[SafeJson] tryJsonParse failed:', err);
    return null;
  }
}
