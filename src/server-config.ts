import fs from "fs/promises";
import path from "path";

export type TransportType = "stdio" | "streamable-http" | "sse" | "websocket";

export interface StdioTransportConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface StreamableHTTPTransportConfig {
  type: "streamable-http";
  url: string;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  authType?: "oauth2" | "bearer";
  // Manual OAuth2 client credentials (for providers that don't support dynamic registration)
  clientId?: string;
  clientSecret?: string;
}

export interface SSETransportConfig {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  authType?: "oauth2" | "bearer";
  // Manual OAuth2 client credentials (for providers that don't support dynamic registration)
  clientId?: string;
  clientSecret?: string;
}

export interface WebSocketTransportConfig {
  type: "websocket";
  url: string;
  headers?: Record<string, string>;
}

export type TransportConfig =
  | StdioTransportConfig
  | StreamableHTTPTransportConfig
  | SSETransportConfig
  | WebSocketTransportConfig;

export interface ServerConfig {
  id: string;
  name: string;
  description?: string;
  transport: TransportConfig;
  createdAt: number;
  lastUsed?: number;
}

export class ServerConfigManager {
  private configPath: string;
  private servers: Map<string, ServerConfig>;

  constructor(configPath: string = "./mcp-servers.json") {
    this.configPath = path.resolve(configPath);
    this.servers = new Map();
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, "utf-8");
      const configs: ServerConfig[] = JSON.parse(data);
      this.servers = new Map(configs.map((config) => [config.id, config]));
    } catch (error) {
      // File doesn't exist or is invalid, start with empty config
      this.servers = new Map();
    }
  }

  async save(): Promise<void> {
    const configs = Array.from(this.servers.values());
    await fs.writeFile(
      this.configPath,
      JSON.stringify(configs, null, 2),
      "utf-8"
    );
  }

  async addServer(
    config: Omit<ServerConfig, "id" | "createdAt">
  ): Promise<ServerConfig> {
    const id = this.generateId();
    const serverConfig: ServerConfig = {
      ...config,
      id,
      createdAt: Date.now(),
    };
    this.servers.set(id, serverConfig);
    await this.save();
    return serverConfig;
  }

  async updateServer(
    id: string,
    updates: Partial<ServerConfig>
  ): Promise<ServerConfig | null> {
    const server = this.servers.get(id);
    if (!server) {
      return null;
    }
    const updated = { ...server, ...updates, id };
    this.servers.set(id, updated);
    await this.save();
    return updated;
  }

  async removeServer(id: string): Promise<boolean> {
    const deleted = this.servers.delete(id);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  getServer(id: string): ServerConfig | null {
    return this.servers.get(id) || null;
  }

  getAllServers(): ServerConfig[] {
    return Array.from(this.servers.values()).sort((a, b) => {
      // Sort by last used (most recent first), then by creation date
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed - a.lastUsed;
      }
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return b.createdAt - a.createdAt;
    });
  }

  async markAsUsed(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (server) {
      server.lastUsed = Date.now();
      await this.save();
    }
  }

  private generateId(): string {
    return `srv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
