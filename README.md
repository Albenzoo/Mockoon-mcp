[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

# mockoon-mcp

An MCP server that lets AI assistants (Claude, GitHub Copilot, Cursor, etc.) create and manage [Mockoon](https://mockoon.com/) mock APIs through natural language.

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Mockoon Desktop or Mockoon CLI](https://mockoon.com/download/)
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

---

## How It Works

The server communicates via **stdio** (JSON-RPC 2.0). It reads and writes Mockoon's environment JSON files directly, no REST API involved.

Changes made by the MCP server are reflected in Mockoon Desktop automatically if the **Environment file watcher** is enabled. Go to **Application → Settings** and set it to **Auto** for silent reloads.

---

## License

MIT — see [LICENSE](LICENSE).
