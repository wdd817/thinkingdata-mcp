#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  endpointCatalog,
  endpointCatalogByName,
  searchEndpointCatalog,
} from "./catalog.js";
import { callThinkingData, type BodyMode } from "./client.js";

const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ]),
);

const QueryValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
]);

const QueryObject = z.record(z.string(), QueryValue);
const StringRecord = z.record(z.string(), z.string());

const FilePart = z.object({
  fieldName: z
    .string()
    .describe("Multipart field name, for example file."),
  path: z.string().describe("Absolute or working-directory-relative file path."),
  filename: z.string().optional(),
  contentType: z.string().optional(),
});

const CommonConnectionFields = {
  baseUrl: z
    .string()
    .optional()
    .describe(
      "ThinkingData TE base URL. Defaults to THINKINGDATA_BASE_URL, for example http://ta2:8992.",
    ),
  token: z
    .string()
    .optional()
    .describe(
      "ThinkingData API secret. Defaults to THINKINGDATA_API_SECRET or THINKINGDATA_TOKEN.",
    ),
  timeoutMs: z.number().int().positive().optional(),
  maxBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum response bytes returned to the MCP client. Defaults to 5 MB."),
};

const server = new McpServer({
  name: "thinkingdata-mcp",
  version: "0.1.0",
});

server.registerResource(
  "thinkingdata_openapi_catalog",
  "thinkingdata://openapi/catalog",
  {
    title: "ThinkingData Open API endpoint catalog",
    description: "Endpoint catalog extracted from the ThinkingData TE Open API docs.",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(endpointCatalog, null, 2),
      },
    ],
  }),
);

server.registerResource(
  "thinkingdata_openapi_usage",
  "thinkingdata://openapi/usage",
  {
    title: "ThinkingData MCP usage notes",
    description: "Configuration and request conventions for this MCP server.",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: usageNotes(),
      },
    ],
  }),
);

server.registerTool(
  "thinkingdata_catalog",
  {
    title: "Search ThinkingData Open API catalog",
    description:
      "List or search ThinkingData TE Open API endpoints by name, title, category, or path.",
    inputSchema: {
      query: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
  },
  async ({ query, limit }) => {
    const entries = searchEndpointCatalog(query).slice(0, limit ?? 100);
    return asJson({
      count: entries.length,
      entries,
    });
  },
);

server.registerTool(
  "thinkingdata_request",
  {
    title: "Call ThinkingData Open API",
    description:
      "Generic ThinkingData Open API caller. Use endpointName from thinkingdata_catalog or pass a raw path such as /open/event-analyze.",
    inputSchema: {
      endpointName: z
        .string()
        .optional()
        .describe("Catalog endpoint name. If set, method/path/contentType are inferred."),
      path: z
        .string()
        .optional()
        .describe("Raw API path, for example /open/event-analyze or /querySql."),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
      query: QueryObject.optional().describe("Query-string parameters except token."),
      body: JsonValue.optional().describe("JSON or raw request body."),
      form: QueryObject.optional().describe("Form fields for x-www-form-urlencoded or multipart requests."),
      files: z.array(FilePart).optional(),
      bodyMode: z.enum(["json", "form", "multipart", "raw"]).optional(),
      contentType: z.string().optional(),
      headers: StringRecord.optional(),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async (input) => asJson(await callThinkingData(input)),
);

server.registerTool(
  "thinkingdata_sql_query",
  {
    title: "Run ThinkingData SQL query",
    description:
      "Run the documented synchronous /querySql custom SQL API with form-encoded parameters.",
    inputSchema: {
      sql: z.string(),
      format: z.enum(["json", "csv", "tsv", "json_object"]).optional(),
      timeoutSeconds: z.number().int().positive().optional(),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async ({ sql, format, timeoutSeconds, responseFormat, ...connection }) =>
    asJson(
      await callThinkingData({
        endpointName: "sql_sync_query",
        form: {
          sql,
          format,
          timeoutSeconds,
        },
        responseFormat,
        ...connection,
      }),
    ),
);

server.registerTool(
  "thinkingdata_sql_submit",
  {
    title: "Submit ThinkingData SQL task",
    description:
      "Submit an async SQL task through /open/submit-sql. Use thinkingdata_sql_task_info and thinkingdata_sql_result_page afterward.",
    inputSchema: {
      sql: z.string(),
      format: z.enum(["json", "csv", "tsv", "json_object"]).optional(),
      timeoutSeconds: z.number().int().positive().optional(),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async ({ sql, format, timeoutSeconds, responseFormat, ...connection }) =>
    asJson(
      await callThinkingData({
        endpointName: "sql_submit",
        form: {
          sql,
          format,
          timeoutSeconds,
        },
        responseFormat,
        ...connection,
      }),
    ),
);

server.registerTool(
  "thinkingdata_sql_task_info",
  {
    title: "Get ThinkingData SQL task status",
    description: "Query /open/sql-task-info by taskId.",
    inputSchema: {
      taskId: z.string(),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async ({ taskId, responseFormat, ...connection }) =>
    asJson(
      await callThinkingData({
        endpointName: "sql_task_info",
        query: { taskId },
        responseFormat,
        ...connection,
      }),
    ),
);

server.registerTool(
  "thinkingdata_sql_result_page",
  {
    title: "Get ThinkingData SQL result page",
    description: "Fetch /open/sql-result-page by taskId and optional pageId.",
    inputSchema: {
      taskId: z.string(),
      pageId: z.number().int().nonnegative().optional(),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async ({ taskId, pageId, responseFormat, ...connection }) =>
    asJson(
      await callThinkingData({
        endpointName: "sql_result_page",
        query: { taskId, pageId },
        responseFormat,
        ...connection,
      }),
    ),
);

server.registerTool(
  "thinkingdata_model_query",
  {
    title: "Run ThinkingData model query",
    description:
      "Call a model/metric query endpoint from the catalog, such as event_analyze, retention_analyze, funnel_analyze, user_prop_analyze, metric_list, or metric_data.",
    inputSchema: {
      endpointName: z
        .string()
        .describe("Catalog endpoint name for a model or metric query."),
      body: JsonValue.describe("JSON body exactly as described by the ThinkingData docs."),
      query: QueryObject.optional().describe("Additional query-string parameters."),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async ({ endpointName, body, query, responseFormat, ...connection }) => {
    const endpoint = endpointCatalogByName.get(endpointName);
    if (
      !endpoint ||
      ![
        "模型查询 API",
        "指标查询 API",
      ].includes(endpoint.category)
    ) {
      throw new Error(
        `Endpoint "${endpointName}" is not a model or metric query endpoint.`,
      );
    }

    return asJson(
      await callThinkingData({
        endpointName,
        body,
        query,
        responseFormat,
        ...connection,
      }),
    );
  },
);

server.registerTool(
  "thinkingdata_upload_file",
  {
    title: "Upload file to ThinkingData Open API",
    description:
      "Multipart helper for documented upload endpoints such as datatable_upload_file and user_cluster_import_file.",
    inputSchema: {
      endpointName: z
        .string()
        .describe("Usually datatable_upload_file or user_cluster_import_file."),
      filePath: z.string(),
      fieldName: z.string().optional().describe("Defaults to file."),
      filename: z.string().optional(),
      contentType: z.string().optional(),
      query: QueryObject.optional(),
      form: QueryObject.optional(),
      responseFormat: z.enum(["auto", "json", "text", "base64"]).optional(),
      ...CommonConnectionFields,
    },
  },
  async ({
    endpointName,
    filePath,
    fieldName,
    filename,
    contentType,
    query,
    form,
    responseFormat,
    ...connection
  }) => {
    const endpoint = endpointCatalogByName.get(endpointName);
    if (!endpoint) {
      throw new Error(`Unknown endpointName "${endpointName}".`);
    }

    return asJson(
      await callThinkingData({
        endpointName,
        query,
        form,
        files: [
          {
            fieldName: fieldName ?? "file",
            path: filePath,
            filename,
            contentType,
          },
        ],
        bodyMode: "multipart" satisfies BodyMode,
        responseFormat,
        ...connection,
      }),
    );
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

function asJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function usageNotes() {
  return [
    "# ThinkingData MCP",
    "",
    "Set `THINKINGDATA_BASE_URL` to the TE Open API base URL, for example `http://ta2:8992`.",
    "Set `THINKINGDATA_API_SECRET` to the Open API query secret generated by `ta-tool generate_root_secret` or `ta-tool generate_api_secret -appid ...`.",
    "",
    "Use `thinkingdata_catalog` to find an endpoint name, then call `thinkingdata_request` with that `endpointName`.",
    "For SQL, use `thinkingdata_sql_query` for `/querySql`, or `thinkingdata_sql_submit` plus `thinkingdata_sql_task_info` and `thinkingdata_sql_result_page` for async queries.",
    "",
    "The server redacts `token` in returned URLs, but never put real secrets in prompts unless your MCP client treats tool arguments securely.",
  ].join("\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
