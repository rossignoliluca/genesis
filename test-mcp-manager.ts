/**
 * Test MCP Client Manager
 *
 * Run with: npx tsx test-mcp-manager.ts
 */

import { getMCPManager, initializeMCPManager, MCPTool } from './src/mcp/client-manager.js';

async function main() {
  console.log('🔌 Genesis MCP Client Manager Test\n');
  console.log('=' .repeat(50));

  // Initialize manager (loads config from .mcp.json)
  console.log('\n📂 Loading server configurations...');
  const manager = await initializeMCPManager({
    logCalls: true,
    autoConnect: false, // We'll connect manually for testing
  });

  // List configured servers
  const servers = manager.getServers();
  console.log(`\n📋 Configured servers (${servers.length}):`);
  for (const server of servers) {
    const envStatus = server.requiredEnv
      ? (server.requiredEnv.some(v => process.env[v]) ? '✅' : '❌ needs ' + server.requiredEnv.join('/'))
      : '✅';
    console.log(`  - ${server.name}: ${server.description || 'No description'} ${envStatus}`);
  }

  // Try connecting to a server that doesn't need API keys
  console.log('\n🔗 Connecting to context7 (no API key needed)...');

  try {
    const startTime = Date.now();
    await manager.connect('context7');
    console.log(`✅ Connected in ${Date.now() - startTime}ms`);

    // Discover tools
    const tools = manager.getServerTools('context7');
    console.log(`\n🛠️  Discovered ${tools.length} tools:`);
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
    }

    // Try calling a tool
    console.log('\n📞 Calling resolve-library-id for "react"...');
    const result = await manager.callTool('context7', 'resolve-library-id', {
      libraryName: 'react',
      query: 'React hooks documentation'
    });
    console.log('📦 Result:', JSON.stringify(result, null, 2).slice(0, 500));

  } catch (error) {
    console.error('❌ Connection failed:', error instanceof Error ? error.message : error);
  }

  // Show aggregated tools
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`  Connected servers: ${manager.getConnectedServers().length}`);
  console.log(`  Available tools: ${manager.getAllTools().length}`);
  console.log(`  Available resources: ${manager.getAllResources().length}`);
  console.log(`  Available prompts: ${manager.getAllPrompts().length}`);

  // Cleanup
  console.log('\n🧹 Disconnecting...');
  await manager.disconnectAll();
  console.log('✅ Done!\n');
}

main().catch(console.error);
