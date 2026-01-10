/**
 * Genesis Self-Healing Module
 *
 * Darwin-Gödel pattern for automatic error recovery:
 * - Detect errors from command output
 * - Generate fix candidates
 * - Evaluate and select best fix
 * - Apply and verify
 */

export * from './detector.js';
export * from './fixer.js';

// Re-export main functions for convenience
import { detectErrors, hasErrors, formatErrorReport, getErrorDetector } from './detector.js';
import { autoFix, generateFixes, getAutoFixer } from './fixer.js';

export const healing = {
  // Detection
  detectErrors,
  hasErrors,
  formatErrorReport,
  getDetector: getErrorDetector,

  // Fixing
  autoFix,
  generateFixes,
  getFixer: getAutoFixer,
};

export default healing;
