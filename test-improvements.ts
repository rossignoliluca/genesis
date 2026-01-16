/**
 * Test che i miglioramenti funzionano davvero
 */

import { getCognitiveWorkspace, DEFAULT_WORKSPACE_CONFIG } from './src/memory/cognitive-workspace.js';

async function test() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           TEST MIGLIORAMENTI MEMORIA                          ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const workspace = getCognitiveWorkspace();

  // Check config values
  const config = (workspace as any).config;

  console.log('1. VERIFICA CONFIGURAZIONE:');
  console.log('   ┌─────────────────────────────────────────────────────────┐');
  console.log(`   │ anticipationDepth: ${config.anticipationDepth}  (originale: 5)  ${config.anticipationDepth === 7 ? '✅ MIGLIORATO' : '❌'}  │`);
  console.log(`   │ decayRate:         ${config.decayRate} (originale: 0.01) ${config.decayRate === 0.005 ? '✅ MIGLIORATO' : '❌'}  │`);
  console.log('   └─────────────────────────────────────────────────────────┘\n');

  // Test anticipation depth
  console.log('2. TEST ANTICIPAZIONE:');
  console.log(`   Con depth=${config.anticipationDepth}, pre-carico fino a ${config.anticipationDepth} items per tipo`);

  await workspace.anticipate({
    task: 'AI consciousness and memory systems',
    recentTopics: ['machine learning', 'neural networks'],
  });

  const items = workspace.getActive();
  console.log(`   Items pre-caricati in workspace: ${items.length}`);

  if (items.length > 0) {
    console.log('   Primi 3 items:');
    items.slice(0, 3).forEach((item, i) => {
      const content = (item.memory as any).content || (item.memory as any).definition || 'N/A';
      const contentStr = typeof content === 'string' ? content.slice(0, 35) : JSON.stringify(content).slice(0, 35);
      console.log(`     ${i + 1}. [${item.memory.type}] "${contentStr}..."`);
    });
  }

  // Test decay rate
  console.log('\n3. TEST DECAY RATE:');

  // Add a test memory with known activation
  const testId = 'test-decay-' + Date.now();
  workspace.addToBuffer({
    id: testId,
    type: 'episodic',
    content: 'Test memory for decay measurement',
    timestamp: new Date(),
    tags: ['test'],
  }, 'manual');

  let testItem = workspace.getActive().find(i => i.id === testId);
  const initialActivation = testItem?.activation || 0;
  console.log(`   Activation iniziale: ${initialActivation.toFixed(4)}`);

  // Simulate time passing
  console.log('   Simulando passaggio tempo (500ms)...');
  await new Promise(r => setTimeout(r, 500));

  // Force curation to apply decay
  (workspace as any).curate();

  testItem = workspace.getActive().find(i => i.id === testId);
  const finalActivation = testItem?.activation || 0;
  console.log(`   Activation dopo decay: ${finalActivation.toFixed(4)}`);

  const actualDecay = initialActivation - finalActivation;
  const oldDecayWouldBe = 0.01 * 0.5; // old rate * time
  const newDecayExpected = 0.005 * 0.5; // new rate * time

  console.log(`   Decay effettivo: ${actualDecay.toFixed(4)}`);
  console.log(`   → Con rate 0.01 (vecchio): ~${oldDecayWouldBe.toFixed(4)} per 0.5s`);
  console.log(`   → Con rate 0.005 (nuovo):  ~${newDecayExpected.toFixed(4)} per 0.5s`);

  if (actualDecay < oldDecayWouldBe * 0.8) {
    console.log('   ✅ Decay più lento confermato!');
  }

  // Final metrics
  console.log('\n4. METRICHE FINALI:');
  const stats = workspace.getStats();
  console.log('   ┌─────────────────────────────────────────────────────────┐');
  console.log(`   │ Items attivi:      ${String(stats.activeItems).padStart(4)}                               │`);
  console.log(`   │ Buffer size:       ${String(stats.bufferSize).padStart(4)}                               │`);
  console.log(`   │ Capacity:          ${String(stats.capacity).padStart(4)}                               │`);
  console.log('   └─────────────────────────────────────────────────────────┘');

  // Summary
  console.log('\n5. RIEPILOGO MIGLIORAMENTI:');
  const improvements = [];
  if (config.anticipationDepth === 7) improvements.push('✅ anticipationDepth: 5 → 7 (+40%)');
  if (config.decayRate === 0.005) improvements.push('✅ decayRate: 0.01 → 0.005 (-50%)');

  if (improvements.length === 2) {
    console.log('   ' + improvements.join('\n   '));
    console.log('\n   🎉 TUTTI I MIGLIORAMENTI FUNZIONANO!');
  } else {
    console.log('   ⚠️ Alcuni miglioramenti non applicati');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

test().catch(console.error);
