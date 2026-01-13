/**
 * Test Genesis Memory System
 */

import {
  createMemorySystem,
  getCognitiveWorkspace,
} from './src/memory/index.js';

async function testMemory() {
  console.log('🧠 Testing Genesis Memory System\n');
  console.log('=' .repeat(50));

  // Create memory system (in-memory)
  const memory = createMemorySystem();

  // 1. Episodic Memory - Remember experiences
  console.log('\n📝 Episodic Memory (Experiences):');

  const episode1 = memory.remember({
    what: 'Implemented secure shell execution',
    details: {
      files: ['src/execution/shell.ts'],
      risk: 'Evolution #3',
    },
    feeling: { valence: 0.8, arousal: 0.5, label: 'satisfaction' },
    tags: ['coding', 'security', 'self-improvement'],
  });
  console.log(`  ✓ Stored: "${episode1.content.what}"`);

  const episode2 = memory.remember({
    what: 'Created self-diagnostics module autonomously',
    details: {
      lines: 205,
      autonomous: true,
    },
    feeling: { valence: 0.9, arousal: 0.6, label: 'pride' },
    tags: ['autonomous', 'self-improvement'],
  });
  console.log(`  ✓ Stored: "${episode2.content.what}"`);

  // 2. Semantic Memory - Learn facts
  console.log('\n📚 Semantic Memory (Knowledge):');

  memory.learn({
    concept: 'OWASP Shell Security',
    definition: 'Command allowlist, metacharacter blocking, shell:false',
    category: 'security',
    related: ['command-injection', 'spawn', 'exec'],
  });
  console.log('  ✓ Learned: OWASP Shell Security');

  memory.learn({
    concept: 'Human-in-the-Loop',
    definition: 'Requiring human confirmation for high-risk actions',
    category: 'AI safety',
    related: ['confirmation', 'risk-level', 'autonomy'],
  });
  console.log('  ✓ Learned: Human-in-the-Loop');

  // 3. Procedural Memory - Learn skills
  console.log('\n🔧 Procedural Memory (Skills):');

  memory.learnSkill({
    name: 'secure-git-push',
    description: 'Push to GitHub with security checks',
    steps: [
      { action: 'git status', params: { tool: 'shell' } },
      { action: 'git add .', params: { tool: 'shell' } },
      { action: 'git commit -m "message"', params: { tool: 'shell' } },
      { action: 'git push origin main', params: { tool: 'shell', requiresConfirmation: true } },
    ],
    tags: ['push', 'deploy', 'publish'],
  });
  console.log('  ✓ Skill learned: secure-git-push');

  // 4. Recall memories
  console.log('\n🔍 Memory Recall:');

  const selfImprovements = memory.recall('self-improvement', { limit: 5 });
  console.log(`  Found ${selfImprovements.length} self-improvement memories`);

  const securityKnowledge = memory.recall('security', { limit: 5 });
  console.log(`  Found ${securityKnowledge.length} security-related items`);

  // 5. Working Memory (Cognitive Workspace)
  console.log('\n💭 Working Memory (Cognitive Workspace):');

  try {
    const workspace = getCognitiveWorkspace();
    const stats = workspace.getStats();
    console.log(`  Items: ${stats.itemCount}`);
    console.log(`  Capacity: ${stats.utilizationPercent.toFixed(1)}%`);
  } catch {
    console.log('  (Workspace not initialized in this context)');
  }

  // 6. Memory stats
  console.log('\n📊 Memory Statistics:');
  const stats = memory.getStats();
  console.log(`  Episodic: ${stats.episodic.total} memories`);
  console.log(`  Semantic: ${stats.semantic.total} facts`);
  console.log(`  Procedural: ${stats.procedural.total} skills`);
  console.log(`  Total: ${stats.total} items`);

  // Shutdown memory system
  memory.shutdown();

  console.log('\n✅ Memory system working!\n');
}

testMemory().catch(console.error);
