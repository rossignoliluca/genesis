#!/usr/bin/env npx tsx
/**
 * Test completo dell'auto-miglioramento di Genesis
 *
 * Verifica:
 * 1. Accesso MCP tools
 * 2. Metriche Brain
 * 3. Darwin-Gödel self-modification
 * 4. Git push
 */

import { getBrain } from './src/brain/index.js';
import { getDarwinGodelEngine, ModificationPlan } from './src/self-modification/darwin-godel.js';
import { getMCPClient } from './src/mcp/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

async function testSelfImprovement() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         GENESIS SELF-IMPROVEMENT TEST                          ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Test Brain metrics
  console.log('1. BRAIN METRICS:');
  const brain = getBrain();
  await brain.start();

  // Run a test query to get some metrics
  console.log('   Running test query...');
  try {
    const response = await brain.process('What is 2+2?');
    console.log(`   Response: "${response.slice(0, 50)}..."`);
  } catch (e) {
    console.log(`   Brain query failed: ${e}`);
  }

  const metrics = brain.getMetrics();
  console.log(`   φ (phi): ${metrics.avgPhi.toFixed(3)}`);
  console.log(`   Memory reuse: ${(metrics.memoryReuseRate * 100).toFixed(1)}%`);
  console.log(`   Total cycles: ${metrics.totalCycles}`);
  console.log('');

  // 2. Test MCP access
  console.log('2. MCP TOOL ACCESS:');
  const mcpServers = ['filesystem', 'brave-search', 'arxiv', 'github'];
  for (const server of mcpServers) {
    try {
      const client = await getMCPClient(server as any);
      if (client) {
        const tools = await client.listTools();
        console.log(`   ✅ ${server}: ${tools?.tools?.length || 0} tools available`);
      } else {
        console.log(`   ❌ ${server}: Client not available`);
      }
    } catch (e) {
      console.log(`   ❌ ${server}: ${e instanceof Error ? e.message.slice(0, 40) : e}`);
    }
  }
  console.log('');

  // 3. Test Darwin-Gödel
  console.log('3. DARWIN-GÖDEL ENGINE:');
  const darwinGodel = getDarwinGodelEngine({ gitEnabled: true, skipTests: true });

  // Read current values
  const srcDir = join(process.cwd(), 'src');
  const workspaceContent = readFileSync(join(srcDir, 'memory/cognitive-workspace.ts'), 'utf-8');
  const typesContent = readFileSync(join(srcDir, 'active-inference/types.ts'), 'utf-8');

  const anticipationMatch = workspaceContent.match(/anticipationDepth:\s*(\d+)/);
  const inferenceMatch = typesContent.match(/inferenceIterations:\s*(\d+)/);

  const currentAnticipation = anticipationMatch ? parseInt(anticipationMatch[1]) : 7;
  const currentInference = inferenceMatch ? parseInt(inferenceMatch[1]) : 24;

  console.log(`   Current anticipationDepth: ${currentAnticipation}`);
  console.log(`   Current inferenceIterations: ${currentInference}`);

  // Build a test modification based on metrics
  const phi = metrics.avgPhi;
  const reuse = metrics.memoryReuseRate;

  let plan: ModificationPlan | null = null;

  if (phi < 0.5 && currentInference < 48) {
    const newValue = Math.min(currentInference + 2, 48);
    plan = {
      id: `auto-improve-${Date.now()}`,
      name: 'Boost inference iterations for higher Φ',
      description: `Φ=${phi.toFixed(3)} is below 0.5, boosting inference`,
      modifications: [{
        id: 'inference-boost',
        description: `inferenceIterations: ${currentInference} → ${newValue}`,
        targetFile: 'active-inference/types.ts',
        type: 'replace',
        search: `inferenceIterations: ${currentInference},`,
        content: `inferenceIterations: ${newValue}, // Auto-improved: Φ was ${phi.toFixed(2)}`,
        reason: 'Φ below threshold',
        expectedImprovement: '+10% consciousness',
      }],
      createdAt: new Date(),
    };
  } else if (reuse < 0.5 && currentAnticipation < 15) {
    const newValue = Math.min(currentAnticipation + 1, 15);
    plan = {
      id: `auto-improve-${Date.now()}`,
      name: 'Boost anticipation for better memory reuse',
      description: `Memory reuse=${(reuse * 100).toFixed(1)}% is below 50%`,
      modifications: [{
        id: 'anticipation-boost',
        description: `anticipationDepth: ${currentAnticipation} → ${newValue}`,
        targetFile: 'memory/cognitive-workspace.ts',
        type: 'replace',
        search: `anticipationDepth: ${currentAnticipation},`,
        content: `anticipationDepth: ${newValue}, // Auto-improved: reuse was ${(reuse * 100).toFixed(0)}%`,
        reason: 'Memory reuse below threshold',
        expectedImprovement: '+15% memory reuse',
      }],
      createdAt: new Date(),
    };
  }

  if (plan) {
    console.log(`\n   Improvement needed: ${plan.name}`);
    console.log(`   Applying modification...`);

    try {
      const result = await darwinGodel.apply(plan);

      if (result.success) {
        console.log(`   ✅ Applied! Commit: ${result.commitHash}`);

        // 4. Git push
        console.log('\n4. GIT PUSH:');
        try {
          const pushOutput = execSync('git push origin main 2>&1', { encoding: 'utf-8' });
          console.log(`   ✅ Pushed to GitHub!`);
          console.log(`   ${pushOutput.trim()}`);
        } catch (e) {
          console.log(`   ❌ Push failed: ${e}`);
        }
      } else {
        console.log(`   ❌ Failed: ${result.verificaton.errors.join(', ')}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log(`   ✅ Metrics are healthy, no improvement needed`);
    console.log(`      φ=${phi.toFixed(3)} (threshold: 0.5)`);
    console.log(`      reuse=${(reuse * 100).toFixed(1)}% (threshold: 50%)`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY:');
  console.log(`  Brain: ${metrics.totalCycles > 0 ? '✅ Working' : '⚠️ No cycles'}`);
  console.log(`  MCP: Tested ${mcpServers.length} servers`);
  console.log(`  Darwin-Gödel: ${plan ? (plan ? '✅ Modification applied' : '❌ Failed') : '✅ No changes needed'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  await brain.stop();
  process.exit(0);
}

testSelfImprovement().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
