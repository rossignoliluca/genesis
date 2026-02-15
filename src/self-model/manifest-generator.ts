/**
 * Manifest Generator — Auto-discovers all modules in src/
 *
 * Scans filesystem to build module manifest without hardcoded lists.
 * Fast (~200ms) discovery with static analysis.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { ModuleManifestEntry } from './types.js';

// Use __dirname for path resolution (CommonJS pattern works in NodeNext)
const __dirname = resolve(__filename, '..');

// ============================================================================
// Bus Topic Mapping
// ============================================================================

const BUS_PREFIX_MAP: Record<string, string[]> = {
  kernel: ['kernel.'],
  consciousness: ['consciousness.'],
  'active-inference': ['active-inference.', 'inference.'],
  neuromodulation: ['neuromod.'],
  nociception: ['pain.'],
  allostasis: ['allostasis.'],
  economy: ['economy.'],
  brain: ['brain.'],
  memory: ['memory.'],
  'world-model': ['worldmodel.'],
  daemon: ['daemon.'],
  'self-modification': ['self.'],
  semiotics: ['semiotics.'],
  umwelt: ['umwelt.'],
  morphogenetic: ['morphogenetic.'],
  'strange-loop': ['strange-loop.'],
  'second-order': ['second-order.'],
  rsi: ['rsi.'],
  autopoiesis: ['autopoiesis.'],
  swarm: ['swarm.'],
  symbiotic: ['symbiotic.'],
  embodiment: ['embodiment.'],
  finance: ['finance.'],
  polymarket: ['polymarket.'],
  revenue: ['revenue.'],
  content: ['content.'],
  'market-strategist': ['strategy.'],
  cli: ['cli.'],
  'horizon-scanner': ['horizon.'],
  antifragile: ['antifragile.'],
  'tool-factory': ['toolfactory.'],
  payments: ['x402.'],
};

// ============================================================================
// Manifest Generator
// ============================================================================

export class ManifestGenerator {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Quick scan: just return module directory names
   */
  quickScan(): string[] {
    const srcPath = join(this.rootPath, 'src');
    if (!existsSync(srcPath)) return [];

    return readdirSync(srcPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .filter((name) => !name.startsWith('.'));
  }

  /**
   * Full scan: build complete manifest entries
   */
  generate(): ModuleManifestEntry[] {
    const srcPath = join(this.rootPath, 'src');
    if (!existsSync(srcPath)) return [];

    const modules: ModuleManifestEntry[] = [];

    const dirs = readdirSync(srcPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .filter((dirent) => !dirent.name.startsWith('.'));

    for (const dir of dirs) {
      const modulePath = join(srcPath, dir.name);
      const entry = this.analyzeModule(dir.name, modulePath);
      modules.push(entry);
    }

    return modules;
  }

  private analyzeModule(name: string, modulePath: string): ModuleManifestEntry {
    // Count .ts files (exclude tests and declarations)
    const tsFiles = this.getTsFiles(modulePath);
    const fileCount = tsFiles.length;

    // Sum file sizes
    let totalSize = 0;
    for (const file of tsFiles) {
      try {
        const stats = statSync(file);
        totalSize += stats.size;
      } catch {
        // Skip if file can't be read
      }
    }

    // Check for index.ts
    const indexPath = join(modulePath, 'index.ts');
    const hasIndex = existsSync(indexPath);

    // Extract description and exports from index.ts
    let description = '';
    let exports: string[] = [];
    if (hasIndex) {
      const result = this.analyzeIndexFile(indexPath);
      description = result.description;
      exports = result.exports;
    }

    // Detect dependencies from imports
    const dependencies = this.findDependencies(tsFiles);

    // Match bus topics
    const busTopics = BUS_PREFIX_MAP[name] || [];

    return {
      name,
      path: `src/${name}`,
      fileCount,
      totalSize,
      hasIndex,
      description,
      exports,
      dependencies,
      busTopics,
    };
  }

  private getTsFiles(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          files.push(...this.getTsFiles(fullPath));
        } else if (entry.isFile()) {
          // Include .ts files, exclude tests and declarations
          if (
            entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.test.ts') &&
            !entry.name.endsWith('.d.ts')
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return files;
  }

  private analyzeIndexFile(indexPath: string): {
    description: string;
    exports: string[];
  } {
    let description = '';
    const exports: string[] = [];

    try {
      const content = readFileSync(indexPath, 'utf-8');

      // Extract first docstring (/** ... */)
      const docstringMatch = content.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
      if (docstringMatch) {
        // Clean up docstring: remove * prefixes and extra whitespace
        description = docstringMatch[1]
          .split('\n')
          .map((line) => line.replace(/^\s*\*\s?/, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Extract exports (limit to 20)
      const exportRegex =
        /export\s+(const|function|class|interface|type|enum)\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null && exports.length < 20) {
        exports.push(match[2]);
      }
    } catch {
      // Skip if file can't be read
    }

    return { description, exports };
  }

  private findDependencies(tsFiles: string[]): string[] {
    const deps = new Set<string>();

    for (const file of tsFiles) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n').slice(0, 30); // Only read first 30 lines

        for (const line of lines) {
          // Match: from '../module-name'
          const importMatch = line.match(/from\s+['"]\.\.\/([^'"\/]+)['"]/);
          if (importMatch) {
            deps.add(importMatch[1]);
          }
        }
      } catch {
        // Skip files we can't read
      }
    }

    return Array.from(deps).sort();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let singleton: ManifestGenerator | null = null;

export function getManifestGenerator(rootPath?: string): ManifestGenerator {
  if (!singleton) {
    const resolvedPath = rootPath || resolve(__dirname, '../..');
    singleton = new ManifestGenerator(resolvedPath);
  }
  return singleton;
}
