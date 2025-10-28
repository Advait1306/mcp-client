#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ServerConfigManager } from "./server-config.js";
import { UniversalMCPClient, ToolInfo, ResourceInfo, PromptInfo } from "./universal-mcp-client.js";
import express from "express";

interface AggregatedTool extends ToolInfo {
  serverId: string;
  originalName: string;
}

interface AggregatedResource extends ResourceInfo {
  serverId: string;
  originalUri: string;
}

interface AggregatedPrompt extends PromptInfo {
  serverId: string;
  originalName: string;
}

export class AggregatorMCPServer {
  private server: Server;
  private clients: Map<string, UniversalMCPClient> = new Map();
  private configManager: ServerConfigManager;
  private tools: Map<string, AggregatedTool> = new Map();
  private resources: Map<string, AggregatedResource> = new Map();
  private prompts: Map<string, AggregatedPrompt> = new Map();
  private port: number;
  private expressApp?: express.Application;

  constructor(port: number = 3000) {
    this.port = port;
    this.configManager = new ServerConfigManager();
    this.server = new Server(
      {
        name: "mcp-aggregator-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const tool = this.tools.get(toolName);

      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      const client = this.clients.get(tool.serverId);
      if (!client) {
        throw new Error(`Client not found for server: ${tool.serverId}`);
      }

      // Call the original tool on the underlying server
      const result = await client.callTool(tool.originalName, request.params.arguments || {});
      return result;
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Array.from(this.resources.values()).map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      };
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resourceUri = request.params.uri;
      const resource = this.resources.get(resourceUri);

      if (!resource) {
        throw new Error(`Resource not found: ${resourceUri}`);
      }

      const client = this.clients.get(resource.serverId);
      if (!client) {
        throw new Error(`Client not found for server: ${resource.serverId}`);
      }

      // Read the original resource from the underlying server
      const result = await client.readResource(resource.originalUri);
      return result;
    });

    // List prompts handler
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: Array.from(this.prompts.values()).map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
      };
    });

    // Get prompt handler
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params.name;
      const prompt = this.prompts.get(promptName);

      if (!prompt) {
        throw new Error(`Prompt not found: ${promptName}`);
      }

      const client = this.clients.get(prompt.serverId);
      if (!client) {
        throw new Error(`Client not found for server: ${prompt.serverId}`);
      }

      // Get the original prompt from the underlying server
      const result = await client.getPrompt(prompt.originalName, request.params.arguments);
      return result;
    });
  }

  async initialize(): Promise<void> {
    console.error("Loading server configurations...");
    await this.configManager.load();
    const servers = this.configManager.getAllServers();

    if (servers.length === 0) {
      console.error("Warning: No servers configured. Add servers first.");
      return;
    }

    console.error(`Found ${servers.length} configured server(s)`);

    // Connect to all servers and aggregate their capabilities
    for (const serverConfig of servers) {
      try {
        console.error(`\nConnecting to ${serverConfig.name}...`);
        const client = new UniversalMCPClient(serverConfig);
        await client.connect();
        console.error(`✓ Connected to ${serverConfig.name}`);

        this.clients.set(serverConfig.id, client);

        // Get capabilities
        const capabilities = client.getServerCapabilities();

        // Aggregate tools
        if (capabilities?.tools) {
          try {
            const tools = await client.listTools();
            console.error(`  Found ${tools.length} tool(s)`);
            for (const tool of tools) {
              const prefixedName = `${serverConfig.id}__${tool.name}`;
              this.tools.set(prefixedName, {
                ...tool,
                name: prefixedName,
                description: `[${serverConfig.name}] ${tool.description || tool.name}`,
                serverId: serverConfig.id,
                originalName: tool.name,
              });
            }
          } catch (error) {
            console.error(`  Error loading tools: ${error instanceof Error ? error.message : error}`);
          }
        }

        // Aggregate resources
        if (capabilities?.resources) {
          try {
            const resources = await client.listResources();
            console.error(`  Found ${resources.length} resource(s)`);
            for (const resource of resources) {
              const prefixedUri = `${serverConfig.id}://${resource.uri}`;
              this.resources.set(prefixedUri, {
                ...resource,
                uri: prefixedUri,
                name: `[${serverConfig.name}] ${resource.name}`,
                serverId: serverConfig.id,
                originalUri: resource.uri,
              });
            }
          } catch (error) {
            console.error(`  Error loading resources: ${error instanceof Error ? error.message : error}`);
          }
        }

        // Aggregate prompts
        if (capabilities?.prompts) {
          try {
            const prompts = await client.listPrompts();
            console.error(`  Found ${prompts.length} prompt(s)`);
            for (const prompt of prompts) {
              const prefixedName = `${serverConfig.id}__${prompt.name}`;
              this.prompts.set(prefixedName, {
                ...prompt,
                name: prefixedName,
                description: `[${serverConfig.name}] ${prompt.description || prompt.name}`,
                serverId: serverConfig.id,
                originalName: prompt.name,
              });
            }
          } catch (error) {
            console.error(`  Error loading prompts: ${error instanceof Error ? error.message : error}`);
          }
        }
      } catch (error) {
        console.error(`✗ Failed to connect to ${serverConfig.name}: ${error instanceof Error ? error.message : error}`);
      }
    }

    console.error(`\n✓ Aggregator initialized with:`);
    console.error(`  ${this.tools.size} tool(s)`);
    console.error(`  ${this.resources.size} resource(s)`);
    console.error(`  ${this.prompts.size} prompt(s)`);
  }

  async start(): Promise<void> {
    await this.initialize();

    // Create Express app
    this.expressApp = express();
    this.expressApp.use(express.json());

    // Add CORS headers
    this.expressApp.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Create StreamableHTTP transport (stateless mode)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await this.server.connect(transport);

    // Hook up the transport to the Express route
    this.expressApp.post("/mcp", (req, res) => {
      transport.handleRequest(req, res, req.body);
    });

    // Start HTTP server
    const httpServer = this.expressApp.listen(this.port, () => {
      console.error(`\n✓ MCP Aggregator Server listening on http://localhost:${this.port}/mcp`);
      console.error(`  Ready to accept connections!`);
    });

    // Handle cleanup on exit
    process.on("SIGINT", async () => {
      console.error("\nReceived SIGINT, shutting down...");
      httpServer.close();
      await this.shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.error("\nReceived SIGTERM, shutting down...");
      httpServer.close();
      await this.shutdown();
      process.exit(0);
    });
  }

  async shutdown(): Promise<void> {
    console.error("\nShutting down aggregator server...");
    for (const [serverId, client] of this.clients.entries()) {
      try {
        await client.disconnect();
        console.error(`✓ Disconnected from ${serverId}`);
      } catch (error) {
        console.error(`✗ Error disconnecting from ${serverId}: ${error instanceof Error ? error.message : error}`);
      }
    }
    await this.server.close();
    console.error("✓ Aggregator server shut down");
  }
}

// Export for use as a module
export default AggregatorMCPServer;
