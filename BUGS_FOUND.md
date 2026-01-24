# Genesis Chat System - Bug Report

**Date:** 2026-01-22
**Version:** 10.4.0
**Reporter:** Claude Code Testing

---

## 🔴 CRITICAL BUG #1: Process Hangs with Piped Stdin

**Priority:** CRITICAL
**Status:** Open
**Severity:** High

### Description
When the chat is started with piped stdin input containing a message before `/exit`, the Node.js process hangs indefinitely and never exits.

### Reproduction Steps
```bash
cd /Users/lucarossignoli/genesis
echo -e "Hello\n/exit" | node dist/src/index.js chat --no-brain
# Process hangs indefinitely
```

### Expected Behavior
- Process should send "Hello" to LLM
- Receive response
- Process `/exit` command
- Clean up and exit with code 0

### Actual Behavior
- Process starts
- Shows loading animation
- Never completes LLM call
- Never exits
- Becomes zombie process

### Evidence
Multiple hanging processes found:
```bash
ps aux | grep "node dist/src/index.js"

lucarossignoli   86219  node dist/src/index.js chat --no-brain
lucarossignoli   83300  node dist/src/index.js chat --no-brain
lucarossignoli   76492  node dist/src/index.js chat --no-brain
```

### Impact
- ❌ Prevents automated testing
- ❌ Blocks CI/CD pipelines
- ❌ Makes headless mode unreliable
- ❌ Creates zombie processes
- ❌ Wastes system resources

### Root Cause Analysis
The interactive loop waits for LLM response but doesn't detect that stdin has been closed. When stdin is a pipe that closes, the process should:
1. Detect stdin EOF
2. Either cancel pending operations or wait with timeout
3. Clean up gracefully
4. Exit

### Affected Files
- `/Users/lucarossignoli/genesis/src/cli/interactive.ts` (lines ~160-180)
- `/Users/lucarossignoli/genesis/src/cli/chat.ts`
- `/Users/lucarossignoli/genesis/src/cli/human-loop.ts`

### Suggested Fix

**Option 1: Detect stdin close**
```typescript
// In interactive.ts or human-loop.ts
process.stdin.on('end', () => {
  console.log('Stdin closed, exiting...');
  this.stop();
});
```

**Option 2: Add timeout for piped mode**
```typescript
// Detect if stdin is a pipe
const isStdinPipe = !process.stdin.isTTY;

if (isStdinPipe) {
  // Set timeout for LLM responses
  const timeout = setTimeout(() => {
    console.error('Timeout waiting for response');
    this.stop();
  }, 30000); // 30 second timeout
}
```

**Option 3: Graceful shutdown on signals**
```typescript
process.on('SIGINT', () => this.stop());
process.on('SIGTERM', () => this.stop());
```

### Workaround
Use only `/exit` without sending messages:
```bash
echo "/exit" | node dist/src/index.js chat --no-brain
# This works fine
```

---

## 🟡 MEDIUM BUG #2: ERR_USE_AFTER_CLOSE Error on Exit

**Priority:** Medium
**Status:** Open
**Severity:** Low (Cosmetic)

### Description
Occasionally when exiting with `/exit` or `/quit`, an error message appears even though the exit is successful.

### Reproduction Steps
```bash
echo "/exit" | node dist/src/index.js chat --no-brain
# Sometimes shows error, sometimes doesn't
```

### Expected Behavior
```
Stopping brain...
Saving state...
Session saved: 8b725f3a
Goodbye! Genesis signing off.
```

### Actual Behavior
```
Stopping brain...
Saving state...
Session saved: 8b725f3a
Goodbye! Genesis signing off.

Error: Error [ERR_USE_AFTER_CLOSE]: readline was closed
```

### Impact
- ⚠️ Poor user experience
- ⚠️ Looks unprofessional
- ⚠️ May alarm users
- ✅ Doesn't break functionality

### Root Cause
The error is caught and handled in `interactive.ts:175-178`:
```typescript
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
    break; // readline closed
  }
  console.error(c(`Error: ${error}`, 'red'));
}
```

However, the error is still being logged somewhere else in the code, possibly by an event handler or uncaught exception handler.

### Affected Files
- `/Users/lucarossignoli/genesis/src/cli/interactive.ts:175-178`
- Possibly global error handlers

### Suggested Fix

**Option 1: Silent break (already implemented but error still shows)**
The current code tries to handle this silently but fails. Need to find where else the error is logged.

**Option 2: Suppress specific error globally**
```typescript
process.on('uncaughtException', (error) => {
  if (error.code === 'ERR_USE_AFTER_CLOSE') {
    // Silent - this is expected during shutdown
    return;
  }
  console.error('Uncaught exception:', error);
  process.exit(1);
});
```

**Option 3: Better readline cleanup**
```typescript
stop(): void {
  this.running = false;
  this.stopSpinner();

  // Close readline BEFORE other cleanup
  if (this.rl) {
    this.rl.removeAllListeners(); // Remove listeners first
    this.rl.close();
    this.rl = null;
  }

  // Then do other cleanup
  this.store.updateConversation(this.llm.getHistory());
  this.store.close();

  console.log(c('Goodbye!\n', 'cyan'));
  process.exit(0);
}
```

### Workaround
Ignore the error message - it's cosmetic and doesn't affect functionality.

---

## 🟡 MEDIUM BUG #3: Mixed Language UI (Italian/English)

**Priority:** Medium
**Status:** Open
**Severity:** Medium (UX Issue)

### Description
The chat interface inconsistently uses both Italian and English text, creating a confusing user experience.

### Examples

**Italian text found:**
- "Digita qualcosa o /help per tutti i comandi"
  - Translation: "Type something or /help for all commands"
- "Ciao! Sono Genesis..."
  - Translation: "Hi! I'm Genesis..."

**English text found:**
- "Quick: /fix /explain /test"
- "Saving..."
- "Goodbye!"
- All command-line help

### Expected Behavior
All user-facing text should be in a single language, preferably English for international users.

### Actual Behavior
Random mix of Italian and English throughout the interface.

### Impact
- ⚠️ Confusing for non-Italian speakers
- ⚠️ Unprofessional appearance
- ⚠️ Inconsistent branding
- ⚠️ Harder to maintain

### Root Cause
Likely hardcoded Italian strings in:
- Chat prompts
- LLM system messages
- UI templates

### Affected Files
Search needed for Italian strings in:
- `/Users/lucarossignoli/genesis/src/cli/chat.ts`
- `/Users/lucarossignoli/genesis/src/cli/interactive.ts`
- LLM prompt templates

### Suggested Fix

**Short-term:**
```bash
# Find all Italian strings
grep -r "Digita\|Ciao\|Sono" src/

# Replace with English
"Digita qualcosa o /help" → "Type something or /help"
"Ciao! Sono Genesis" → "Hi! I'm Genesis"
```

**Long-term:**
Implement proper internationalization (i18n):

```typescript
// config/i18n.ts
const translations = {
  en: {
    welcome: "Type something or /help for all commands",
    greeting: "Hi! I'm Genesis..."
  },
  it: {
    welcome: "Digita qualcosa o /help per tutti i comandi",
    greeting: "Ciao! Sono Genesis..."
  }
};

// Usage
const lang = process.env.GENESIS_LANG || 'en';
console.log(t('welcome')); // Uses current language
```

**With language detection:**
```typescript
import * as os from 'os';

function detectLanguage(): string {
  const locale = process.env.LANG || process.env.LANGUAGE || 'en_US';
  if (locale.startsWith('it')) return 'it';
  return 'en';
}
```

### Workaround
Learn Italian 😄 Or just ignore the mixed languages.

---

## Summary

| Bug | Priority | Severity | Impact on Users | Impact on Dev |
|-----|----------|----------|-----------------|---------------|
| #1 - Process Hangs | Critical | High | Blocks automation | Blocks testing |
| #2 - Exit Error | Medium | Low | Cosmetic annoyance | None |
| #3 - Mixed Language | Medium | Medium | Confusing UX | Harder i18n |

### Recommended Fix Order

1. **BUG #1 - Process Hangs** (ASAP)
   - Blocks testing and automation
   - Critical for CI/CD
   - Estimated fix time: 2-4 hours

2. **BUG #3 - Mixed Language** (This week)
   - Easy to fix with find/replace
   - Big UX improvement
   - Estimated fix time: 1-2 hours

3. **BUG #2 - Exit Error** (When convenient)
   - Low priority cosmetic issue
   - Needs investigation to find error source
   - Estimated fix time: 1-3 hours

---

## Testing Recommendations

### After Bug Fixes

**Test Suite Needed:**
```bash
# Test 1: Piped input with message
echo -e "Hello\n/exit" | node dist/src/index.js chat --no-brain
# Should exit cleanly in < 30 seconds

# Test 2: Multiple messages
echo -e "What is 2+2?\nWhat is 3+3?\n/exit" | node dist/src/index.js chat --no-brain
# Should handle both messages and exit

# Test 3: Exit without messages
echo "/exit" | node dist/src/index.js chat --no-brain
# Should exit immediately

# Test 4: Timeout test
echo -e "Complex query here\n/exit" | timeout 60 node dist/src/index.js chat --no-brain
# Should not timeout

# Test 5: No error on exit
output=$(echo "/exit" | node dist/src/index.js chat --no-brain 2>&1)
if echo "$output" | grep -q "ERR_USE_AFTER_CLOSE"; then
  echo "FAIL: Exit error still present"
else
  echo "PASS: Clean exit"
fi

# Test 6: Language consistency
output=$(echo "/exit" | node dist/src/index.js chat --no-brain 2>&1)
italian_count=$(echo "$output" | grep -c "Digita\|Ciao\|Sono" || true)
if [ $italian_count -gt 0 ]; then
  echo "FAIL: Italian text found"
else
  echo "PASS: All English"
fi
```

---

## Additional Notes

### Environment
- Tested on macOS Darwin 25.1.0
- Node.js >= 18.0.0
- Genesis v10.4.0

### Related Issues
- Consider adding `--timeout` flag for user control
- Consider adding `--lang` flag for language selection
- Consider CI/CD tests before these bugs are fixed

### Contact
For questions about these bugs, see:
- Comprehensive Test Report: `/Users/lucarossignoli/genesis/COMPREHENSIVE_TEST_REPORT.md`
- Test Results: `/Users/lucarossignoli/genesis/TEST_RESULTS.md`

---

*Bug Report Generated: 2026-01-22 18:50 PST*
