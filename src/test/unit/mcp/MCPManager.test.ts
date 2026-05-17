import { MCPManager } from '../../../mcp/MCPManager';
import { MCPServer, MCPTool } from '../../../core/interfaces';

function makeTool(name: string, result: unknown = { ok: true }): MCPTool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: {},
    execute: jest.fn().mockResolvedValue(result)
  };
}

function makeServer(id: string, tools: MCPTool[] = []): jest.Mocked<MCPServer> {
  return {
    id,
    name: `Server ${id}`,
    description: `Server ${id} description`,
    tools,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined)
  };
}

describe('MCPManager', () => {
  let manager: MCPManager;

  beforeEach(() => { manager = new MCPManager(); });

  describe('Given an empty manager', () => {
    it('When listing servers, Then returns an empty array', () => {
      expect(manager.listServers()).toEqual([]);
    });

    it('When getting a non-existent server, Then returns undefined', () => {
      expect(manager.getServer('missing')).toBeUndefined();
    });

    it('When executing a tool on missing server, Then throws descriptive error', async () => {
      await expect(manager.executeTool('missing', 'tool', {})).rejects.toThrow("'missing'");
    });
  });

  describe('Given a registered server', () => {
    let server: jest.Mocked<MCPServer>;

    beforeEach(async () => {
      server = makeServer('filesystem', [makeTool('read_file', { content: 'hello' })]);
      await manager.registerServer(server);
    });

    it('When registering, Then calls server.connect()', () => {
      expect(server.connect).toHaveBeenCalledTimes(1);
    });

    it('When listing servers, Then includes the registered server', () => {
      expect(manager.listServers()).toContain(server);
    });

    it('When getting by id, Then returns the server instance', () => {
      expect(manager.getServer('filesystem')).toBe(server);
    });

    it('When executing an existing tool, Then calls tool.execute with params', async () => {
      const result = await manager.executeTool('filesystem', 'read_file', { path: 'foo.ts' });
      expect(result).toEqual({ content: 'hello' });
      expect(server.tools[0].execute).toHaveBeenCalledWith({ path: 'foo.ts' });
    });

    it('When executing a non-existent tool on registered server, Then throws descriptive error', async () => {
      await expect(manager.executeTool('filesystem', 'delete_file', {})).rejects.toThrow("'delete_file'");
    });

    it('When disposing, Then calls disconnect on all servers', async () => {
      await manager.dispose();
      expect(server.disconnect).toHaveBeenCalledTimes(1);
    });

    it('When disposing, Then clears all servers', async () => {
      await manager.dispose();
      expect(manager.listServers()).toHaveLength(0);
    });
  });

  describe('Given multiple registered servers', () => {
    it('When registering two servers, Then can route tools to each independently', async () => {
      const fsTool = makeTool('read_file');
      const gitTool = makeTool('git_status', { status: 'clean' });
      const fsServer = makeServer('filesystem', [fsTool]);
      const gitServer = makeServer('git', [gitTool]);

      await manager.registerServer(fsServer);
      await manager.registerServer(gitServer);

      await manager.executeTool('filesystem', 'read_file', {});
      await manager.executeTool('git', 'git_status', {});

      expect(fsTool.execute).toHaveBeenCalledTimes(1);
      expect(gitTool.execute).toHaveBeenCalledTimes(1);
    });
  });
});