#!/usr/bin/env node

import { LinearMCPClient } from './mcp-client.js';

async function main() {
  const client = new LinearMCPClient();

  try {
    console.log('🚀 Linear MCP Client\n');
    console.log('='.repeat(50));

    // Handle command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'logout') {
      await client.logout();
      return;
    }

    // Connect to Linear MCP server
    await client.connect();

    // Get server information
    console.log('='.repeat(50));
    console.log('\n📋 Server Information\n');

    const serverVersion = client.getServerVersion();
    if (serverVersion) {
      console.log(`Server: ${serverVersion.name} v${serverVersion.version}`);
    }

    const capabilities = client.getServerCapabilities();
    console.log('\n✨ Server Capabilities:');

    if (capabilities) {
      console.log(`  Tools: ${capabilities.tools ? '✓' : '✗'}`);
      console.log(`  Resources: ${capabilities.resources ? '✓' : '✗'}`);
      console.log(`  Prompts: ${capabilities.prompts ? '✓' : '✗'}`);
      console.log(`  Logging: ${capabilities.logging ? '✓' : '✗'}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n📦 Available Features\n');

    // List tools if supported
    if (capabilities?.tools) {
      await client.listTools();
    } else {
      console.log('📦 Tools: Not supported by this server');
    }

    // List resources if supported
    if (capabilities?.resources) {
      await client.listResources();
    } else {
      console.log('\n📚 Resources: Not supported by this server');
    }

    // List prompts if supported
    if (capabilities?.prompts) {
      await client.listPrompts();
    } else {
      console.log('\n💬 Prompts: Not supported by this server');
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n✓ Successfully connected to Linear MCP server!');
    console.log('\nYou can now interact with the MCP server.');
    console.log('The authentication credentials have been saved.');
    console.log('Next time you run this, you won\'t need to authenticate again.\n');

    console.log('To logout and clear credentials, run: npm start logout\n');

    // Disconnect
    await client.disconnect();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
