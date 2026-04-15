#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerEnvironmentTools } from "./tools/environments.js";
import { registerRouteTools } from "./tools/routes.js";
import { registerTemplateTools } from "./tools/templates.js";
import { listRunningServers, startServer, stopServer } from "./mockoon/processManager.js";
import { findEnvironmentFile } from "./mockoon/fileManager.js";
import { STORAGE_DIRS } from "./utils/helpers.js";

const server = new McpServer({
  name: "mockoon-mcp",
  version: "1.0.2",
});

// Register tool groups
registerEnvironmentTools(server);
registerRouteTools(server);
registerTemplateTools(server);

// Start a mock server
server.registerTool(
  "start_server",
  {
    description:
      "Start a Mockoon mock server from a local environment JSON file. Use list_environments to find available file paths. Returns immediately with an error if the server is already running.",
    inputSchema: {
      environmentId: z.string().uuid().describe("UUID of the environment to start"),
      port: z.number().int().optional().describe("Override port (optional)"),
    },
  },
  async ({ environmentId, port }) => {
    const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
    if (!filePath) {
      return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
    }
    try {
      const result = startServer(environmentId, filePath, port);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Failed to start mock server: ${message}` }], isError: true };
    }
  }
);

// Stop a running mock server
server.registerTool(
  "stop_server",
  {
    description: "Stop a running Mockoon mock server. Returns an error message if no server is running for the given environment.",
    inputSchema: { environmentId: z.string().uuid().describe("UUID of the environment to stop") },
  },
  async ({ environmentId }) => {
    const result = stopServer(environmentId);
    return { content: [{ type: "text", text: result }] };
  }
);

// List running mock servers
server.registerTool(
  "list_running_servers",
  { description: "List the UUIDs of all Mockoon environments currently running as mock servers." },
  async () => {
    const running = listRunningServers();
    if (running.length === 0) {
      return { content: [{ type: "text", text: "No mock servers currently running." }] };
    }
    return { content: [{ type: "text", text: running.map((id) => `- ${id}`).join("\n") }] };
  }
);

// Stop all running mock servers on exit
process.on("SIGINT", () => {
  for (const id of listRunningServers()) {
    stopServer(id);
  }
});

// Connect via stdio transport (compatible with Claude Desktop, Cursor, VS Code, Copilot CLI, etc.)
const transport = new StdioServerTransport();
await server.connect(transport);
