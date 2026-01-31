/**
 * Full CompIntel scan with all competitors
 */
const { createCompetitiveIntelService } = require('./dist/src/services/competitive-intel.js');

async function scan() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           GENESIS COMPINTEL - FULL COMPETITOR SCAN            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const competitors = [
    { name: 'Cursor', domain: 'cursor.com', pages: ['https://www.cursor.com/pricing', 'https://www.cursor.com/features'] },
    { name: 'Windsurf', domain: 'codeium.com', pages: ['https://codeium.com/windsurf', 'https://codeium.com/pricing'] },
    { name: 'Aider', domain: 'aider.chat', pages: ['https://aider.chat/'] },
    { name: 'Continue', domain: 'continue.dev', pages: ['https://continue.dev/'] },
  ];

  console.log('Competitors:', competitors.map(c => c.name).join(', '));
  console.log('Total pages:', competitors.reduce((acc, c) => acc + (c.pages?.length || 1), 0));
  console.log('');
  console.log('Scanning...');
  console.log('');

  const startTime = Date.now();
  const service = createCompetitiveIntelService({ competitors });

  try {
    const changes = await service.checkAll();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`Scan completed in ${duration}s`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Changes detected: ${changes.length}`);

    if (changes.length > 0) {
      console.log('');
      console.log('Changes:');
      for (const change of changes) {
        console.log(`  • ${change.competitor} [${change.changeType}]: ${change.summary || 'content changed'}`);
      }

      console.log('');
      console.log('Generating strategic digest...');
      const digest = await service.generateDigest(24);

      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('STRATEGIC DIGEST');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');

      console.log('📊 Key Insights:');
      digest.keyInsights.forEach((insight, i) => {
        console.log(`  ${i + 1}. ${insight}`);
      });

      console.log('');
      console.log('💡 Recommendations:');
      digest.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });

      if (digest.urgentItems && digest.urgentItems.length > 0) {
        console.log('');
        console.log('🚨 Urgent Items:');
        digest.urgentItems.forEach((item, i) => {
          console.log(`  ${i + 1}. ${item}`);
        });
      }
    } else {
      console.log('');
      console.log('No changes detected. This scan establishes/confirms the baseline.');
      console.log('Future scans will detect pricing changes, feature updates, etc.');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SCAN COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (err) {
    console.error('Scan failed:', err.message);
  }
}

scan();
