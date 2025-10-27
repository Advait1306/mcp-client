import inquirer from 'inquirer';
import { ServerConfigManager, ServerConfig, TransportType } from './server-config.js';
import { UniversalMCPClient } from './universal-mcp-client.js';

export class MenuSystem {
  private configManager: ServerConfigManager;
  private currentClient?: UniversalMCPClient;
  private currentServer?: ServerConfig;

  constructor() {
    this.configManager = new ServerConfigManager();
  }

  async start(): Promise<void> {
    await this.configManager.load();
    await this.showMainMenu();
  }

  private async showMainMenu(): Promise<void> {
    while (true) {
      console.clear();
      console.log('╔═══════════════════════════════════════════╗');
      console.log('║   Universal MCP Client Manager           ║');
      console.log('╚═══════════════════════════════════════════╝\n');

      const servers = this.configManager.getAllServers();

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🔌 Connect to a server', value: 'connect' },
            { name: '➕ Add new server', value: 'add' },
            { name: '📝 Manage servers', value: 'manage' },
            { name: '🚪 Exit', value: 'exit' },
          ],
        },
      ]);

      switch (action) {
        case 'connect':
          await this.showServerSelection();
          break;
        case 'add':
          await this.addNewServer();
          break;
        case 'manage':
          await this.manageServers();
          break;
        case 'exit':
          return;
      }
    }
  }

  private async showServerSelection(): Promise<void> {
    const servers = this.configManager.getAllServers();

    if (servers.length === 0) {
      console.log('\n⚠ No servers configured. Add one first!');
      await this.waitForKeyPress();
      return;
    }

    const { serverId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'serverId',
        message: 'Select a server to connect to:',
        choices: [
          ...servers.map(server => ({
            name: `${server.name} (${server.transport.type})`,
            value: server.id,
          })),
          { name: '← Back', value: null },
        ],
      },
    ]);

    if (!serverId) return;

    const server = this.configManager.getServer(serverId);
    if (!server) {
      console.log('\n❌ Server not found');
      await this.waitForKeyPress();
      return;
    }

    await this.connectToServer(server);
  }

  private async connectToServer(server: ServerConfig): Promise<void> {
    this.currentServer = server;
    this.currentClient = new UniversalMCPClient(server);

    try {
      console.log(`\n🔌 Connecting to ${server.name}...`);
      await this.currentClient.connect();
      console.log('✓ Connected successfully!\n');

      await this.configManager.markAsUsed(server.id);
      await this.showServerMenu();
    } catch (error) {
      console.error('\n❌ Connection failed:', error instanceof Error ? error.message : error);
      await this.waitForKeyPress();
    } finally {
      if (this.currentClient) {
        await this.currentClient.disconnect();
        this.currentClient = undefined;
        this.currentServer = undefined;
      }
    }
  }

  private async showServerMenu(): Promise<void> {
    if (!this.currentClient || !this.currentServer) return;

    while (true) {
      console.clear();
      console.log(`╔═══════════════════════════════════════════╗`);
      console.log(`║   Connected to: ${this.currentServer.name.padEnd(24)} ║`);
      console.log(`╚═══════════════════════════════════════════╝\n`);

      const capabilities = this.currentClient.getServerCapabilities();
      const version = this.currentClient.getServerVersion();

      if (version) {
        console.log(`📦 Server: ${version.name} v${version.version}`);
      }

      console.log('\n✨ Capabilities:');
      console.log(`  Tools: ${capabilities?.tools ? '✓' : '✗'}`);
      console.log(`  Resources: ${capabilities?.resources ? '✓' : '✗'}`);
      console.log(`  Prompts: ${capabilities?.prompts ? '✓' : '✗'}`);
      console.log('');

      const choices = [];

      if (capabilities?.tools) {
        choices.push({ name: '🔧 Browse Tools', value: 'tools' });
      }
      if (capabilities?.resources) {
        choices.push({ name: '📚 Browse Resources', value: 'resources' });
      }
      if (capabilities?.prompts) {
        choices.push({ name: '💬 Browse Prompts', value: 'prompts' });
      }

      choices.push(
        { name: 'ℹ️  View Server Info', value: 'info' },
        { name: '← Disconnect', value: 'disconnect' }
      );

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices,
        },
      ]);

      switch (action) {
        case 'tools':
          await this.browseTools();
          break;
        case 'resources':
          await this.browseResources();
          break;
        case 'prompts':
          await this.browsePrompts();
          break;
        case 'info':
          await this.showServerInfo();
          break;
        case 'disconnect':
          return;
      }
    }
  }

  private async browseTools(): Promise<void> {
    if (!this.currentClient) return;

    try {
      console.log('\n🔧 Loading tools...');
      const tools = await this.currentClient.listTools();

      if (tools.length === 0) {
        console.log('\n📦 No tools available');
        await this.waitForKeyPress();
        return;
      }

      const { toolName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'toolName',
          message: 'Select a tool:',
          choices: [
            ...tools.map(tool => ({
              name: `${tool.name} - ${tool.description || 'No description'}`,
              value: tool.name,
            })),
            { name: '← Back', value: null },
          ],
        },
      ]);

      if (!toolName) return;

      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        await this.showToolDetails(tool);
      }
    } catch (error) {
      console.error('\n❌ Error loading tools:', error instanceof Error ? error.message : error);
      await this.waitForKeyPress();
    }
  }

  private async showToolDetails(tool: any): Promise<void> {
    console.clear();
    console.log(`╔═══════════════════════════════════════════╗`);
    console.log(`║   Tool: ${tool.name.padEnd(32)} ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);

    console.log(`Description: ${tool.description || 'No description'}`);
    console.log('\nInput Schema:');
    console.log(JSON.stringify(tool.inputSchema, null, 2));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '▶️  Call this tool', value: 'call' },
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'call') {
      await this.callTool(tool);
    }
  }

  private async callTool(tool: any): Promise<void> {
    if (!this.currentClient) return;

    try {
      // Get required parameters from schema
      const schema = tool.inputSchema;
      const args: any = {};

      if (schema?.properties) {
        console.log('\n📝 Enter tool parameters:\n');

        for (const [key, prop] of Object.entries(schema.properties)) {
          const propSchema = prop as any;
          const isRequired = schema.required?.includes(key);

          const { value } = await inquirer.prompt([
            {
              type: 'input',
              name: 'value',
              message: `${key}${isRequired ? ' (required)' : ' (optional)'}: ${propSchema.description || ''}`,
              validate: (input: string) => {
                if (isRequired && !input.trim()) {
                  return 'This parameter is required';
                }
                return true;
              },
            },
          ]);

          if (value.trim()) {
            // Try to parse as JSON if it looks like an object or array
            if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
              try {
                args[key] = JSON.parse(value);
              } catch {
                args[key] = value;
              }
            } else {
              args[key] = value;
            }
          }
        }
      }

      console.log('\n⚙️  Calling tool...');
      const result = await this.currentClient.callTool(tool.name, args);

      console.log('\n✅ Tool Result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\n❌ Error calling tool:', error instanceof Error ? error.message : error);
    }

    await this.waitForKeyPress();
  }

  private async browseResources(): Promise<void> {
    if (!this.currentClient) return;

    try {
      console.log('\n📚 Loading resources...');
      const resources = await this.currentClient.listResources();

      if (resources.length === 0) {
        console.log('\n📚 No resources available');
        await this.waitForKeyPress();
        return;
      }

      const { resourceUri } = await inquirer.prompt([
        {
          type: 'list',
          name: 'resourceUri',
          message: 'Select a resource:',
          choices: [
            ...resources.map(resource => ({
              name: `${resource.name} - ${resource.description || resource.uri}`,
              value: resource.uri,
            })),
            { name: '← Back', value: null },
          ],
        },
      ]);

      if (!resourceUri) return;

      const resource = resources.find(r => r.uri === resourceUri);
      if (resource) {
        await this.showResourceDetails(resource);
      }
    } catch (error) {
      console.error('\n❌ Error loading resources:', error instanceof Error ? error.message : error);
      await this.waitForKeyPress();
    }
  }

  private async showResourceDetails(resource: any): Promise<void> {
    console.clear();
    console.log(`╔═══════════════════════════════════════════╗`);
    console.log(`║   Resource: ${resource.name.padEnd(29)} ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);

    console.log(`URI: ${resource.uri}`);
    console.log(`Description: ${resource.description || 'No description'}`);
    console.log(`MIME Type: ${resource.mimeType || 'Not specified'}`);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📖 Read this resource', value: 'read' },
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'read') {
      await this.readResource(resource.uri);
    }
  }

  private async readResource(uri: string): Promise<void> {
    if (!this.currentClient) return;

    try {
      console.log('\n📖 Reading resource...');
      const result = await this.currentClient.readResource(uri);

      console.log('\n✅ Resource Content:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\n❌ Error reading resource:', error instanceof Error ? error.message : error);
    }

    await this.waitForKeyPress();
  }

  private async browsePrompts(): Promise<void> {
    if (!this.currentClient) return;

    try {
      console.log('\n💬 Loading prompts...');
      const prompts = await this.currentClient.listPrompts();

      if (prompts.length === 0) {
        console.log('\n💬 No prompts available');
        await this.waitForKeyPress();
        return;
      }

      const { promptName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'promptName',
          message: 'Select a prompt:',
          choices: [
            ...prompts.map(prompt => ({
              name: `${prompt.name} - ${prompt.description || 'No description'}`,
              value: prompt.name,
            })),
            { name: '← Back', value: null },
          ],
        },
      ]);

      if (!promptName) return;

      const prompt = prompts.find(p => p.name === promptName);
      if (prompt) {
        await this.showPromptDetails(prompt);
      }
    } catch (error) {
      console.error('\n❌ Error loading prompts:', error instanceof Error ? error.message : error);
      await this.waitForKeyPress();
    }
  }

  private async showPromptDetails(prompt: any): Promise<void> {
    console.clear();
    console.log(`╔═══════════════════════════════════════════╗`);
    console.log(`║   Prompt: ${prompt.name.padEnd(31)} ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);

    console.log(`Description: ${prompt.description || 'No description'}`);

    if (prompt.arguments && prompt.arguments.length > 0) {
      console.log('\nArguments:');
      prompt.arguments.forEach((arg: any) => {
        console.log(`  - ${arg.name}: ${arg.description || 'No description'}${arg.required ? ' (required)' : ''}`);
      });
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '▶️  Use this prompt', value: 'use' },
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'use') {
      await this.usePrompt(prompt);
    }
  }

  private async usePrompt(prompt: any): Promise<void> {
    if (!this.currentClient) return;

    try {
      const args: any = {};

      if (prompt.arguments && prompt.arguments.length > 0) {
        console.log('\n📝 Enter prompt arguments:\n');

        for (const arg of prompt.arguments) {
          const { value } = await inquirer.prompt([
            {
              type: 'input',
              name: 'value',
              message: `${arg.name}${arg.required ? ' (required)' : ' (optional)'}: ${arg.description || ''}`,
              validate: (input: string) => {
                if (arg.required && !input.trim()) {
                  return 'This argument is required';
                }
                return true;
              },
            },
          ]);

          if (value.trim()) {
            args[arg.name] = value;
          }
        }
      }

      console.log('\n⚙️  Getting prompt...');
      const result = await this.currentClient.getPrompt(prompt.name, args);

      console.log('\n✅ Prompt Result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\n❌ Error getting prompt:', error instanceof Error ? error.message : error);
    }

    await this.waitForKeyPress();
  }

  private async showServerInfo(): Promise<void> {
    if (!this.currentClient || !this.currentServer) return;

    console.clear();
    console.log(`╔═══════════════════════════════════════════╗`);
    console.log(`║   Server Information                      ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);

    const version = this.currentClient.getServerVersion();
    const capabilities = this.currentClient.getServerCapabilities();

    console.log('Configuration:');
    console.log(`  Name: ${this.currentServer.name}`);
    console.log(`  Description: ${this.currentServer.description || 'None'}`);
    console.log(`  Transport: ${this.currentServer.transport.type}`);

    if (this.currentServer.transport.type === 'stdio') {
      console.log(`  Command: ${this.currentServer.transport.command}`);
      if (this.currentServer.transport.args) {
        console.log(`  Args: ${this.currentServer.transport.args.join(' ')}`);
      }
    } else if (this.currentServer.transport.type === 'streamable-http' || this.currentServer.transport.type === 'sse') {
      console.log(`  URL: ${this.currentServer.transport.url}`);
      if (this.currentServer.transport.type === 'sse') {
        console.log(`  ⚠️  Note: SSE transport is deprecated`);
      }
    }

    console.log('\nServer:');
    if (version) {
      console.log(`  Name: ${version.name}`);
      console.log(`  Version: ${version.version}`);
    }

    console.log('\nCapabilities:');
    console.log(`  Tools: ${capabilities?.tools ? '✓' : '✗'}`);
    console.log(`  Resources: ${capabilities?.resources ? '✓' : '✗'}`);
    console.log(`  Prompts: ${capabilities?.prompts ? '✓' : '✗'}`);
    console.log(`  Logging: ${capabilities?.logging ? '✓' : '✗'}`);

    await this.waitForKeyPress();
  }

  private async addNewServer(): Promise<void> {
    console.clear();
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║   Add New MCP Server                      ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    const { transportType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'transportType',
        message: 'Select transport type:',
        choices: [
          { name: '🖥️  stdio (Local process)', value: 'stdio' },
          { name: '🌐 Streamable HTTP (HTTP + SSE streaming)', value: 'streamable-http' },
          { name: '⚠️  SSE (DEPRECATED - Server-Sent Events only)', value: 'sse' },
          { name: '← Back', value: null },
        ],
      },
    ]);

    if (!transportType) return;

    if (transportType === 'stdio') {
      await this.addStdioServer();
    } else if (transportType === 'streamable-http') {
      await this.addStreamableHTTPServer();
    } else if (transportType === 'sse') {
      await this.addSSEServer();
    }
  }

  private async addStdioServer(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Server name:',
        validate: (input: string) => input.trim().length > 0 || 'Name is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):',
      },
      {
        type: 'input',
        name: 'command',
        message: 'Command to execute:',
        validate: (input: string) => input.trim().length > 0 || 'Command is required',
      },
      {
        type: 'input',
        name: 'args',
        message: 'Arguments (space-separated, optional):',
      },
    ]);

    const config = {
      name: answers.name,
      description: answers.description || undefined,
      transport: {
        type: 'stdio' as const,
        command: answers.command,
        args: answers.args ? answers.args.split(' ').filter((a: string) => a.length > 0) : undefined,
      },
    };

    await this.configManager.addServer(config);
    console.log('\n✅ Server added successfully!');
    await this.waitForKeyPress();
  }

  private async addStreamableHTTPServer(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Server name:',
        validate: (input: string) => input.trim().length > 0 || 'Name is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):',
      },
      {
        type: 'input',
        name: 'url',
        message: 'Server URL:',
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      },
      {
        type: 'confirm',
        name: 'requiresAuth',
        message: 'Does this server require authentication?',
        default: false,
      },
    ]);

    let authType;
    if (answers.requiresAuth) {
      const authAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'authType',
          message: 'Select authentication type:',
          choices: [
            { name: 'OAuth2', value: 'oauth2' },
            { name: 'Bearer Token', value: 'bearer' },
          ],
        },
      ]);
      authType = authAnswer.authType;
    }

    let headers: Record<string, string> | undefined;
    if (answers.requiresAuth && authType === 'bearer') {
      const tokenAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'token',
          message: 'Bearer token:',
          validate: (input: string) => input.trim().length > 0 || 'Token is required',
        },
      ]);
      headers = { Authorization: `Bearer ${tokenAnswer.token}` };
    }

    const config = {
      name: answers.name,
      description: answers.description || undefined,
      transport: {
        type: 'streamable-http' as const,
        url: answers.url,
        requiresAuth: answers.requiresAuth,
        authType: authType,
        headers,
      },
    };

    await this.configManager.addServer(config);
    console.log('\n✅ Server added successfully!');
    await this.waitForKeyPress();
  }

  private async addSSEServer(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Server name:',
        validate: (input: string) => input.trim().length > 0 || 'Name is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):',
      },
      {
        type: 'input',
        name: 'url',
        message: 'Server URL:',
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      },
      {
        type: 'confirm',
        name: 'requiresAuth',
        message: 'Does this server require authentication?',
        default: false,
      },
    ]);

    let authType;
    if (answers.requiresAuth) {
      const authAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'authType',
          message: 'Select authentication type:',
          choices: [
            { name: 'OAuth2', value: 'oauth2' },
            { name: 'Bearer Token', value: 'bearer' },
          ],
        },
      ]);
      authType = authAnswer.authType;
    }

    let headers: Record<string, string> | undefined;
    if (answers.requiresAuth && authType === 'bearer') {
      const tokenAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'token',
          message: 'Bearer token:',
          validate: (input: string) => input.trim().length > 0 || 'Token is required',
        },
      ]);
      headers = { Authorization: `Bearer ${tokenAnswer.token}` };
    }

    const config = {
      name: answers.name,
      description: answers.description || undefined,
      transport: {
        type: 'sse' as const,
        url: answers.url,
        requiresAuth: answers.requiresAuth,
        authType: authType,
        headers,
      },
    };

    await this.configManager.addServer(config);
    console.log('\n✅ Server added successfully!');
    await this.waitForKeyPress();
  }

  private async manageServers(): Promise<void> {
    while (true) {
      const servers = this.configManager.getAllServers();

      if (servers.length === 0) {
        console.log('\n⚠ No servers configured.');
        await this.waitForKeyPress();
        return;
      }

      const { serverId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'serverId',
          message: 'Select a server to manage:',
          choices: [
            ...servers.map(server => ({
              name: `${server.name} (${server.transport.type})`,
              value: server.id,
            })),
            { name: '← Back', value: null },
          ],
        },
      ]);

      if (!serverId) return;

      const server = this.configManager.getServer(serverId);
      if (!server) continue;

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `Manage ${server.name}:`,
          choices: [
            { name: '🗑️  Delete', value: 'delete' },
            { name: '← Back', value: 'back' },
          ],
        },
      ]);

      if (action === 'delete') {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete "${server.name}"?`,
            default: false,
          },
        ]);

        if (confirm) {
          await this.configManager.removeServer(serverId);
          console.log('\n✅ Server deleted successfully!');
          await this.waitForKeyPress();
        }
      }
    }
  }

  private async waitForKeyPress(): Promise<void> {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...',
      },
    ]);
  }
}
