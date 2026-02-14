#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

type LoggingMode = "completion" | "time";
type SchemaSource = "default" | "custom";
type PropertySchema = Record<string, unknown>;
type LogRecordProperties = Record<string, PropertySchema>;

interface CliConfig {
  propertiesFile?: string;
  loggingMode: LoggingMode;
}

const TOOL_NAME = "log_work";

const DEFAULT_LOG_RECORD_PROPERTIES: LogRecordProperties = {
  agent_id: { type: "string" },
  timestamp: { type: "string", format: "date-time" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

function parseCliArgs(argv: string[]): CliConfig {
  let propertiesFile: string | undefined;
  let loggingMode: LoggingMode = "completion";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--properties-file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --properties-file");
      }
      propertiesFile = next;
      i += 1;
      continue;
    }

    if (arg === "--logging-mode") {
      const next = argv[i + 1];
      if (next !== "completion" && next !== "time") {
        throw new Error('Invalid value for --logging-mode. Use "completion" or "time".');
      }
      loggingMode = next;
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { propertiesFile, loggingMode };
}

function printHelpAndExit(exitCode: number): never {
  const lines = [
    "Usage: agent-breadcrumbs-mcp-server [options]",
    "",
    "Options:",
    "  --properties-file <path>       JSON file for custom log_record.properties",
    '  --logging-mode <completion|time>  Logging guidance mode (default: "completion")',
    "  -h, --help                     Show help",
  ];

  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(exitCode);
}

function loadLogRecordProperties(propertiesFile?: string): {
  schemaSource: SchemaSource;
  properties: LogRecordProperties;
} {
  if (!propertiesFile) {
    return { schemaSource: "default", properties: DEFAULT_LOG_RECORD_PROPERTIES };
  }

  const absolutePath = path.resolve(process.cwd(), propertiesFile);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Custom properties file must contain a JSON object");
  }

  const asRecord = parsed as Record<string, unknown>;

  // Allow either direct properties object or a wrapper with `properties`.
  const candidate =
    asRecord.properties && typeof asRecord.properties === "object" && !Array.isArray(asRecord.properties)
      ? (asRecord.properties as Record<string, unknown>)
      : asRecord;

  const normalized: LogRecordProperties = {};

  for (const [key, value] of Object.entries(candidate)) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`Custom property "${key}" must be a JSON object`);
    }
    normalized[key] = value as PropertySchema;
  }

  return { schemaSource: "custom", properties: normalized };
}

function buildInputSchema(logRecordProperties: LogRecordProperties): Tool["inputSchema"] {
  return {
    type: "object",
    properties: {
      logging_mode: { type: "string", enum: ["completion", "time"] },
      log_record: {
        type: "object",
        properties: logRecordProperties,
      },
    },
    required: ["log_record"],
  };
}

function buildToolDescription(loggingMode: LoggingMode, schemaSource: SchemaSource): string {
  const modeGuidance =
    loggingMode === "completion"
      ? "Mode=completion: call on meaningful progress/completion."
      : "Mode=time: call periodically when possible (best-effort on unmanaged clients).";

  const schemaGuidance =
    schemaSource === "custom"
      ? "Schema source=custom: persisted fields are defined by inputSchema.properties.log_record.properties."
      : "Schema source=default: persisted fields use the default log_record schema.";

  return `Log agent work. ${modeGuidance} ${schemaGuidance}`;
}

async function main(): Promise<void> {
  const cliConfig = parseCliArgs(process.argv.slice(2));
  const { schemaSource, properties } = loadLogRecordProperties(cliConfig.propertiesFile);

  const logWorkTool: Tool = {
    name: TOOL_NAME,
    description: buildToolDescription(cliConfig.loggingMode, schemaSource),
    inputSchema: buildInputSchema(properties),
  };

  const server = new Server(
    {
      name: "agent-breadcrumbs",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [logWorkTool],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== TOOL_NAME) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const logId = randomUUID();
    const result = { ok: true, log_id: logId };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`agent-breadcrumbs server failed to start: ${message}`);
  process.exit(1);
});
