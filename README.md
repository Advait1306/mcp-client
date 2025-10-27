# Universal MCP Client

A comprehensive, interactive CLI client for connecting to any Model Context Protocol (MCP) server. Supports multiple transport types and provides a user-friendly menu system for exploring and interacting with MCP servers.

## Features

- **Multiple Transport Support**
  - `stdio` - Connect to local MCP servers running as processes
  - `Streamable HTTP` - Connect to HTTP-based MCP servers using HTTP POST + SSE streaming (recommended for HTTP servers)
  - `SSE` - Legacy Server-Sent Events only transport (deprecated)
  - `WebSocket` - (Coming soon)

- **Interactive Menu System**
  - Add and manage multiple MCP server configurations
  - Browse server capabilities, tools, prompts, and resources
  - Call tools with interactive parameter input
  - Read resources with formatted output
  - Use prompts with argument support

- **OAuth2 Authentication**
  - Automatic OAuth2 flow for servers that require authentication
  - Dynamic client registration (RFC 7591)
  - Token refresh support
  - Credential persistence

## Prerequisites

- Node.js 17 or higher
- npm package manager

## Installation

```bash
npm install
npm run build
```

## Usage

Start the interactive menu:

```bash
npm start
```

## Adding Servers

### stdio Server (Local Process)

Example: Local filesystem MCP server

```
Server name: Filesystem
Description: Local filesystem access
Command: npx
Arguments: -y @modelcontextprotocol/server-filesystem /path/to/directory
```

### Streamable HTTP Server

Example: Linear MCP server

```
Server name: Linear
Description: Linear project management
URL: https://mcp.linear.app/mcp
Requires authentication: Yes
Authentication type: OAuth2
```

Example: Custom server with Bearer token

```
Server name: My Custom Server
Description: Custom MCP server
URL: https://api.example.com/mcp
Requires authentication: Yes
Authentication type: Bearer Token
Bearer token: your-token-here
```

### SSE Server (Deprecated)

SSE transport is deprecated. Use Streamable HTTP for HTTP-based servers instead.

If you need to connect to a legacy SSE-only server:

```
Server name: Legacy Server
Description: Old SSE server
URL: https://legacy.example.com/mcp
Requires authentication: No
```

## Server Configuration

Server configurations are stored in `mcp-servers.json` in the project root. You can also manually edit this file if needed.

Example configuration:

```json
[
  {
    "id": "srv_1234567890_abc123",
    "name": "Filesystem",
    "description": "Local filesystem access",
    "transport": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Documents"]
    },
    "createdAt": 1234567890000,
    "lastUsed": 1234567890000
  },
  {
    "id": "srv_0987654321_xyz789",
    "name": "Linear",
    "description": "Linear project management",
    "transport": {
      "type": "streamable-http",
      "url": "https://mcp.linear.app/mcp",
      "requiresAuth": true,
      "authType": "oauth2"
    },
    "createdAt": 1234567890000,
    "lastUsed": 1234567890000
  }
]
```

## Available MCP Servers

Here are some MCP servers you can connect to:

### Official Servers

- **Filesystem**: `npx -y @modelcontextprotocol/server-filesystem <directory>`
- **GitHub**: `npx -y @modelcontextprotocol/server-github`
- **GitLab**: `npx -y @modelcontextprotocol/server-gitlab`
- **Google Drive**: `npx -y @modelcontextprotocol/server-gdrive`
- **Slack**: `npx -y @modelcontextprotocol/server-slack`
- **PostgreSQL**: `npx -y @modelcontextprotocol/server-postgres <connection-string>`

### Third-party Servers

- **Linear**: `https://mcp.linear.app/mcp` (Streamable HTTP with OAuth2)

## Features Walkthrough

### 1. Main Menu

When you start the application, you'll see the main menu:

```
╔═══════════════════════════════════════════╗
║   Universal MCP Client Manager           ║
╚═══════════════════════════════════════════╝

? What would you like to do?
  🔌 Connect to a server
  ➕ Add new server
  📝 Manage servers
  🚪 Exit
```

### 2. Connecting to a Server

Select a configured server to connect. The client will:
- Establish connection using the configured transport
- Handle authentication if required
- Display server capabilities
- Open the server interaction menu

### 3. Server Interaction Menu

Once connected, you can:

```
╔═══════════════════════════════════════════╗
║   Connected to: Server Name               ║
╚═══════════════════════════════════════════╝

📦 Server: server-name v1.0.0

✨ Capabilities:
  Tools: ✓
  Resources: ✓
  Prompts: ✓

? What would you like to do?
  🔧 Browse Tools
  📚 Browse Resources
  💬 Browse Prompts
  ℹ️  View Server Info
  ← Disconnect
```

### 4. Browse and Use Tools

- View available tools with descriptions
- See input schemas for each tool
- Call tools with interactive parameter input
- View formatted results

### 5. Browse and Read Resources

- List available resources with URIs
- View resource metadata (MIME type, description)
- Read resource contents
- View formatted output

### 6. Browse and Use Prompts

- View available prompts with descriptions
- See required and optional arguments
- Use prompts with interactive argument input
- View prompt results

## Authentication

For servers requiring OAuth2 authentication:

1. The client will automatically discover OAuth2 metadata
2. Register a dynamic client (if needed)
3. Open your browser for authorization
4. Handle the callback and exchange for tokens
5. Store credentials securely in `auth-credentials.json`
6. Automatically refresh expired tokens

## Project Structure

```
src/
├── index.ts                  # Main entry point
├── menu-system.ts            # Interactive menu interface
├── universal-mcp-client.ts   # Universal MCP client implementation
├── server-config.ts          # Server configuration management
├── oauth2-client.ts          # OAuth2 authentication
└── credential-storage.ts     # Credential persistence
```

## Development

```bash
# Build the project
npm run build

# Run in development mode (rebuilds and runs)
npm run dev
```

## Security

- Uses PKCE for OAuth2 authorization code flow
- Credentials are stored locally in `auth-credentials.json`
- Access tokens are short-lived and automatically refreshed
- State parameter prevents CSRF attacks
- All communication uses HTTPS

## License

MIT
