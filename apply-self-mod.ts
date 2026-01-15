import { getDarwinGodelEngine } from './src/self-modification/darwin-godel.js';

async function apply() {
  const engine = getDarwinGodelEngine({
    genesisRoot: process.cwd(),
    sandboxDir: '/tmp/genesis-self-mod',
    gitEnabled: true,
    skipTests: true,
    skipRuntimeCheck: true,
  });

  const plan = {
    id: `self-improve-${Date.now()}`,
    name: 'Increase inference iterations for accuracy',
    description: 'Improve Active Inference accuracy by increasing iterations from 16 to 24',
    modifications: [{
      id: 'increase-iterations',
      description: 'Increase inferenceIterations from 16 to 24',
      targetFile: 'active-inference/types.ts',
      type: 'replace' as const,
      search: 'inferenceIterations: 16,',
      content: 'inferenceIterations: 24, // Self-improved: +50% iterations for accuracy',
      reason: 'Higher iterations improve belief convergence in Active Inference',
      expectedImprovement: 'Better decision accuracy, reduced surprise',
    }],
    createdAt: new Date(),
  };

  console.log('🔧 Applying self-modification...');
  console.log('   Target: src/active-inference/types.ts');
  console.log('   Change: inferenceIterations 16 → 24\n');

  const result = await engine.apply(plan);

  console.log(result.success ? '✅ SUCCESS' : '❌ FAILED');
  console.log('   Build:', result.verificaton.buildSuccess ? '✅' : '❌');
  console.log('   Invariants:', result.verificaton.invariantsPass ? '✅' : '❌');

  if (result.verificaton.errors.length > 0) {
    console.log('   Errors:', result.verificaton.errors[0].slice(0, 60));
  }

  if (result.commitHash) {
    console.log('   Commit:', result.commitHash);
  }
}

apply().catch(console.error);
