import { MCPServer, MCPExecutor } from '../core/interfaces';

export class MCPManager implements MCPExecutor {
  private servers: Map<string, MCPServer> = new Map();

  async registerServer(server: MCPServer): Promise<void> {
    await server.connect();
    this.servers.set(server.id, server);
  }

  async executeTool(
    serverId: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`MCP server '${serverId}' not registered.`);
    }
    const tool = server.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in MCP server '${serverId}'.`);
    }
    return tool.execute(params);
  }

  getServer(id: string): MCPServer | undefined {
    return this.servers.get(id);
  }

  listServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  async dispose(): Promise<void> {
    for (const server of this.servers.values()) {
      await server.disconnect();
    }
    this.servers.clear();
  }
}
