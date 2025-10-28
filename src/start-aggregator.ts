#!/usr/bin/env node

import { AggregatorMCPServer } from "./aggregator-server.js";

async function main() {
  // Get port from command line args or use default
  const port = process.argv[2] ? parseInt(process.argv[2], 10) : 3000;

  if (isNaN(port)) {
    console.error("Error: Invalid port number");
    process.exit(1);
  }

  console.error("Starting MCP Aggregator Server...");
  const server = new AggregatorMCPServer(port);
  await server.start();

  // Keep the process alive
  console.error("Server started successfully. Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
