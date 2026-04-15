[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/mockoon-mcp)](https://www.npmjs.com/package/mockoon-mcp)
[![npm downloads](https://img.shields.io/npm/dw/mockoon-mcp)](https://www.npmjs.com/package/mockoon-mcp)

# mockoon-mcp

An MCP server that lets AI assistants (Claude, GitHub Copilot, Cursor, etc.) create and manage [Mockoon](https://mockoon.com/) mock APIs through natural language.

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Mockoon Desktop](https://mockoon.com/download/) — for managing environment files via the UI
- [Mockoon CLI](https://mockoon.com/cli/) *(optional)* — required only if you want to use the `start_server` / `stop_server` tools to start mock servers programmatically (`npm install -g @mockoon/cli`)

---

## Configuration

No installation needed. Configure your AI client using `npx`:

### VS Code / GitHub Copilot

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "mockoon": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mockoon-mcp@latest"]
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mockoon": {
      "command": "npx",
      "args": ["-y", "mockoon-mcp@latest"]
    }
  }
}
```

### Cursor

Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "mockoon": {
      "command": "npx",
      "args": ["-y", "mockoon-mcp@latest"]
    }
  }
}
```

### Environment variables

| Variable              | Description                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| `MOCKOON_STORAGE_DIR` | Override the primary storage directory (default: Mockoon Desktop's storage folder) |
| `MOCKOON_DATA_DIRS`   | Semicolon-separated list of additional directories to search for environment files |

Default storage path:

- **Windows**: `%APPDATA%\mockoon\storage`
- **macOS/Linux**: `~/.config/mockoon/storage`

Example:

```json
"env": {
  "MOCKOON_DATA_DIRS": "/path/to/dir1;/path/to/dir2"
}
```

---

## Available Tools

### Environments

| Tool                 | Description                                   |
| -------------------- | --------------------------------------------- |
| `list_environments`  | List all environments with file path and port |
| `create_environment` | Create a new environment                      |
| `delete_environment` | Permanently delete an environment file        |

### Routes

| Tool                          | Description                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| `list_routes`                 | List all routes in an environment (UUID, method, endpoint, response count) |
| `get_route`                   | Inspect a single route with all responses, rules, headers and body         |
| `create_route`                | Create a route with a single default response                              |
| `create_route_with_responses` | Create a route + N responses (default + conditionals) in one call          |
| `bulk_create_routes`          | Create N routes in one call — ideal for scaffolding an entire API          |
| `update_route`                | Update method, endpoint, documentation and/or default response fields      |
| `duplicate_route`             | Clone a route (all responses included) with new UUIDs                      |
| `delete_route`                | Delete a route and all its responses                                       |
| `add_route_response`          | Add a conditional/alternative response to an existing route                |
| `set_default_response`        | Change which response is marked as default                                 |
| `get_default_response`        | Return the current default response (quick inspect)                        |

### Databuckets (Templates)

| Tool              | Description                            |
| ----------------- | -------------------------------------- |
| `list_templates`  | List all databuckets in an environment |
| `create_template` | Create a new databucket                |
| `update_template` | Update the content of a databucket     |
| `delete_template` | Delete a databucket                    |

### Server

| Tool                   | Description                             |
| ---------------------- | --------------------------------------- |
| `start_server`         | Start a mock server for an environment  |
| `stop_server`          | Stop a running mock server              |
| `list_running_servers` | List all currently running mock servers |

> **Note:** `start_server` and `stop_server` require [Mockoon CLI](https://mockoon.com/cli/) to be installed globally (`npm install -g @mockoon/cli`). If you only use Mockoon Desktop, these tools will not work — but all other tools (environments, routes, databuckets) work without CLI.

---

## Example Prompts

Here are some example phrases you can say to your AI assistant to interact with Mockoon via this MCP server:

**Exploring environments and routes**

- *"List all available Mockoon environments."*
- *"Show me all the routes in the Taccuino environment."*
- *"Get the full detail of route `GET /users/:id`, including all responses and rules."*

**Creating routes**

- *"Create a `GET /products` route in the Demo API environment that returns a JSON array of 3 products with status 200."*
- *"Add a `POST /auth/login` route with two responses: 200 with a token body and 401 Unauthorized."*
- *"Scaffold a full CRUD API for a `Task` resource under `/tasks` in the Demo environment."*

**Updating and managing routes**

- *"Change the default response of `GET /users` to return status 204 with an empty body."*
- *"Duplicate the `GET /orders` route."*
- *"Delete the `DELETE /legacy/endpoint` route from the environment."*
- *"Add a conditional 403 response to `POST /documents` that triggers when the `X-Role` header equals `guest`."*

**Databuckets**

- *"Create a databucket called `UserList` in the Demo API with a JSON array of 5 fake users."*
- *"Update the `ProductCatalog` databucket with a new list of items."*

**Server management**

- *"Start the mock server for the Taccuino environment."*
- *"Stop all running mock servers."*
- *"Which Mockoon environments are currently running?"*

---

## How It Works

The server communicates via **stdio** (JSON-RPC 2.0). It reads and writes Mockoon's environment JSON files directly, no REST API involved.

Changes made by the MCP server are reflected in Mockoon Desktop automatically if the **Environment file watcher** is enabled. Go to **Application → Settings** and set it to **Auto** for silent reloads.

---

## License

MIT — see [LICENSE](LICENSE).
