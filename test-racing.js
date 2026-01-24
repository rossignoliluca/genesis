/**
 * Genesis v10.6 - Real Racing Test
 * Tests model racing with live API calls
 */

const { createStreamOrchestrator } = require('./dist/src/streaming/orchestrator.js');
const { getLatencyTracker } = require('./dist/src/streaming/latency-tracker.js');

async function testRacing() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  GENESIS v10.6 — RACING LIVE TEST                ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // Check available keys
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  console.log('Available providers:');
  console.log('  Anthropic:', hasAnthropic ? '✓' : '✗');
  console.log('  OpenAI:', hasOpenAI ? '✓' : '✗');
  console.log('');

  // Exclude providers without keys
  const excludeProviders = [];
  if (!process.env.GROQ_API_KEY) excludeProviders.push('groq');
  if (!process.env.OLLAMA_HOST) excludeProviders.push('ollama');

  const orchestrator = createStreamOrchestrator({
    enableRacing: true,
    racingStrategy: 'hedged',
    enablePrefetch: true,
    enableParallelTools: true,
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    messages: [],
  });

  // --- TEST 1: Hedged Racing (Anthropic vs OpenAI) ---
  console.log('━━━ TEST 1: Hedged Racing (Anthropic vs OpenAI) ━━━');
  const query1 = 'What is the capital of Japan? Answer in exactly one sentence.';
  console.log('Query:', query1);
  console.log('');

  await runStream(orchestrator, {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    messages: [{ role: 'user', content: query1 }],
    enableRacing: true,
    racingStrategy: 'hedged',
    maxTokens: 80,
    temperature: 0.2,
    excludeProviders,
  });

  console.log('');

  // --- TEST 2: TTFT Race ---
  console.log('━━━ TEST 2: TTFT Race (first token wins) ━━━');
  const query2 = 'Write a haiku about artificial intelligence.';
  console.log('Query:', query2);
  console.log('');

  await runStream(orchestrator, {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    messages: [{ role: 'user', content: query2 }],
    enableRacing: true,
    racingStrategy: 'ttft',
    maxTokens: 100,
    temperature: 0.7,
    excludeProviders,
  });

  console.log('');

  // --- TEST 3: Without racing (baseline for comparison) ---
  console.log('━━━ TEST 3: No Racing (Baseline) ━━━');
  const query3 = 'What is 2+2? Just the number.';
  console.log('Query:', query3);
  console.log('');

  await runStream(orchestrator, {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    messages: [{ role: 'user', content: query3 }],
    enableRacing: false,
    maxTokens: 20,
    temperature: 0,
  });

  // --- Summary ---
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  RESULTS                                         ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  console.log('');
  console.log('LATENCY DATABASE:');
  const tracker = getLatencyTracker();
  const stats = tracker.getAllStats();
  for (const s of stats) {
    console.log(`  ${s.provider}/${s.model}: TTFT=${Math.round(s.emaTTFT)}ms tok/s=${Math.round(s.emaTokPerSec)} p90=${Math.round(s.p90TTFT)}ms (n=${s.sampleCount}, ${s.trend})`);
  }

  console.log('');
  console.log('RACE STATS:');
  const rs = orchestrator.getRaceStats();
  console.log(`  Total races: ${rs.raceCount}`);
  console.log(`  Total saved: ${Math.round(rs.totalSaved)}ms`);
  console.log(`  Avg saved: ${Math.round(rs.avgSaved)}ms per race`);
}

async function runStream(orchestrator, options) {
  const start = Date.now();
  let content = '';
  let ttft = 0;
  let finalMetrics = null;

  try {
    for await (const event of orchestrator.execute(options)) {
      switch (event.type) {
        case 'token':
          if (!ttft) {
            ttft = Date.now() - start;
            process.stdout.write(`[TTFT ${ttft}ms] `);
          }
          content += event.content;
          process.stdout.write(event.content);
          break;

        case 'metadata':
          // Store for later display
          break;

        case 'done':
          finalMetrics = event.metrics;
          break;

        case 'error':
          console.log(`\n  ERROR [${event.code}]: ${event.message}`);
          break;
      }
    }
  } catch (e) {
    console.error('\n  Stream failed:', e.message);
    return;
  }

  const elapsed = Date.now() - start;
  console.log('');

  // Performance line
  const parts = [];
  parts.push(`${elapsed}ms total`);
  parts.push(`TTFT=${ttft}ms`);
  if (finalMetrics) {
    parts.push(`${Math.round(finalMetrics.tokensPerSecond)} tok/s`);
    if (finalMetrics.racingWinner) {
      parts.push(`WINNER: ${finalMetrics.racingWinner}/${finalMetrics.racingModel}`);
    }
    if (finalMetrics.racingSaved > 0) {
      parts.push(`SAVED: ${finalMetrics.racingSaved}ms`);
    }
  }
  console.log(`  ⚡ ${parts.join(' | ')}`);
}

testRacing().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
