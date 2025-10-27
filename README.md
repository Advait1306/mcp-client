# Linear MCP Client

A Node.js client application that authenticates with Linear's Model Context Protocol (MCP) server using OAuth2 with dynamic client registration.

## Features

- OAuth2 authentication with PKCE (Proof Key for Code Exchange)
- Dynamic client registration (RFC 7591)
- Persistent credential storage
- Automatic token refresh
- Streamable HTTP transport for MCP communication
- Lists available tools, resources, and prompts from Linear's MCP server

## Prerequisites

- Node.js 17 or higher
- npm package manager

## Installation

```bash
npm install
```

## Usage

### First Run (Authentication)

On the first run, the application will:
1. Discover OAuth2 metadata from Linear's MCP server
2. Register a new OAuth2 client dynamically
3. Open your browser for authorization
4. Save your credentials to `auth-credentials.json`

```bash
npm run dev
```

Follow the browser prompts to authorize the application. Once authorized, your credentials will be saved and you won't need to authenticate again.

### Subsequent Runs

After initial authentication, the app will use stored credentials:

```bash
npm start
```

If your access token expires, the app will automatically refresh it using your refresh token.

### Logout

To clear stored credentials and logout:

```bash
npm start logout
```

## How It Works

### OAuth2 Flow

1. **Discovery**: Fetches OAuth2 metadata from `https://mcp.linear.app/mcp/.well-known/oauth-authorization-server`
2. **Client Registration**: Registers a new OAuth2 client using dynamic registration
3. **Authorization**: Opens browser for user to authorize the application
4. **Token Exchange**: Exchanges authorization code for access and refresh tokens
5. **Storage**: Saves credentials to `auth-credentials.json`

### MCP Connection

Once authenticated, the app:
- Creates a Streamable HTTP transport with the Bearer token
- Connects to Linear's MCP server at `https://mcp.linear.app/mcp`
- Lists available tools, resources, and prompts
- Can call tools and interact with Linear's API

## Project Structure

```
src/
├── credential-storage.ts  # Handles saving/loading credentials
├── oauth2-client.ts       # OAuth2 authentication logic
├── mcp-client.ts          # MCP client implementation
└── index.ts               # Main entry point
```

## Security

- Uses PKCE for OAuth2 authorization code flow
- Credentials are stored locally in `auth-credentials.json`
- Access tokens are short-lived and automatically refreshed
- State parameter prevents CSRF attacks
- All communication uses HTTPS

## Technical Details

- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: Streamable HTTP (HTTP POST for sending, HTTP GET with Server-Sent Events for receiving)
- **Auth Method**: OAuth2 with dynamic client registration
- **Token Type**: Bearer tokens
- **PKCE**: SHA-256 code challenge method

## Troubleshooting

### Browser doesn't open automatically
Copy the authorization URL from the terminal and paste it into your browser.

### Port 3000 already in use
The OAuth callback server runs on port 3000. Make sure no other application is using this port.

### Token expired errors
The app should automatically refresh tokens. If this fails, run `npm start logout` and authenticate again.

## License

MIT
