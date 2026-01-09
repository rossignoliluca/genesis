/**
 * Demo: Value-Augmented Active Inference
 *
 * Shows the ValueAugmentedEngine combining POMDP beliefs with value function.
 *
 * Run: node dist/src/active-inference/demo-value-integration.js
 */

import {
  createValueAugmentedEngine,
  createFullyIntegratedEngine,
  ValueAugmentedEngine,
} from './value-integration.js';

import { Observation, ACTIONS } from './types.js';

// ============================================================================
// Demo Scenarios
// ============================================================================

interface Scenario {
  name: string;
  description: string;
  observation: Observation;
}

const scenarios: Scenario[] = [
  {
    name: 'Critical Energy',
    description: 'Energy depleted, needs immediate recharge',
    observation: { energy: 0, phi: 1, tool: 1, coherence: 1, task: 1 },
  },
  {
    name: 'Optimal State',
    description: 'High energy, stable, at attractor (Wu Wei)',
    observation: { energy: 4, phi: 3, tool: 1, coherence: 2, task: 3 },
  },
  {
    name: 'Task Blocked',
    description: 'Normal energy but task is blocked',
    observation: { energy: 2, phi: 2, tool: 2, coherence: 1, task: 2 },
  },
  {
    name: 'Low Coherence',
    description: 'Need to sense/explore to understand world',
    observation: { energy: 3, phi: 0, tool: 0, coherence: 0, task: 0 },
  },
  {
    name: 'Ready to Execute',
    description: 'High energy, good coherence, task active',
    observation: { energy: 3, phi: 2, tool: 1, coherence: 2, task: 1 },
  },
];

// ============================================================================
// Visualization
// ============================================================================

function bar(value: number, max: number = 1, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatPolicy(policy: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < policy.length; i++) {
    const action = ACTIONS[i];
    const prob = policy[i];
    lines.push(`  ${action.padEnd(14)} ${bar(prob)} ${(prob * 100).toFixed(1)}%`);
  }
  return lines.join('\n');
}

function formatBeliefs(beliefs: any): string {
  const lines: string[] = [];

  // Viability
  const viabilityLabels = ['critical', 'low', 'medium', 'high', 'optimal'];
  const maxVia = beliefs.viability.indexOf(Math.max(...beliefs.viability));
  lines.push(`  Viability:    ${viabilityLabels[maxVia]} (${(beliefs.viability[maxVia] * 100).toFixed(0)}%)`);

  // World State
  const worldLabels = ['unknown', 'stable', 'changing', 'chaotic'];
  const maxWorld = beliefs.worldState.indexOf(Math.max(...beliefs.worldState));
  lines.push(`  World State:  ${worldLabels[maxWorld]} (${(beliefs.worldState[maxWorld] * 100).toFixed(0)}%)`);

  // Coupling
  const couplingLabels = ['none', 'weak', 'moderate', 'strong', 'synced'];
  const maxCoup = beliefs.coupling.indexOf(Math.max(...beliefs.coupling));
  lines.push(`  Coupling:     ${couplingLabels[maxCoup]} (${(beliefs.coupling[maxCoup] * 100).toFixed(0)}%)`);

  // Goal Progress
  const goalLabels = ['blocked', 'slow', 'onTrack', 'achieved'];
  const maxGoal = beliefs.goalProgress.indexOf(Math.max(...beliefs.goalProgress));
  lines.push(`  Goal:         ${goalLabels[maxGoal]} (${(beliefs.goalProgress[maxGoal] * 100).toFixed(0)}%)`);

  return lines.join('\n');
}

function formatValue(value: any): string {
  const lines: string[] = [];
  lines.push(`  Total Value:  ${value.value.toFixed(3)}`);
  lines.push(`  Components:`);
  for (const [key, val] of Object.entries(value.components)) {
    lines.push(`    ${key.padEnd(12)} ${(val as number).toFixed(3)}`);
  }
  return lines.join('\n');
}

// ============================================================================
// Demo Runner
// ============================================================================

async function runDemo() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     Genesis 6.2 - Value-Augmented Active Inference Demo       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Creating ValueAugmentedEngine...');
  const engine = createValueAugmentedEngine({ verbose: false });

  console.log('Policy formula: π(a|s) ∝ exp(-EFE(a) + λ·V(s\'))\n');
  console.log('─'.repeat(65));

  for (const scenario of scenarios) {
    console.log(`\n📍 Scenario: ${scenario.name}`);
    console.log(`   ${scenario.description}\n`);

    // Show observation
    console.log('Observation:');
    console.log(`  energy=${scenario.observation.energy} phi=${scenario.observation.phi} ` +
                `tool=${scenario.observation.tool} coherence=${scenario.observation.coherence} ` +
                `task=${scenario.observation.task}\n`);

    // Run inference
    const result = await engine.step(scenario.observation);

    // Show beliefs
    console.log('Beliefs (after inference):');
    console.log(formatBeliefs(result.beliefs));
    console.log();

    // Show value
    console.log('Value Estimate:');
    console.log(formatValue(result.value));
    console.log();

    // Show policy
    console.log('Value-Augmented Policy:');
    console.log(formatPolicy(result.policy));
    console.log();

    // Show selected action
    console.log(`➤ Selected Action: ${result.action}`);
    console.log('─'.repeat(65));
  }

  // Multi-step demonstration
  console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              Multi-Step Inference Demonstration                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const engine2 = createValueAugmentedEngine();

  // Simulate energy recovery scenario
  const recoverySequence: Observation[] = [
    { energy: 0, phi: 1, tool: 1, coherence: 1, task: 1 }, // Critical
    { energy: 1, phi: 1, tool: 1, coherence: 1, task: 1 }, // Low (after recharge)
    { energy: 2, phi: 2, tool: 1, coherence: 1, task: 1 }, // Normal
    { energy: 3, phi: 2, tool: 1, coherence: 2, task: 1 }, // High
    { energy: 4, phi: 3, tool: 1, coherence: 2, task: 3 }, // Optimal + Task done
  ];

  console.log('Simulating energy recovery scenario...\n');
  console.log('Step │ Energy │ Action         │ Value   │ Top Policy');
  console.log('─────┼────────┼────────────────┼─────────┼──────────────────');

  for (let i = 0; i < recoverySequence.length; i++) {
    const obs = recoverySequence[i];
    const result = await engine2.step(obs);

    // Find top 2 actions
    const sorted = result.policy
      .map((p, idx) => ({ action: ACTIONS[idx], prob: p }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 2);

    const topPolicy = sorted.map(s => `${s.action.split('.')[0]}:${(s.prob * 100).toFixed(0)}%`).join(' ');

    console.log(
      `  ${(i + 1).toString().padStart(2)}  │   ${obs.energy}    │ ${result.action.padEnd(14)} │ ${result.value.value.toFixed(3).padStart(7)} │ ${topPolicy}`
    );
  }

  // Show final stats
  const stats = engine2.getStats();
  console.log('\n─'.repeat(65));
  console.log('\nFinal Statistics:');
  console.log(`  Cycles:        ${stats.cycleCount}`);
  console.log(`  Avg Value:     ${stats.averageValue.toFixed(3)}`);
  console.log(`  Value Updates: ${stats.valueUpdates}`);

  // Demo with JEPA
  console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              Full Integration with JEPA                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Creating engine with JEPA world model...');
  const fullEngine = await createFullyIntegratedEngine({
    useWorldModelPredictions: true,
    predictionHorizon: 3,
  });

  const jepaObs: Observation = { energy: 2, phi: 2, tool: 1, coherence: 1, task: 1 };
  console.log(`\nObservation: energy=${jepaObs.energy} phi=${jepaObs.phi} task=${jepaObs.task}`);

  const jepaResult = await fullEngine.step(jepaObs);

  console.log('\nWith JEPA trajectory predictions:');
  console.log(`  Selected Action: ${jepaResult.action}`);
  console.log(`  State Value:     ${jepaResult.value.value.toFixed(3)}`);
  console.log(`  Trajectory Predictions: ${fullEngine.getStats().trajectoryPredictions}`);

  console.log('\n✓ Demo complete!');
}

// Run
runDemo().catch(console.error);
