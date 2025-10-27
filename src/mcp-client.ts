import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OAuth2Client } from './oauth2-client.js';
import { StoredCredentials } from './credential-storage.js';

export class LinearMCPClient {
  private client: Client;
  private oauth2Client: OAuth2Client;
  private transport?: StreamableHTTPClientTransport;
  private mcpServerUrl = 'https://mcp.linear.app/mcp';

  constructor() {
    this.client = new Client(
      {
        name: 'linear-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    this.oauth2Client = new OAuth2Client();
  }

  /**
   * Authenticate with Linear MCP server
   */
  async authenticate(): Promise<StoredCredentials> {
    console.log('🔍 Checking for stored credentials...');

    // Check if we have valid stored credentials
    let credentials = await this.oauth2Client.getStoredCredentials();

    if (credentials) {
      console.log('✓ Found stored credentials');

      // Check if token is expired
      if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
        console.log('⚠ Access token expired, refreshing...');

        if (credentials.refreshToken) {
          try {
            // Discover metadata to get token endpoint
            const metadata = await this.oauth2Client.discoverMetadata(this.mcpServerUrl);
            credentials = await this.oauth2Client.refreshAccessToken(
              metadata.token_endpoint,
              credentials.refreshToken,
              credentials.clientId,
              credentials.clientSecret
            );
          } catch (error) {
            console.error('Failed to refresh token, re-authenticating...');
            credentials = await this.performFullAuth();
          }
        } else {
          console.log('No refresh token available, re-authenticating...');
          credentials = await this.performFullAuth();
        }
      }

      return credentials;
    }

    // No stored credentials, perform full authentication
    console.log('No stored credentials found, starting authentication flow...');
    return await this.performFullAuth();
  }

  /**
   * Perform full OAuth2 authentication flow with dynamic client registration
   */
  private async performFullAuth(): Promise<StoredCredentials> {
    console.log('\n📡 Discovering OAuth2 metadata...');
    const metadata = await this.oauth2Client.discoverMetadata(this.mcpServerUrl);

    console.log('✓ Metadata discovered');
    console.log('  Authorization endpoint:', metadata.authorization_endpoint);
    console.log('  Token endpoint:', metadata.token_endpoint);

    let clientId: string;
    let clientSecret: string | undefined;
    let registrationResponse: any;

    // Check if we have a previously registered client
    const storedCreds = await this.oauth2Client.getStoredCredentials();
    if (storedCreds?.registrationResponse) {
      console.log('\n📝 Using previously registered client');
      registrationResponse = storedCreds.registrationResponse;
      clientId = registrationResponse.client_id;
      clientSecret = registrationResponse.client_secret;
    } else if (metadata.registration_endpoint) {
      console.log('\n📝 Registering new OAuth2 client...');
      registrationResponse = await this.oauth2Client.registerClient(
        metadata.registration_endpoint
      );
      clientId = registrationResponse.client_id;
      clientSecret = registrationResponse.client_secret;
    } else {
      throw new Error('No registration endpoint found and no stored client credentials');
    }

    console.log('\n🔐 Starting authorization flow...');
    const credentials = await this.oauth2Client.authorize(
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      clientId,
      clientSecret
    );

    // Store registration response for future use
    credentials.registrationResponse = registrationResponse;
    await this.oauth2Client.getStoredCredentials();

    console.log('✓ Authentication complete!\n');

    return credentials;
  }

  /**
   * Connect to Linear MCP server
   */
  async connect(): Promise<void> {
    const credentials = await this.authenticate();

    console.log('🔌 Connecting to Linear MCP server...');

    // Create custom fetch function that adds Authorization header
    const customFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${credentials.accessToken}`);

      return fetch(input, {
        ...init,
        headers,
      });
    };

    // Create Streamable HTTP transport with custom fetch that includes auth
    this.transport = new StreamableHTTPClientTransport(
      new URL(this.mcpServerUrl),
      {
        // Custom fetch for all HTTP requests (GET and POST)
        fetch: customFetch,
        // Also add Authorization header directly to requests
        requestInit: {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        },
      }
    );

    // Connect to server
    await this.client.connect(this.transport);

    console.log('✓ Connected to Linear MCP server!\n');
  }

  /**
   * Get server capabilities after connecting
   */
  getServerCapabilities() {
    return this.client.getServerCapabilities();
  }

  /**
   * Get server version information
   */
  getServerVersion() {
    return this.client.getServerVersion();
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<void> {
    const result = await this.client.listTools();

    console.log('📦 Available tools:');
    if (result.tools.length === 0) {
      console.log('  No tools available');
      return;
    }

    result.tools.forEach((tool, index) => {
      console.log(`\n${index + 1}. ${tool.name}`);
      console.log(`   Description: ${tool.description || 'No description'}`);
      if (tool.inputSchema) {
        console.log(`   Input schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
      }
    });
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<void> {
    const result = await this.client.listResources();

    console.log('\n📚 Available resources:');
    if (result.resources.length === 0) {
      console.log('  No resources available');
      return;
    }

    result.resources.forEach((resource, index) => {
      console.log(`\n${index + 1}. ${resource.name}`);
      console.log(`   URI: ${resource.uri}`);
      console.log(`   Description: ${resource.description || 'No description'}`);
      console.log(`   MIME type: ${resource.mimeType || 'Not specified'}`);
    });
  }

  /**
   * List available prompts from the MCP server
   */
  async listPrompts(): Promise<void> {
    const result = await this.client.listPrompts();

    console.log('\n💬 Available prompts:');
    if (result.prompts.length === 0) {
      console.log('  No prompts available');
      return;
    }

    result.prompts.forEach((prompt, index) => {
      console.log(`\n${index + 1}. ${prompt.name}`);
      console.log(`   Description: ${prompt.description || 'No description'}`);
    });
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, args: any): Promise<any> {
    console.log(`\n🔧 Calling tool: ${toolName}`);
    console.log(`   Arguments: ${JSON.stringify(args, null, 2)}`);

    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    console.log(`\n✓ Tool result:`);
    console.log(JSON.stringify(result, null, 2));

    return result;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      console.log('✓ Disconnected from Linear MCP server');
    }
  }

  /**
   * Clear stored credentials (logout)
   */
  async logout(): Promise<void> {
    await this.oauth2Client.clearCredentials();
    console.log('✓ Logged out and cleared credentials');
  }
}
