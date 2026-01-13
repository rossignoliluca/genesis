/**
 * Test RAG Pipeline
 *
 * Run with: npx tsx test-rag.ts
 */

import {
  getRAGPipeline,
  ragSearch,
  ragAugment,
  getVectorStore,
  getEmbeddingService,
} from './src/memory/index.js';

async function main() {
  console.log('🔍 Genesis RAG Pipeline Test\n');
  console.log('=' .repeat(50));

  // Test 1: Embedding Service
  console.log('\n📐 Test 1: Embedding Service');
  const embeddings = getEmbeddingService();
  console.log(`  Provider: ${embeddings.getProvider()}`);
  console.log(`  Dimensions: ${embeddings.getDimensions()}`);

  const testText = 'TypeScript is a typed superset of JavaScript';
  const result = await embeddings.embed(testText);
  console.log(`  Test embedding: ${result.vector.length} dimensions`);
  console.log(`  Cached: ${result.cached}`);

  // Test similarity
  const result2 = await embeddings.embed('JavaScript is a programming language');
  const similarity = embeddings.similarity(result.vector, result2.vector);
  console.log(`  Similarity (TS vs JS): ${(similarity * 100).toFixed(1)}%`);

  // Test 2: Vector Store
  console.log('\n📦 Test 2: Vector Store');
  const store = getVectorStore({ persistPath: './.genesis/test-vectors.json' });

  // Add some test documents
  await store.add('doc1', 'TypeScript provides static typing for JavaScript', { source: 'test' });
  await store.add('doc2', 'React is a library for building user interfaces', { source: 'test' });
  await store.add('doc3', 'Node.js enables JavaScript on the server side', { source: 'test' });

  console.log(`  Documents stored: ${store.getStats().totalDocuments}`);

  // Search
  const searchResults = await store.semanticSearch('JavaScript types', { limit: 2 });
  console.log(`  Search for "JavaScript types":`);
  for (const r of searchResults) {
    console.log(`    - [${(r.score * 100).toFixed(1)}%] ${r.document.text.slice(0, 50)}...`);
  }

  // Test 3: RAG Pipeline
  console.log('\n🔗 Test 3: RAG Pipeline');
  const rag = getRAGPipeline();

  // Ingest some test documents
  const doc1 = await rag.ingest({
    id: 'genesis-overview',
    content: `
      Genesis is an autonomous AI agent framework built with TypeScript.
      It features a multi-tier memory system inspired by cognitive science.
      The framework includes episodic memory for events, semantic memory for facts,
      and procedural memory for learned skills and workflows.
      Genesis supports autonomous operation with human-in-the-loop approval.
    `,
    metadata: { type: 'documentation', topic: 'overview' },
  });
  console.log(`  Ingested: ${doc1.documentId} (${doc1.chunks} chunks)`);

  const doc2 = await rag.ingest({
    id: 'genesis-memory',
    content: `
      The memory system uses Ebbinghaus forgetting curves for realistic memory decay.
      Memories are consolidated during sleep cycles, moving from episodic to semantic.
      The cognitive workspace provides working memory with predictive pre-loading.
      Vector embeddings enable semantic search across all memory types.
    `,
    metadata: { type: 'documentation', topic: 'memory' },
  });
  console.log(`  Ingested: ${doc2.documentId} (${doc2.chunks} chunks)`);

  // Test retrieval
  console.log('\n🎯 Test 4: Retrieval');
  const query = 'How does the memory system work?';
  const retrieval = await ragSearch(query, 3);

  console.log(`  Query: "${query}"`);
  console.log(`  Results: ${retrieval.chunks.length}`);
  for (const r of retrieval.chunks) {
    console.log(`    - [${(r.score * 100).toFixed(1)}%] ${r.chunk.content.slice(0, 60)}...`);
  }

  // Test augmentation
  console.log('\n✨ Test 5: Context Augmentation');
  const augmented = await ragAugment('What is Genesis?', 500);

  console.log(`  Sources used: ${augmented.sources.length}`);
  console.log(`  Token estimate: ~${augmented.tokenEstimate}`);
  console.log(`  Context preview:`);
  console.log(`    ${augmented.context.slice(0, 200)}...`);

  // Test 6: Full prompt generation
  console.log('\n📝 Test 6: Prompt Generation');
  const prompt = await rag.createPrompt(
    'Explain the memory architecture',
    'You are a helpful assistant that explains technical concepts clearly.'
  );
  console.log(`  Prompt length: ${prompt.length} chars`);
  console.log(`  First 300 chars:\n    ${prompt.slice(0, 300).replace(/\n/g, '\n    ')}...`);

  // Stats
  console.log('\n📊 Final Statistics:');
  const ragStats = rag.getStats();
  console.log(`  Total documents: ${ragStats.documents}`);
  console.log(`  Total chunks: ${ragStats.vectorStoreStats.totalDocuments}`);
  console.log(`  Namespaces: ${ragStats.vectorStoreStats.namespaces.join(', ') || 'default'}`);

  // Cleanup
  console.log('\n🧹 Cleanup...');
  store.clear();
  rag.clear();
  console.log('✅ Done!\n');
}

main().catch(console.error);
