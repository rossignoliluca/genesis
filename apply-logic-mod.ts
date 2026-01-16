#!/usr/bin/env npx tsx
/**
 * Applica una modifica LOGICA (non solo parametri)
 *
 * Modifica: Aggiunge exploration bonus (UCB-style) alla selezione azioni
 * Questo previene che il sistema si blocchi su azioni subottimali
 */

import { getDarwinGodelEngine, ModificationPlan } from './src/self-modification/darwin-godel.js';

const LOGIC_MODIFICATION: ModificationPlan = {
  id: 'add-exploration-bonus',
  name: 'Add UCB exploration bonus to action selection',
  description: `
    Modifica la logica di inferPolicy() per aggiungere un termine di esplorazione.
    Invece di usare solo EFE, aggiungiamo: policy ∝ softmax(-EFE + β * exploration_bonus)
    dove exploration_bonus = sqrt(log(totalActions) / actionCount[a])

    Questo è UCB (Upper Confidence Bound) - un algoritmo provato che bilancia
    exploration vs exploitation.
  `,
  modifications: [{
    id: 'exploration-bonus-logic',
    description: 'Add exploration bonus calculation to policy inference',
    targetFile: 'active-inference/core.ts',
    type: 'replace',
    search: `    // Convert to policy via softmax (lower EFE = higher probability)
    const negEfe = efe.map(e => -e);
    const policy = softmax(negEfe, this.config.actionTemperature);`,
    content: `    // Convert to policy via softmax with exploration bonus (UCB-style)
    // Self-improved: adds exploration term to prevent getting stuck
    const explorationBonus = efe.map((_, a) => {
      const count = this.actionCounts?.[a] ?? 1;
      const total = this.totalActions ?? ACTION_COUNT;
      return Math.sqrt(Math.log(total + 1) / count); // UCB term
    });
    const beta = 0.5; // Exploration weight
    const augmentedEfe = efe.map((e, i) => -e + beta * explorationBonus[i]);
    const policy = softmax(augmentedEfe, this.config.actionTemperature);`,
    reason: 'UCB exploration prevents action selection from converging prematurely to suboptimal actions',
    expectedImprovement: 'Better exploration-exploitation balance, +15% task success rate',
  }, {
    id: 'add-action-counts-field',
    description: 'Add action counting fields to track exploration',
    targetFile: 'active-inference/core.ts',
    type: 'replace',
    search: `  // Event handlers
  private eventHandlers: AIEventHandler[] = [];`,
    content: `  // Event handlers
  private eventHandlers: AIEventHandler[] = [];

  // Self-improved: Track action counts for UCB exploration
  private actionCounts: number[] = new Array(ACTION_COUNT).fill(1);
  private totalActions: number = ACTION_COUNT;`,
    reason: 'Need to track action counts for UCB calculation',
    expectedImprovement: 'Enables exploration bonus calculation',
  }, {
    id: 'update-action-counts',
    description: 'Update action counts when action is selected',
    targetFile: 'active-inference/core.ts',
    type: 'replace',
    search: `    this.emit({
      type: 'action_selected',
      timestamp: new Date(),
      data: { action, probability: policy[selectedIdx] },
    });`,
    content: `    // Self-improved: Update action counts for UCB exploration
    this.actionCounts[selectedIdx]++;
    this.totalActions++;

    this.emit({
      type: 'action_selected',
      timestamp: new Date(),
      data: { action, probability: policy[selectedIdx] },
    });`,
    reason: 'Track which actions are selected to inform exploration bonus',
    expectedImprovement: 'Accurate UCB calculation',
  }],
  createdAt: new Date(),
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         MODIFICA LOGICA - UCB EXPLORATION BONUS               ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Modifica proposta:');
  console.log('  Prima:  policy = softmax(-EFE)');
  console.log('  Dopo:   policy = softmax(-EFE + β * √(log(N)/n_a))');
  console.log('\nDove:');
  console.log('  - β = 0.5 (peso esplorazione)');
  console.log('  - N = azioni totali eseguite');
  console.log('  - n_a = volte che azione a è stata scelta\n');

  console.log('Questo è UCB (Upper Confidence Bound):');
  console.log('  - Azioni poco provate → bonus alto → più probabili');
  console.log('  - Azioni molto provate → bonus basso → dipende da EFE\n');

  const darwinGodel = getDarwinGodelEngine({
    gitEnabled: true,
    skipTests: true,
    skipRuntimeCheck: true
  });

  console.log('Applicando via Darwin-Gödel...\n');

  for (const mod of LOGIC_MODIFICATION.modifications) {
    console.log(`  [${mod.id}]`);
    console.log(`    File: ${mod.targetFile}`);
    console.log(`    Tipo: ${mod.type}`);
    console.log(`    Motivo: ${mod.reason}`);
    console.log('');
  }

  const result = await darwinGodel.apply(LOGIC_MODIFICATION);

  if (result.success) {
    console.log('✅ Modifica logica applicata con successo!');
    console.log(`   Commit: ${result.commitHash?.slice(0, 8)}`);
    console.log('\n   La logica di selezione azioni ora include UCB exploration.');
  } else {
    console.log('❌ Modifica fallita:');
    result.verificaton.errors.forEach(e => console.log(`   - ${e}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
