import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Route, RouteType, Methods, BodyTypes } from "@mockoon/commons";
import {
  readEnvironment,
  writeEnvironment,
  findEnvironmentFile,
} from "../mockoon/fileManager.js";
import { STORAGE_DIRS, uuidv4 } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// Shared schema for a single response definition (reused across tools)
// ---------------------------------------------------------------------------
const responseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).default(200).describe("HTTP status code"),
  body: z.string().default("").describe("Response body (plain text or JSON string)"),
  label: z.string().default("").describe("Label for this response (optional)"),
  contentType: z.string().default("application/json").describe("Content-Type header value"),
  headers: z.array(
    z.object({
      key: z.string().describe("Header name"),
      value: z.string().describe("Header value"),
    })
  ).default([]).describe("Additional headers (excluding Content-Type)"),
  rules: z.array(
    z.object({
      target: z.enum(["body", "query", "header", "cookie", "params", "path", "method", "request_number", "global_var", "data_bucket", "templating"]).describe("Rule target"),
      modifier: z.string().describe("Modifier (e.g. query param name, header name)"),
      value: z.string().describe("Value to match"),
      invert: z.boolean().default(false).describe("Invert the rule"),
      operator: z.enum(["equals", "regex", "regex_i", "null", "empty_array", "array_includes", "valid_json_schema"]).describe("Comparison operator"),
    })
  ).default([]).describe("Activation rules for this response"),
  rulesOperator: z.enum(["AND", "OR"]).default("OR").describe("Logical operator between rules"),
  isDefault: z.boolean().default(false).describe("Mark this response as the default (demotes all others)"),
});

type ResponseDef = z.infer<typeof responseSchema>;

function buildResponse(def: ResponseDef, forceDefault = false) {
  return {
    uuid: uuidv4(),
    body: def.body,
    latency: 0,
    statusCode: def.statusCode,
    label: def.label,
    headers: [
      { key: "Content-Type", value: def.contentType },
      ...def.headers.map((h) => ({ key: h.key, value: h.value })),
    ],
    bodyType: BodyTypes.INLINE,
    filePath: "",
    databucketID: "",
    sendFileAsBody: false,
    rules: def.rules.map((r) => ({
      target: r.target as any,
      modifier: r.modifier,
      value: r.value,
      invert: r.invert,
      operator: r.operator as any,
    })),
    rulesOperator: def.rulesOperator as any,
    disableTemplating: false,
    fallbackTo404: false,
    default: forceDefault || def.isDefault,
    crudKey: "id",
    callbacks: [],
  };
}

function buildRoute(
  method: string,
  endpoint: string,
  documentation: string,
  responses: ReturnType<typeof buildResponse>[]
): Route {
  return {
    uuid: uuidv4(),
    type: RouteType.HTTP,
    documentation,
    method: method as Methods,
    endpoint: endpoint.replace(/^\//, ""),
    responses,
    responseMode: null,
    streamingMode: null,
    streamingInterval: 0,
  };
}

export function registerRouteTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // list_routes — List all routes in an environment
  // ---------------------------------------------------------------------------
  server.registerTool(
    "list_routes",
    {
      description: "List all routes in a Mockoon environment with their UUIDs, method, endpoint and number of responses.",
      inputSchema: { environmentId: z.uuid().describe("Environment UUID") },
    },
    async ({ environmentId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      if (env.routes.length === 0) {
        return { content: [{ type: "text", text: "No routes configured." }] };
      }

      const list = env.routes
        .map((r) => `- [${r.uuid}] ${r.method.toUpperCase()} /${r.endpoint}  (${r.responses.length} response(s))`)
        .join("\n");
      return { content: [{ type: "text", text: list }] };
    }
  );

  // ---------------------------------------------------------------------------
  // get_route — Inspect a single route with all its responses
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_route",
    {
      description: "Return full details of a single route including all responses (status codes, labels, rules, headers, body).",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("Route UUID"),
      },
    },
    async ({ environmentId, routeId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const route = env.routes.find((r) => r.uuid === routeId);
      if (!route) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      const responsesText = route.responses.map((resp, i) => {
        const hdrs = resp.headers.map((h) => `      ${h.key}: ${h.value}`).join("\n");
        const rules = resp.rules.length
          ? resp.rules.map((ru: any) => `      [${ru.invert ? "NOT " : ""}${ru.target}.${ru.modifier} ${ru.operator} "${ru.value}"]`).join("\n")
          : "      (none)";
        return [
          `  Response ${i + 1}${resp.default ? " [DEFAULT]" : ""}`,
          `    ID: ${resp.uuid}`,
          `    Label: ${resp.label || "(none)"}`,
          `    Status: ${resp.statusCode}`,
          `    Headers:\n${hdrs || "      (none)"}`,
          `    Rules (${resp.rulesOperator}):\n${rules}`,
          `    Body: ${resp.body ? resp.body.substring(0, 200) + (resp.body.length > 200 ? "…" : "") : "(empty)"}`,
        ].join("\n");
      }).join("\n\n");

      const text = [
        `Route ID: ${route.uuid}`,
        `${route.method.toUpperCase()} /${route.endpoint}`,
        `Documentation: ${route.documentation || "(none)"}`,
        `Responses (${route.responses.length}):`,
        responsesText,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  // ---------------------------------------------------------------------------
  // create_route — Create a route with a single default response
  // ---------------------------------------------------------------------------
  server.registerTool(
    "create_route",
    {
      description: "Create a new HTTP route with a single default response. Use create_route_with_responses to add multiple responses in one call.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        method: z.enum(["get", "post", "put", "patch", "delete", "head", "options"]).describe("HTTP method"),
        endpoint: z.string().describe("Route path without leading slash (e.g. users/:id)"),
        documentation: z.string().default("").describe("Optional documentation / description for the route"),
        statusCode: z.number().int().min(100).max(599).default(200).describe("HTTP status code"),
        body: z.string().default("").describe("Response body (plain text or JSON string)"),
        contentType: z.string().default("application/json").describe("Content-Type header value"),
        headers: z.array(
          z.object({
            key: z.string().describe("Header name"),
            value: z.string().describe("Header value"),
          })
        ).default([]).describe("Additional response headers (excluding Content-Type)"),
      },
    },
    async ({ environmentId, method, endpoint, documentation, statusCode, body, contentType, headers }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const defaultResp = buildResponse(
        { statusCode, body, label: documentation, contentType, headers, rules: [], rulesOperator: "OR", isDefault: true },
        true
      );
      const route = buildRoute(method, endpoint, documentation, [defaultResp]);

      env.routes.push(route);
      env.rootChildren.push({ type: "route", uuid: route.uuid });
      writeEnvironment(filePath, env);

      return {
        content: [{ type: "text", text: `Route created: ${method.toUpperCase()} /${endpoint.replace(/^\//, "")}\nRoute ID: ${route.uuid}` }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // create_route_with_responses — Create a route with N responses in one call
  // ---------------------------------------------------------------------------
  server.registerTool(
    "create_route_with_responses",
    {
      description: "Create a new HTTP route together with all its responses (default + conditionals) in a single call. The first response in the list is treated as the default unless one has isDefault=true.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        method: z.enum(["get", "post", "put", "patch", "delete", "head", "options"]).describe("HTTP method"),
        endpoint: z.string().describe("Route path without leading slash (e.g. users/:id)"),
        documentation: z.string().default("").describe("Optional route description"),
        responses: z.array(responseSchema).min(1).describe("Array of responses. First one becomes default unless isDefault is set on another."),
      },
    },
    async ({ environmentId, method, endpoint, documentation, responses }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);

      const hasExplicitDefault = responses.some((r) => r.isDefault);
      const builtResponses = responses.map((r, i) =>
        buildResponse(r, !hasExplicitDefault && i === 0)
      );

      const route = buildRoute(method, endpoint, documentation, builtResponses);
      env.routes.push(route);
      env.rootChildren.push({ type: "route", uuid: route.uuid });
      writeEnvironment(filePath, env);

      const summary = builtResponses
        .map((r) => `  - [${r.uuid}] ${r.statusCode} ${r.label || ""}${r.default ? " [DEFAULT]" : ""}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Route created: ${method.toUpperCase()} /${endpoint.replace(/^\//, "")}\nRoute ID: ${route.uuid}\nResponses:\n${summary}`,
        }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // update_route — Update method, endpoint, documentation and/or default response
  // ---------------------------------------------------------------------------
  server.registerTool(
    "update_route",
    {
      description: "Update a route's method, endpoint, documentation and/or its default response (body, status code, headers). Only provided fields are changed.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("Route UUID"),
        method: z.enum(["get", "post", "put", "patch", "delete", "head", "options"]).optional().describe("New HTTP method (optional)"),
        endpoint: z.string().optional().describe("New route path (optional)"),
        documentation: z.string().optional().describe("New documentation string (optional)"),
        body: z.string().optional().describe("New body for the default response (optional)"),
        statusCode: z.number().int().min(100).max(599).optional().describe("New status code for the default response (optional)"),
        headers: z.array(
          z.object({
            key: z.string().describe("Header name"),
            value: z.string().describe("Header value"),
          })
        ).optional().describe("New full header list for the default response — replaces existing headers (optional)"),
      },
    },
    async ({ environmentId, routeId, method, endpoint, documentation, body, statusCode, headers }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const route = env.routes.find((r) => r.uuid === routeId);
      if (!route) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      if (method !== undefined) route.method = method as Methods;
      if (endpoint !== undefined) route.endpoint = endpoint.replace(/^\//, "");
      if (documentation !== undefined) route.documentation = documentation;

      if (body !== undefined || statusCode !== undefined || headers !== undefined) {
        const defaultResponse = route.responses.find((r) => r.default) ?? route.responses[0];
        if (!defaultResponse) {
          return { content: [{ type: "text", text: "No response configured for this route." }], isError: true };
        }
        if (body !== undefined) defaultResponse.body = body;
        if (statusCode !== undefined) defaultResponse.statusCode = statusCode;
        if (headers !== undefined) defaultResponse.headers = headers.map((h) => ({ key: h.key, value: h.value }));
      }

      writeEnvironment(filePath, env);
      return { content: [{ type: "text", text: `Route '${routeId}' updated successfully.` }] };
    }
  );

  // ---------------------------------------------------------------------------
  // duplicate_route — Clone a route with new UUIDs
  // ---------------------------------------------------------------------------
  server.registerTool(
    "duplicate_route",
    {
      description: "Clone an existing route (with all its responses) into the same environment. All UUIDs are regenerated. The copy gets '(copy)' appended to its documentation.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("UUID of the route to duplicate"),
      },
    },
    async ({ environmentId, routeId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const source = env.routes.find((r) => r.uuid === routeId);
      if (!source) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      const clonedResponses = source.responses.map((resp) => ({
        ...JSON.parse(JSON.stringify(resp)),
        uuid: uuidv4(),
      }));

      const cloned: Route = {
        ...JSON.parse(JSON.stringify(source)),
        uuid: uuidv4(),
        documentation: source.documentation ? `${source.documentation} (copy)` : "(copy)",
        responses: clonedResponses,
      };

      env.routes.push(cloned);
      env.rootChildren.push({ type: "route", uuid: cloned.uuid });
      writeEnvironment(filePath, env);

      return {
        content: [{ type: "text", text: `Route duplicated: ${cloned.method.toUpperCase()} /${cloned.endpoint}\nNew Route ID: ${cloned.uuid}` }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // bulk_create_routes — Create multiple routes in a single call
  // ---------------------------------------------------------------------------
  server.registerTool(
    "bulk_create_routes",
    {
      description: "Create multiple routes at once. Each item in the array follows the same structure as create_route_with_responses. Ideal for scaffolding an entire API in one call.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routes: z.array(
          z.object({
            method: z.enum(["get", "post", "put", "patch", "delete", "head", "options"]).describe("HTTP method"),
            endpoint: z.string().describe("Route path without leading slash"),
            documentation: z.string().default("").describe("Optional route description"),
            responses: z.array(responseSchema).min(1).describe("Array of responses. First one is default unless one has isDefault=true."),
          })
        ).min(1).describe("List of routes to create"),
      },
    },
    async ({ environmentId, routes }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const created: string[] = [];

      for (const routeDef of routes) {
        const hasExplicitDefault = routeDef.responses.some((r) => r.isDefault);
        const builtResponses = routeDef.responses.map((r, i) =>
          buildResponse(r, !hasExplicitDefault && i === 0)
        );
        const route = buildRoute(routeDef.method, routeDef.endpoint, routeDef.documentation, builtResponses);
        env.routes.push(route);
        env.rootChildren.push({ type: "route", uuid: route.uuid });
        created.push(`  [${route.uuid}] ${routeDef.method.toUpperCase()} /${routeDef.endpoint.replace(/^\//, "")} (${builtResponses.length} response(s))`);
      }

      writeEnvironment(filePath, env);
      return {
        content: [{ type: "text", text: `${created.length} route(s) created:\n${created.join("\n")}` }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // delete_route — Delete a route
  // ---------------------------------------------------------------------------
  server.registerTool(
    "delete_route",
    {
      description: "Delete a route and all its responses from a Mockoon environment.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("UUID of the route to delete"),
      },
    },
    async ({ environmentId, routeId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const before = env.routes.length;
      env.routes = env.routes.filter((r) => r.uuid !== routeId);
      env.rootChildren = env.rootChildren.filter(
        (c) => !(c.type === "route" && c.uuid === routeId)
      );

      if (env.routes.length === before) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      writeEnvironment(filePath, env);
      return { content: [{ type: "text", text: `Route '${routeId}' deleted.` }] };
    }
  );

  // ---------------------------------------------------------------------------
  // add_route_response — Add a response to an existing route
  // ---------------------------------------------------------------------------
  server.registerTool(
    "add_route_response",
    {
      description: "Add a new conditional or alternative response to an existing route. Use rules to define when this response is activated.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("Route UUID"),
        ...responseSchema.shape,
      },
    },
    async ({ environmentId, routeId, statusCode, body, label, contentType, headers, rules, rulesOperator, isDefault }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const route = env.routes.find((r) => r.uuid === routeId);
      if (!route) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      if (isDefault) {
        for (const r of route.responses) r.default = false;
      }

      const built = buildResponse({ statusCode, body, label, contentType, headers, rules, rulesOperator, isDefault });
      route.responses.push(built);

      writeEnvironment(filePath, env);
      return {
        content: [{ type: "text", text: `Response added to route '${routeId}'.\nResponse ID: ${built.uuid}` }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // set_default_response — Change which response is marked as default
  // ---------------------------------------------------------------------------
  server.registerTool(
    "set_default_response",
    {
      description: "Set an existing response as the default for a route (demotes all other responses). Use get_route to list response UUIDs.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("Route UUID"),
        responseId: z.uuid().describe("UUID of the response to make default"),
      },
    },
    async ({ environmentId, routeId, responseId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const route = env.routes.find((r) => r.uuid === routeId);
      if (!route) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      const target = route.responses.find((r) => r.uuid === responseId);
      if (!target) {
        return { content: [{ type: "text", text: `Response '${responseId}' not found in route '${routeId}'.` }], isError: true };
      }

      for (const r of route.responses) {
        r.default = r.uuid === responseId;
      }

      writeEnvironment(filePath, env);
      return {
        content: [{ type: "text", text: `Response '${responseId}' set as default for route '${routeId}'.` }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // get_default_response — Inspect the current default response of a route
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_default_response",
    {
      description: "Return the current default response of a route (status code, headers, body). Use get_route for full details including all responses.",
      inputSchema: {
        environmentId: z.uuid().describe("Environment UUID"),
        routeId: z.uuid().describe("Route UUID"),
      },
    },
    async ({ environmentId, routeId }) => {
      const filePath = findEnvironmentFile(STORAGE_DIRS, environmentId);
      if (!filePath) {
        return { content: [{ type: "text", text: `Environment '${environmentId}' not found.` }], isError: true };
      }

      const env = readEnvironment(filePath);
      const route = env.routes.find((r) => r.uuid === routeId);
      if (!route) {
        return { content: [{ type: "text", text: `Route '${routeId}' not found.` }], isError: true };
      }

      const defaultResponse = route.responses.find((r) => r.default) ?? route.responses[0];
      if (!defaultResponse) {
        return { content: [{ type: "text", text: "No response configured for this route." }], isError: true };
      }

      const hdrs = defaultResponse.headers.map((h) => `  ${h.key}: ${h.value}`).join("\n");
      const text = [
        `Response ID: ${defaultResponse.uuid}`,
        `Label: ${defaultResponse.label || "(none)"}`,
        `Status: ${defaultResponse.statusCode}`,
        `Headers:\n${hdrs || "  (none)"}`,
        `Body:\n${defaultResponse.body || "  (empty)"}`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );
}



