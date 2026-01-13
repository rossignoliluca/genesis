/**
 * Test v7.14 web executors
 */
import { executeAction } from './src/active-inference/actions.js';

async function main() {
  console.log('=== Testing v7.14 Web Executors ===\n');

  // Test 1: web.search (Brave)
  console.log('Test 1: web.search');
  const r1 = await executeAction('web.search', {
    parameters: { query: 'TypeScript best practices 2024', count: 3 }
  });
  console.log(`  Success: ${r1.success}`);
  if (r1.success) {
    console.log(`  Query: ${r1.data?.query}`);
    console.log(`  Results: ${r1.data?.results?.data ? 'received' : 'none'}`);
  } else {
    console.log(`  Error: ${r1.error}`);
  }
  console.log('');

  // Test 2: web.scrape (Firecrawl)
  console.log('Test 2: web.scrape');
  const r2 = await executeAction('web.scrape', {
    parameters: { url: 'https://example.com' }
  });
  console.log(`  Success: ${r2.success}`);
  if (r2.success) {
    console.log(`  URL: ${r2.data?.url}`);
    console.log(`  Content length: ${JSON.stringify(r2.data?.content).length} chars`);
  } else {
    console.log(`  Error: ${r2.error}`);
  }
  console.log('');

  // Test 3: api.call (HTTP)
  console.log('Test 3: api.call');
  const r3 = await executeAction('api.call', {
    parameters: {
      url: 'https://httpbin.org/get',
      method: 'GET'
    }
  });
  console.log(`  Success: ${r3.success}`);
  if (r3.success) {
    console.log(`  URL: ${r3.data?.url}`);
    console.log(`  Status: ${r3.data?.status}`);
  } else {
    console.log(`  Error: ${r3.error}`);
  }
  console.log('');

  // Test 4: market.analyze
  console.log('Test 4: market.analyze');
  const r4 = await executeAction('market.analyze', {
    parameters: { topic: 'AI SaaS startups' }
  });
  console.log(`  Success: ${r4.success}`);
  if (r4.success) {
    console.log(`  Topic: ${r4.data?.topic}`);
    console.log(`  Trends: ${r4.data?.trends ? 'analyzed' : 'none'}`);
    console.log(`  Competitors: ${r4.data?.competitors ? 'found' : 'none'}`);
  } else {
    console.log(`  Error: ${r4.error}`);
  }

  console.log('\n=== Web executor tests complete ===');
}

main().catch(console.error);
