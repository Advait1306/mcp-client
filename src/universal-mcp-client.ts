import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ServerConfig, TransportConfig } from "./server-config.js";
import { OAuth2Client } from "./oauth2-client.js";
import { StoredCredentials } from "./credential-storage.js";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface ResourceInfo {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface PromptInfo {
  name: string;
  description?: string;
  arguments?: any[];
}

export class UniversalMCPClient {
  private client: Client;
  private transport?: Transport;
  private serverConfig: ServerConfig;
  private oauth2Client?: OAuth2Client;

  constructor(serverConfig: ServerConfig) {
    this.serverConfig = serverConfig;
    this.client = new Client(
      {
        name: "universal-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          roots: {
            listChanged: true,
          },
          sampling: {},
        },
      }
    );
  }

  /**
   * Connect to the MCP server based on transport configuration
   */
  async connect(): Promise<void> {
    const { transport: transportConfig } = this.serverConfig;

    switch (transportConfig.type) {
      case "stdio":
        await this.connectStdio(transportConfig);
        break;
      case "streamable-http":
        await this.connectStreamableHTTP(transportConfig);
        break;
      case "sse":
        await this.connectSSE(transportConfig);
        break;
      case "websocket":
        throw new Error("WebSocket transport not yet implemented");
      default:
        throw new Error(
          `Unknown transport type: ${(transportConfig as any).type}`
        );
    }
  }

  /**
   * Connect using stdio transport (local process)
   */
  private async connectStdio(
    config: TransportConfig & { type: "stdio" }
  ): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: config.env,
    });

    this.transport = transport;
    await this.client.connect(transport);
  }

  /**
   * Connect using Streamable HTTP transport (HTTP POST + SSE for streaming)
   */
  private async connectStreamableHTTP(
    config: TransportConfig & { type: "streamable-http" }
  ): Promise<void> {
    let fetchFunction: typeof fetch = fetch;
    let headers = { ...config.headers };

    // Handle OAuth2 authentication if required
    if (config.requiresAuth && config.authType === "oauth2") {
      this.oauth2Client = new OAuth2Client(this.serverConfig.id);
      const credentials = await this.authenticateOAuth2(
        config.url,
        config.clientId,
        config.clientSecret
      );
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;

      // Create custom fetch that includes auth header
      fetchFunction = async (input, init) => {
        const requestHeaders = new Headers(init?.headers);
        requestHeaders.set(
          "Authorization",
          `Bearer ${credentials.accessToken}`
        );
        return fetch(input, { ...init, headers: requestHeaders });
      };
    } else if (config.headers?.["Authorization"]) {
      // Use provided bearer token
      fetchFunction = async (input, init) => {
        const requestHeaders = new Headers(init?.headers);
        Object.entries(headers).forEach(([key, value]) => {
          requestHeaders.set(key, value);
        });
        return fetch(input, { ...init, headers: requestHeaders });
      };
    }

    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      fetch: fetchFunction,
      requestInit: {
        headers,
      },
    });

    this.transport = transport;
    await this.client.connect(transport);
  }

  /**
   * Connect using SSE transport (deprecated)
   */
  private async connectSSE(
    config: TransportConfig & { type: "sse" }
  ): Promise<void> {
    let fetchFunction: typeof fetch = fetch;
    let headers = { ...config.headers };

    // Handle OAuth2 authentication if required
    if (config.requiresAuth && config.authType === "oauth2") {
      this.oauth2Client = new OAuth2Client(this.serverConfig.id);
      const credentials = await this.authenticateOAuth2(
        config.url,
        config.clientId,
        config.clientSecret
      );
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;

      // Create custom fetch that includes auth header
      fetchFunction = async (input, init) => {
        const requestHeaders = new Headers(init?.headers);
        requestHeaders.set(
          "Authorization",
          `Bearer ${credentials.accessToken}`
        );
        return fetch(input, { ...init, headers: requestHeaders });
      };
    } else if (config.headers?.["Authorization"]) {
      // Use provided bearer token
      fetchFunction = async (input, init) => {
        const requestHeaders = new Headers(init?.headers);
        Object.entries(headers).forEach(([key, value]) => {
          requestHeaders.set(key, value);
        });
        return fetch(input, { ...init, headers: requestHeaders });
      };
    }

    const transport = new SSEClientTransport(new URL(config.url), {
      fetch: fetchFunction,
    });

    this.transport = transport;
    await this.client.connect(transport);
  }

  /**
   * Authenticate using OAuth2
   */
  private async authenticateOAuth2(
    serverUrl: string,
    manualClientId?: string,
    manualClientSecret?: string
  ): Promise<StoredCredentials> {
    if (!this.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }

    console.log("🔍 Checking for stored credentials...");
    let credentials = await this.oauth2Client.getStoredCredentials();

    if (credentials) {
      console.log("✓ Found stored credentials");

      // Check if token is expired
      if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
        console.log("⚠ Access token expired, refreshing...");

        if (credentials.refreshToken) {
          try {
            const metadata = await this.oauth2Client.discoverMetadata(
              serverUrl
            );
            credentials = await this.oauth2Client.refreshAccessToken(
              metadata.token_endpoint,
              credentials.refreshToken,
              credentials.clientId,
              credentials.clientSecret
            );
          } catch (error) {
            console.error("Failed to refresh token, re-authenticating...");
            credentials = await this.performFullAuth(
              serverUrl,
              manualClientId,
              manualClientSecret
            );
          }
        } else {
          console.log("No refresh token available, re-authenticating...");
          credentials = await this.performFullAuth(
            serverUrl,
            manualClientId,
            manualClientSecret
          );
        }
      }

      return credentials;
    }

    console.log("No stored credentials found, starting authentication flow...");
    return await this.performFullAuth(
      serverUrl,
      manualClientId,
      manualClientSecret
    );
  }

  /**
   * Perform full OAuth2 authentication
   */
  private async performFullAuth(
    serverUrl: string,
    manualClientId?: string,
    manualClientSecret?: string
  ): Promise<StoredCredentials> {
    if (!this.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }

    console.log("\n📡 Discovering OAuth2 metadata...");
    const metadata = await this.oauth2Client.discoverMetadata(serverUrl);

    console.log("✓ Metadata discovered");

    let clientId: string;
    let clientSecret: string | undefined;
    let registrationResponse: any;

    const storedCreds = await this.oauth2Client.getStoredCredentials();
    if (storedCreds?.registrationResponse) {
      console.log("\n📝 Using previously registered client");
      registrationResponse = storedCreds.registrationResponse;
      clientId = registrationResponse.client_id;
      clientSecret = registrationResponse.client_secret;
    } else if (manualClientId) {
      // Use manually configured client credentials
      console.log("\n📝 Using manually configured client credentials");
      clientId = manualClientId;
      clientSecret = manualClientSecret;
    } else if (metadata.registration_endpoint) {
      // Try dynamic client registration
      console.log("\n📝 Attempting dynamic client registration...");
      try {
        registrationResponse = await this.oauth2Client.registerClient(
          metadata.registration_endpoint
        );
        clientId = registrationResponse.client_id;
        clientSecret = registrationResponse.client_secret;
        console.log("✓ Client registered successfully");
      } catch (error: any) {
        // Dynamic registration failed - provide helpful instructions
        console.error(
          "\n❌ Dynamic client registration failed:",
          error.message
        );
        console.error(
          "\nThis provider does not support automatic client registration."
        );
        console.error(
          "Please register an OAuth application manually and add the credentials to your config:\n"
        );
        console.error("1. Register an OAuth app with the provider");
        console.error("2. Set redirect URI to: http://localhost:3000/callback");
        console.error(
          "3. Add clientId and clientSecret to your server config\n"
        );
        throw new Error(
          "Dynamic client registration not supported. Manual configuration required."
        );
      }
    } else {
      throw new Error(
        "No registration endpoint found and no manual client credentials provided"
      );
    }

    console.log("\n🔐 Starting authorization flow...");
    const credentials = await this.oauth2Client.authorize(
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      clientId,
      clientSecret
    );

    credentials.registrationResponse = registrationResponse;
    console.log("✓ Authentication complete!\n");

    return credentials;
  }

  /**
   * Get server capabilities
   */
  getServerCapabilities() {
    return this.client.getServerCapabilities();
  }

  /**
   * Get server version
   */
  getServerVersion() {
    return this.client.getServerVersion();
  }

  /**
   * List available tools
   */
  async listTools(): Promise<ToolInfo[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * List available resources
   */
  async listResources(): Promise<ResourceInfo[]> {
    const result = await this.client.listResources();
    return result.resources.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    }));
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<PromptInfo[]> {
    const result = await this.client.listPrompts();
    return result.prompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    }));
  }

  /**
   * Call a tool
   */
  async callTool(toolName: string, args: any): Promise<any> {
    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });
    return result;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    const result = await this.client.readResource({ uri });
    return result;
  }

  /**
   * Get a prompt
   */
  async getPrompt(promptName: string, args?: any): Promise<any> {
    const result = await this.client.getPrompt({
      name: promptName,
      arguments: args,
    });
    return result;
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close();
    }
  }

  /**
   * Clear OAuth2 credentials
   */
  async clearCredentials(): Promise<void> {
    if (this.oauth2Client) {
      await this.oauth2Client.clearCredentials();
    }
  }
}
