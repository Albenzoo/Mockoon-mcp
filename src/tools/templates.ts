import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DataBucket } from "@mockoon/commons";
import {
  getDefaultMockoonDir,
  getExtraDataDirs,
  readEnvironment,
  writeEnvironment,
  findEnvironmentFile,
} from "../mockoon/fileManager.js";

const STORAGE_DIRS = [
  process.env.MOCKOON_STORAGE_DIR ?? getDefaultMockoonDir(),
  ...getExtraDataDirs(),
];

export function registerTemplateTools(server: McpServer): void {
  // List all databuckets in an environment
  server.registerTool(
    "list_templates",
    {
      description: "List all databuckets (data templates) in a Mockoon environment",
      inputSchema: { environmentId: z.string().uuid().describe("Environment UUID") },
    },
    async ({ environmentId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      if (!env.data || env.data.length === 0) {
        return { content: [{ type: "text", text: "No databuckets configured." }] };
      }

      const list = env.data.map((d) => `- [${d.uuid}] ${d.name}`).join("\n");
      return { content: [{ type: "text", text: list }] };
    }
  );

  // Create a new databucket
  server.registerTool(
    "create_template",
    {
      description: "Create a new databucket (data template) in a Mockoon environment",
      inputSchema: {
        environmentId: z.string().uuid().describe("Environment UUID"),
        name: z.string().describe("Databucket name"),
        value: z.string().describe("JSON content or Handlebars template for the databucket"),
      },
    },
    async ({ environmentId, name, value }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);

      const newBucket: DataBucket = {
        uuid: uuidv4(),
        id: shortId(),
        name,
        documentation: "",
        value,
      };

      env.data = env.data ?? [];
      env.data.push(newBucket);
      writeEnvironment(filePath, env);

      return {
        content: [{ type: "text", text: `Databucket '${name}' created with ID: ${newBucket.uuid}` }],
      };
    }
  );

  // Update an existing databucket
  server.registerTool(
    "update_template",
    {
      description: "Update the content of an existing databucket",
      inputSchema: {
        environmentId: z.string().uuid().describe("Environment UUID"),
        templateId: z.string().uuid().describe("Databucket UUID"),
        value: z.string().describe("New databucket value"),
      },
    },
    async ({ environmentId, templateId, value }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const bucket = env.data?.find((d) => d.uuid === templateId);
      if (!bucket) {
        return { content: [{ type: "text", text: `Databucket '${templateId}' not found.` }], isError: true };
      }

      bucket.value = value;
      writeEnvironment(filePath, env);
      return { content: [{ type: "text", text: `Databucket '${bucket.name}' updated.` }] };
    }
  );

  // Delete a databucket
  server.registerTool(
    "delete_template",
    {
      description: "Delete a databucket from a Mockoon environment",
      inputSchema: {
        environmentId: z.string().uuid().describe("Environment UUID"),
        templateId: z.string().uuid().describe("UUID of the databucket to delete"),
      },
    },
    async ({ environmentId, templateId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const before = env.data?.length ?? 0;
      env.data = (env.data ?? []).filter((d) => d.uuid !== templateId);

      if ((env.data?.length ?? 0) === before) {
        return { content: [{ type: "text", text: `Databucket '${templateId}' not found.` }], isError: true };
      }

      writeEnvironment(filePath, env);
      return { content: [{ type: "text", text: `Databucket '${templateId}' deleted.` }] };
    }
  );
}

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function shortId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
