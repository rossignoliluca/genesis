const { createCompetitiveIntelService } = require('./dist/src/services/competitive-intel.js');

async function scan() {
  console.log('=== Manual CompIntel Scan ===');
  console.log('');

  const competitors = [
    { name: 'Cursor', domain: 'cursor.com', pages: ['https://www.cursor.com/pricing'] },
    { name: 'Aider', domain: 'aider.chat', pages: ['https://aider.chat/'] },
  ];

  console.log('Competitors:', competitors.map(c => c.name).join(', '));
  console.log('');

  const service = createCompetitiveIntelService({ competitors });

  console.log('Running scan...');
  const changes = await service.checkAll();

  console.log('');
  console.log('Changes detected:', changes.length);

  if (changes.length > 0) {
    console.log('');
    console.log('=== Changes ===');
    for (const change of changes.slice(0, 5)) {
      console.log('  -', change.competitor, ':', change.changeType);
    }

    console.log('');
    console.log('Generating digest...');
    const digest = await service.generateDigest(24);
    console.log('');
    console.log('=== Digest ===');
    console.log('Key Insights:', digest.keyInsights.length);
    digest.keyInsights.slice(0, 3).forEach(i => console.log('  -', i));
    console.log('');
    console.log('Recommendations:', digest.recommendations.length);
    digest.recommendations.slice(0, 3).forEach(r => console.log('  -', r));
  } else {
    console.log('No changes detected (first scan establishes baseline)');
  }

  console.log('');
  console.log('=== Scan Complete ===');
}

scan().catch(e => console.error('Error:', e.message));
