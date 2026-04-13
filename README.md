[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

# mockoon-mcp-server

An MCP server that lets AI assistants (Claude, GitHub Copilot, Cursor, etc.) create and manage [Mockoon](https://mockoon.com/) mock APIs through natural language.

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Mockoon Desktop](https://mockoon.com/download/) (optional, to visualise environments)
- [`@mockoon/cli`](https://mockoon.com/cli/) — only if you use `start_server` / `stop_server`

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
      "args": ["-y", "mockoon-mcp"]
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
      "args": ["-y", "mockoon-mcp"]
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
      "args": ["-y", "mockoon-mcp"]
    }
  }
}
```

### Environment variables

| Variable | Description |
| --- | --- |
| `MOCKOON_STORAGE_DIR` | Override the primary storage directory (default: Mockoon Desktop's storage folder) |
| `MOCKOON_DATA_DIRS` | Semicolon-separated list of additional directories to search for environment files |

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

| Tool | Description |
| --- | --- |
| `list_environments` | List all environments (with file path) |
| `create_environment` | Create a new environment |
| `delete_environment` | Delete an environment |
| `list_routes` | List routes in an environment |
| `create_route` | Create a new HTTP route |
| `update_route_body` | Update response body / status code |
| `update_route_headers` | Replace response headers of a route |
| `delete_route` | Delete a route |
| `list_templates` | List databuckets |
| `create_template` | Create a databucket |
| `update_template` | Update a databucket |
| `delete_template` | Delete a databucket |
| `start_server` | Start a mock server |
| `stop_server` | Stop a mock server |
| `list_running_servers` | List running mock servers |

---

## How It Works

The server communicates via **stdio** (JSON-RPC 2.0). It reads and writes Mockoon's environment JSON files directly — no REST API involved.

Changes made by the MCP server are reflected in Mockoon Desktop automatically if the **Environment file watcher** is enabled. Go to **Application → Settings** and set it to **Auto** for silent reloads.

---

## License

MIT — see [LICENSE](LICENSE).

