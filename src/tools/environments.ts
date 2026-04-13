import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Environment } from "@mockoon/commons";
import path from "path";
import {
  getDefaultMockoonDir,
  getExtraDataDirs,
  listEnvironments,
  writeEnvironment,
  findEnvironmentFile,
} from "../mockoon/fileManager.js";

const STORAGE_DIRS = [
  process.env.MOCKOON_STORAGE_DIR ?? getDefaultMockoonDir(),
  ...getExtraDataDirs(),
];

export function registerEnvironmentTools(server: McpServer): void {
  // List all available environments
  server.registerTool(
    "list_environments",
    {
      description:
        "List all local Mockoon environment files. Returns the file path for each environment, which can be passed to start_mock. Searches the default storage directory and any extra directories set via MOCKOON_DATA_DIRS.",
    },
    async () => {
      const envs = listEnvironments(STORAGE_DIRS);
      if (envs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No environments found. Searched directories: ${STORAGE_DIRS.join(", ")}`,
            },
          ],
        };
      }
      const list = envs
        .map((e) => `- [${e.id}] ${e.name} (port: ${e.port}, file: ${e.filePath})`)
        .join("\n");
      return { content: [{ type: "text", text: list }] };
    }
  );

  // Create a new environment
  server.registerTool(
    "create_environment",
    {
      description: "Create a new Mockoon environment",
      inputSchema: {
        name: z.string().describe("Environment name"),
        port: z.number().int().min(1).max(65535).describe("Port for the mock server"),
      },
    },
    async ({ name, port }) => {
      const uuid = uuidv4();
      const env: Environment = {
        uuid,
        lastMigration: 0,
        name,
        endpointPrefix: "",
        latency: 0,
        port,
        hostname: "0.0.0.0",
        routes: [],
        rootChildren: [],
        proxyMode: false,
        proxyHost: "",
        proxyRemovePrefix: false,
        tlsOptions: { enabled: false, type: "CERT", pfxPath: "", certPath: "", keyPath: "", caPath: "", passphrase: "" },
        cors: true,
        headers: [],
        proxyReqHeaders: [],
        proxyResHeaders: [],
        data: [],
        folders: [],
        callbacks: [],
      };

      const filePath = path.join(STORAGE_DIRS[0], `${uuid}.json`);
      writeEnvironment(filePath, env);

      return {
        content: [{ type: "text", text: `Environment '${name}' created with ID: ${uuid}\nFile: ${filePath}` }],
      };
    }
  );

  // Delete an environment
  server.registerTool(
    "delete_environment",
    {
      description: "Delete a Mockoon environment by UUID. The environment file will be permanently removed from disk.",
      inputSchema: { environmentId: z.string().uuid().describe("UUID of the environment to delete") },
    },
    async ({ environmentId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const { unlinkSync } = await import("fs");
      unlinkSync(filePath);
      return { content: [{ type: "text", text: `Environment '${environmentId}' deleted.` }] };
    }
  );
}

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
