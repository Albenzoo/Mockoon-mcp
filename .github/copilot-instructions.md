# Copilot Instructions — mockoon-mcp-server

## Commands

```bash
npm run build      # compile TypeScript → dist/
npm run dev        # run src/index.ts directly with tsx (no build required)
npm start          # run dist/index.js (requires build)
```

No automated tests. To manually verify the MCP server responds correctly:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```

## Key dependencies

| Package | Version | Notes |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.27.1 | MCP server + stdio transport |
| `@mockoon/commons` | ^9.5.0 | `Environment`, `Route`, `DataBucket`, enums |
| `zod` | ^4.3.6 | **Zod v4** — some APIs differ from v3 |
| `typescript` | ^5.9.3 | target ES2022, moduleResolution Node16 |
| `tsx` | ^4.21.0 | dev runner (no build required) |

## Architecture

This is an **MCP server** (Model Context Protocol) that exposes AI tools to control Mockoon. It communicates via `stdio` (JSON-RPC 2.0) — it does not expose any HTTP port of its own.

```
src/index.ts                  ← entry point: creates McpServer, registers server tools
                                (start_server, stop_server, list_running_servers),
                                imports and calls all registerXxxTools(), connects StdioServerTransport
src/tools/environments.ts     ← tools: list_environments, create_environment, delete_environment
src/tools/routes.ts           ← tools: list_routes, get_route, create_route, create_route_with_responses,
                                        bulk_create_routes, update_route, duplicate_route, delete_route,
                                        add_route_response, set_default_response, get_default_response
src/tools/templates.ts        ← tools: list_templates, create_template, update_template, delete_template
src/mockoon/fileManager.ts    ← reads/writes Mockoon JSON files on disk
src/mockoon/processManager.ts ← starts/stops mockoon-cli processes (in-memory Map<environmentId, ChildProcess>)
```

**Data flow**: every tool reads/modifies the `.json` files in Mockoon's storage directory directly. No Mockoon REST API is used — it's pure file I/O.

## Key Conventions

### Tool registration
Always use `server.registerTool()` — `server.tool()` is deprecated since SDK v1.x:

```ts
server.registerTool("tool_name", {
  description: "...",
  inputSchema: { param: z.string().describe("...") },
}, async ({ param }) => {
  return { content: [{ type: "text", text: "result" }] };
});
```

### Error responses
Return `isError: true` alongside the content when an operation fails:

```ts
return { content: [{ type: "text", text: "error message" }], isError: true };
```

### Read-modify-write pattern
All Mockoon modifications follow this pattern:

```ts
const filePath = findEnvironmentFile(STORAGE_DIR, environmentId);
const env = readEnvironment(filePath);
// ... mutate env ...
writeEnvironment(filePath, env);
```

`findEnvironmentFile` returns `null` if the environment is not found — always check before reading.

### Mockoon Desktop visibility
When adding a route, **both** `routes` and `rootChildren` must be updated, otherwise the route does not appear in the desktop UI:

```ts
env.routes.push(newRoute);
env.rootChildren.push({ type: "route", uuid: routeUuid });
```

Similarly, when deleting a route, remove it from both arrays.

### Shared response schema (`responseSchema`)
`src/tools/routes.ts` defines a module-level `responseSchema` (Zod object) and a `buildResponse()` helper used by `create_route`, `create_route_with_responses`, `bulk_create_routes` and `add_route_response`. When adding new route tools that construct responses, reuse these helpers instead of duplicating the response shape.

Key fields in `responseSchema`:
- `statusCode`, `body`, `label`, `contentType`, `headers[]`
- `rules[]` — each rule has `target`, `modifier`, `value`, `invert`, `operator`
- `rulesOperator` — `"AND"` | `"OR"`
- `isDefault` — if `true`, all other responses in the route are demoted

`buildRoute()` helper assembles a valid `Route` object from method, endpoint, documentation and a responses array.

### Route tools overview
| Tool | Description |
|---|---|
| `list_routes` | Lists all routes with UUID, method, endpoint, response count |
| `get_route` | Full detail of one route: all responses with rules, headers, body |
| `create_route` | Creates a route with a single default response |
| `create_route_with_responses` | Creates a route + N responses in one call |
| `bulk_create_routes` | Creates N routes in one call (scaffolding) |
| `update_route` | Updates method/endpoint/documentation and/or default response fields |
| `duplicate_route` | Clones a route with new UUIDs, appends "(copy)" to documentation |
| `delete_route` | Deletes a route and removes it from `rootChildren` |
| `add_route_response` | Adds a conditional/alternative response to an existing route |
| `set_default_response` | Changes which response is marked `default: true` |
| `get_default_response` | Returns the current default response (quick inspect) |

> `update_route_body` and `update_route_headers` have been removed — use `update_route` instead.

### Route shape (`@mockoon/commons` v9)
Required fields when constructing a `Route` object:

```ts
import { Route, RouteType, Methods, BodyTypes } from "@mockoon/commons";

const route: Route = {
  uuid: routeUuid,
  type: RouteType.HTTP,
  documentation: "",
  method: method as Methods,
  endpoint: "path/without/leading/slash",
  responses: [ /* at least one, see below */ ],
  responseMode: null,
  streamingMode: null,      // required in v9
  streamingInterval: 0,     // required in v9
};
```

Each response inside `responses` must include (among others): `uuid`, `body`, `latency`, `statusCode`, `label`, `headers`, `bodyType: BodyTypes.INLINE`, `filePath`, `databucketID`, `sendFileAsBody`, `rules`, `rulesOperator`, `disableTemplating`, `fallbackTo404`, `default`, `crudKey`, `callbacks`.

### DataBucket shape (`@mockoon/commons` v9)
`DataBucket` requires **two separate IDs**:

```ts
import { DataBucket } from "@mockoon/commons";

const bucket: DataBucket = {
  uuid: uuidv4(),   // full UUID (used to reference this bucket from routes)
  id: shortId(),    // short 6-char uppercase ID (e.g. "A3BX9F"), used internally by Mockoon
  name,
  documentation: "",
  value,
};
```

Use the local `shortId()` helper (present in `templates.ts`) to generate the short ID.

### UUID generation
Each `tools/*.ts` file has a local `uuidv4()` using `Math.random()`. Do not use Node's `crypto` module for UUID generation.

```ts
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
```

### STORAGE_DIR
Each file in `src/tools/` and `src/index.ts` initialises its own constant:

```ts
const STORAGE_DIR = process.env.MOCKOON_STORAGE_DIR ?? getDefaultMockoonDir();
```

`getDefaultMockoonDir()` resolves to:
- **Windows**: `%APPDATA%\mockoon\storage`
- **Linux/macOS**: `~/.config/mockoon/storage`

The `MOCKOON_STORAGE_DIR` environment variable overrides the default path.

### ESM module
The project uses `"type": "module"` and `moduleResolution: Node16`. All internal imports must include the `.js` extension (even though source files are `.ts`):

```ts
import { foo } from "./bar.js"; // ✅
import { foo } from "./bar";    // ❌ breaks at runtime
```

### Zod v4 note
The project uses **Zod v4** (`zod@^4.x`). The schema API is largely the same as v3, but be aware of breaking changes (e.g. `z.object().extend()` behaviour, error formatting). When in doubt, refer to the Zod v4 migration guide.

## Adding a new tool group

1. Create `src/tools/groupName.ts` with a `registerGroupNameTools(server: McpServer)` function
2. Import and call it in `src/index.ts`
3. Use `findEnvironmentFile` + `readEnvironment` + `writeEnvironment` from `fileManager.js`
4. Define a module-level `STORAGE_DIR` constant (same pattern as other tool files)
5. Add local `uuidv4()` if UUIDs are needed
