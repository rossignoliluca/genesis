/**
 * Code Validator for Bounty Submissions
 *
 * Pre-validates generated code before PR submission to avoid rejections.
 * Checks for common issues:
 * - Wrong programming language
 * - Placeholder/stub code
 * - Fake URLs
 * - Missing file modifications
 * - AI-generated patterns that look bad
 */

export interface ValidationResult {
  valid: boolean;
  score: number;  // 0-100
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  type: string;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  suggestion?: string;
}

export interface RepoContext {
  primaryLanguage: string;
  languages: string[];
  existingFiles: string[];
  targetFiles?: string[];  // Files mentioned in bounty
}

// Patterns that indicate placeholder/stub code
const PLACEHOLDER_PATTERNS = [
  /\/\/\s*(TODO|FIXME|XXX|HACK|PLACEHOLDER)/i,
  /\/\*\s*(TODO|FIXME|XXX|PLACEHOLDER)/i,
  /#\s*(TODO|FIXME|XXX|PLACEHOLDER)/i,
  /raise\s+NotImplementedError/,
  /throw\s+new\s+Error\(['"]not\s+implemented/i,
  /pass\s*#\s*placeholder/i,
  /console\.log\(['"]placeholder/i,
  /print\(['"]placeholder/i,
  /\.\.\.\s*\/\/\s*implementation/i,
  /function.*\{\s*\}/,  // Empty functions
  /def\s+\w+\([^)]*\):\s*\n\s*pass\s*$/m,  // Empty Python functions
];

// Fake/example URLs and domains
const FAKE_URL_PATTERNS = [
  /https?:\/\/(www\.)?example\.(com|org|net)/i,
  /https?:\/\/api\.example\./i,
  /https?:\/\/test\.example\./i,
  /https?:\/\/fake\./i,
  /https?:\/\/placeholder\./i,
  /https?:\/\/your-?api\./i,
  /https?:\/\/your-?domain\./i,
  /https?:\/\/localhost/,  // Warning, not error
  /API_KEY_HERE/,
  /YOUR_API_KEY/,
  /sk-xxx+/i,
  /token123/i,
];

// Language detection patterns
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  javascript: [
    /\brequire\s*\(/,
    /\bconst\s+\w+\s*=\s*require/,
    /\bmodule\.exports\b/,
    /\bexport\s+(default|const|function|class)\b/,
    /\bimport\s+.*\s+from\s+['"]/,
    /=>\s*\{/,  // Arrow functions
    /\.then\s*\(/,  // Promises
    /async\s+function/,
  ],
  typescript: [
    /:\s*(string|number|boolean|any|void)\b/,
    /interface\s+\w+\s*\{/,
    /type\s+\w+\s*=/,
    /<\w+>/,  // Generics
  ],
  python: [
    /^import\s+\w+/m,
    /^from\s+\w+\s+import/m,
    /def\s+\w+\s*\([^)]*\)\s*(->\s*\w+)?\s*:/,
    /class\s+\w+(\([^)]*\))?\s*:/,
    /if\s+__name__\s*==\s*['"]__main__['"]/,
    /@\w+(\([^)]*\))?\s*\n\s*def/,  // Decorators
  ],
  rust: [
    /fn\s+\w+\s*\([^)]*\)\s*(->.*?)?\s*\{/,
    /let\s+(mut\s+)?\w+/,
    /impl\s+\w+/,
    /pub\s+(fn|struct|enum)/,
    /use\s+\w+::/,
  ],
  go: [
    /^package\s+\w+/m,
    /func\s+\w+\s*\([^)]*\)/,
    /import\s+\(/,
    /:\s*=\s*/,  // Short variable declaration
  ],
};

/**
 * Detect the programming language of code
 */
export function detectLanguage(code: string): string[] {
  const detected: string[] = [];

  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    const matches = patterns.filter(p => p.test(code)).length;
    if (matches >= 2) {
      detected.push(lang);
    }
  }

  return detected;
}

/**
 * Validate code before submission
 */
export function validateCode(
  code: string,
  filename: string,
  context: RepoContext
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Check language match
  const detectedLangs = detectLanguage(code);
  const expectedLang = context.primaryLanguage.toLowerCase();

  const langMismatch = detectedLangs.length > 0 &&
    !detectedLangs.some(l =>
      l === expectedLang ||
      (l === 'typescript' && expectedLang === 'javascript') ||
      (l === 'javascript' && expectedLang === 'typescript')
    );

  if (langMismatch) {
    issues.push({
      type: 'wrong_language',
      message: `Code appears to be ${detectedLangs.join('/')} but repo uses ${context.primaryLanguage}`,
      severity: 'error',
      suggestion: `Rewrite the code in ${context.primaryLanguage}`,
    });
  }

  // 2. Check for placeholder code
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          type: 'placeholder_code',
          message: `Placeholder/stub code detected: "${line.trim().slice(0, 50)}..."`,
          severity: 'error',
          line: i + 1,
          suggestion: 'Implement the actual logic instead of leaving placeholders',
        });
        break;
      }
    }
  }

  // 3. Check for fake URLs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FAKE_URL_PATTERNS) {
      if (pattern.test(line)) {
        const isLocalhost = /localhost/.test(line);
        (isLocalhost ? warnings : issues).push({
          type: 'fake_url',
          message: `${isLocalhost ? 'Localhost' : 'Fake/example'} URL detected: "${line.trim().slice(0, 60)}..."`,
          severity: isLocalhost ? 'warning' : 'error',
          line: i + 1,
          suggestion: 'Use actual API endpoints or configuration variables',
        });
        break;
      }
    }
  }

  // 4. Check file extension matches language
  const ext = filename.split('.').pop()?.toLowerCase();
  const extLangMap: Record<string, string[]> = {
    'py': ['python'],
    'js': ['javascript'],
    'ts': ['typescript'],
    'jsx': ['javascript'],
    'tsx': ['typescript'],
    'rs': ['rust'],
    'go': ['go'],
  };

  if (ext && extLangMap[ext]) {
    const expectedForExt = extLangMap[ext];
    if (!expectedForExt.includes(expectedLang) && expectedLang !== 'typescript' && expectedLang !== 'javascript') {
      warnings.push({
        type: 'extension_mismatch',
        message: `File extension .${ext} doesn't match repo language ${context.primaryLanguage}`,
        severity: 'warning',
        suggestion: `Consider using a .${getExtensionForLanguage(expectedLang)} extension`,
      });
    }
  }

  // 5. Check if modifying existing files (if target files specified)
  if (context.targetFiles && context.targetFiles.length > 0) {
    const creatingNew = !context.existingFiles.some(f =>
      filename.endsWith(f) || f.endsWith(filename)
    );

    if (creatingNew) {
      warnings.push({
        type: 'new_file',
        message: `Creating new file instead of modifying existing ones`,
        severity: 'warning',
        suggestion: `Consider modifying: ${context.targetFiles.slice(0, 3).join(', ')}`,
      });
    }
  }

  // 6. Check for empty functions/methods
  const emptyFunctionPatterns = [
    /function\s+\w+\s*\([^)]*\)\s*\{\s*\}/g,
    /=>\s*\{\s*\}/g,
    /def\s+\w+\s*\([^)]*\)\s*:\s*\n\s*(pass|\.\.\.)\s*$/gm,
  ];

  for (const pattern of emptyFunctionPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      issues.push({
        type: 'empty_function',
        message: `Empty function detected: ${matches[0].slice(0, 40)}...`,
        severity: 'error',
        suggestion: 'Implement the function body',
      });
    }
  }

  // 7. Check code length (too short = likely incomplete)
  const nonEmptyLines = lines.filter(l => l.trim().length > 0).length;
  if (nonEmptyLines < 10) {
    warnings.push({
      type: 'too_short',
      message: `Code seems very short (${nonEmptyLines} lines)`,
      severity: 'warning',
      suggestion: 'Ensure the implementation is complete',
    });
  }

  // Calculate score
  const errorCount = issues.length;
  const warningCount = warnings.length;
  let score = 100 - (errorCount * 20) - (warningCount * 5);
  score = Math.max(0, Math.min(100, score));

  return {
    valid: issues.length === 0,
    score,
    issues,
    warnings,
  };
}

function getExtensionForLanguage(lang: string): string {
  const map: Record<string, string> = {
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    rust: 'rs',
    go: 'go',
    java: 'java',
    ruby: 'rb',
    php: 'php',
  };
  return map[lang.toLowerCase()] || lang;
}

/**
 * Format validation result for logging
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`Score: ${result.score}/100 - ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
  lines.push('');

  if (result.issues.length > 0) {
    lines.push('ERRORS:');
    for (const issue of result.issues) {
      lines.push(`  ❌ [${issue.type}] ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`     → ${issue.suggestion}`);
      }
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ [${warning.type}] ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`     → ${warning.suggestion}`);
      }
    }
  }

  return lines.join('\n');
}
