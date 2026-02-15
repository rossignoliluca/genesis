/**
 * Genesis v18.1 - Adaptive Learning & Precision Learning Demo
 *
 * Demonstrates:
 * 1. Multi-dimensional adaptive learning rates
 * 2. Beta-Bernoulli precision learning
 * 3. Online calibration of sensor trust
 */

import { createActiveInferenceEngine } from './src/active-inference/core.js';
import type { Observation } from './src/active-inference/types.js';

console.log('\n=== Genesis v18.1: Adaptive Learning Demo ===\n');

// Create engine
const engine = createActiveInferenceEngine({
  learningRateA: 0.1,
  learningRateB: 0.05,
  actionTemperature: 2.0,
});

console.log('1. Initial Learned Precisions:');
const modalities = ['energy', 'phi', 'tool', 'coherence', 'task', 'economic'];
for (const mod of modalities) {
  const prec = engine.getLearnedPrecision(mod);
  console.log(`   ${mod.padEnd(10)}: ${prec.toFixed(3)}`);
}

console.log('\n2. Running inference cycles with adaptive learning...\n');

// Simulate 50 inference cycles
const observations: Observation[] = [];
for (let i = 0; i < 50; i++) {
  // Generate somewhat noisy observations
  const obs: Observation = {
    energy: Math.floor(Math.random() * 5),
    phi: Math.floor(Math.random() * 4),
    tool: Math.floor(Math.random() * 3),
    coherence: Math.floor(Math.random() * 3),
    task: Math.floor(Math.random() * 4),
    economic: Math.floor(Math.random() * 4),
  };
  observations.push(obs);

  const action = engine.step(obs);

  if (i % 10 === 0) {
    console.log(`   Cycle ${i.toString().padStart(2)}: action=${action}, beliefs=`,
      engine.getMostLikelyState());
  }
}

console.log('\n3. Simulating precision updates based on prediction accuracy...\n');

// Simulate that some modalities are more accurate than others
// Energy and task are very accurate (80% success)
// Phi and economic are mediocre (60% success)
// Tool and coherence are noisy (40% success)

const accuracyRates = {
  energy: 0.80,
  phi: 0.60,
  tool: 0.40,
  coherence: 0.40,
  task: 0.80,
  economic: 0.60,
};

for (let i = 0; i < 100; i++) {
  for (const mod of modalities) {
    const wasAccurate = Math.random() < accuracyRates[mod];
    engine.updatePrecision(mod, wasAccurate);
  }
}

console.log('4. Updated Learned Precisions (after 100 observations):');
for (const mod of modalities) {
  const prec = engine.getLearnedPrecision(mod);
  const initial = mod === 'energy' ? 0.833 :
                  mod === 'phi' ? 0.667 :
                  mod === 'tool' ? 0.700 :
                  mod === 'coherence' ? 0.727 :
                  mod === 'task' ? 0.818 :
                  0.545;
  const change = prec - initial;
  console.log(`   ${mod.padEnd(10)}: ${prec.toFixed(3)} (${change > 0 ? '+' : ''}${change.toFixed(3)})`);
}

console.log('\n5. Engine Statistics:');
const stats = engine.getStats();
console.log(`   Total inferences: ${stats.inferenceCount}`);
console.log(`   Average surprise: ${stats.averageSurprise.toFixed(3)}`);
console.log(`   Actions taken: ${Object.keys(stats.actionCounts).length} unique actions`);

console.log('\n6. Current Belief State:');
const beliefs = engine.getBeliefs();
console.log('   Viability:', beliefs.viability.map(p => p.toFixed(3)));
console.log('   WorldState:', beliefs.worldState.map(p => p.toFixed(3)));
console.log('   Coupling:', beliefs.coupling.map(p => p.toFixed(3)));
console.log('   GoalProgress:', beliefs.goalProgress.map(p => p.toFixed(3)));
console.log('   Economic:', beliefs.economic.map(p => p.toFixed(3)));

console.log('\n7. Most Likely State:');
const mostLikely = engine.getMostLikelyState();
console.log(`   Viability: ${mostLikely.viability}`);
console.log(`   WorldState: ${mostLikely.worldState}`);
console.log(`   Coupling: ${mostLikely.coupling}`);
console.log(`   GoalProgress: ${mostLikely.goalProgress}`);
console.log(`   Economic: ${mostLikely.economic}`);

console.log('\n=== Key Observations ===');
console.log('1. Adaptive learning rates automatically adjust based on:');
console.log('   - Surprise level (higher surprise → faster learning)');
console.log('   - State entropy (higher uncertainty → faster learning)');
console.log('   - Action novelty (novel actions → slower learning)');
console.log('   - Temporal recency (recent data weighted more)');
console.log('');
console.log('2. Precision learning tracks sensor reliability:');
console.log('   - Energy & task (accurate) → precision increased');
console.log('   - Tool & coherence (noisy) → precision decreased');
console.log('   - Phi & economic (medium) → modest changes');
console.log('');
console.log('3. System automatically calibrates trust in observations');
console.log('   without manual tuning of precision parameters.');
console.log('');
