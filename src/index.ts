#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import * as AjvFormats from "ajv-formats";
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
type SinkName = "jsonl";
type PropertySchema = Record<string, unknown>;
type LogRecordProperties = Record<string, PropertySchema>;
type JsonSchemaObject = Record<string, unknown>;

interface ToolArguments {
  logging_mode?: LoggingMode;
  log_record: Record<string, unknown>;
}

interface CliConfig {
  propertiesFile?: string;
  loggingMode: LoggingMode;
  sink: SinkName;
  logFilePath: string;
}

interface PersistedRecord {
  log_id: string;
  server_timestamp: string;
  log_record: Record<string, unknown>;
}

interface LogSink {
  write(record: PersistedRecord): Promise<void>;
}

const TOOL_NAME = "log_work";
const DEFAULT_LOG_FILE_PATH = path.join(os.homedir(), ".agent-breadcrumbs", "logs.jsonl");
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_LOG_RECORD_BYTES = 16 * 1024;
const MAX_LOG_RECORD_DEPTH = 8;
const MAX_LOG_RECORD_KEYS = 256;

const DEFAULT_LOG_RECORD_PROPERTIES: LogRecordProperties = {
  agent_id: { type: "string" },
  timestamp: { type: "string", format: "date-time" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

function parseCliArgs(argv: string[]): CliConfig {
  const envLoggingMode = process.env.AGENT_BREADCRUMBS_LOGGING_MODE;
  const envSink = process.env.AGENT_BREADCRUMBS_SINK;
  const envLogFilePath = process.env.AGENT_BREADCRUMBS_LOG_FILE;

  let propertiesFile: string | undefined;
  let loggingMode: LoggingMode =
    envLoggingMode === "time" || envLoggingMode === "completion" ? envLoggingMode : "completion";
  let sink: SinkName = envSink === "jsonl" ? "jsonl" : "jsonl";
  let logFilePath = envLogFilePath ? resolvePath(envLogFilePath) : DEFAULT_LOG_FILE_PATH;

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

    if (arg === "--sink") {
      const next = argv[i + 1];
      if (next !== "jsonl") {
        throw new Error('Invalid value for --sink. Use "jsonl".');
      }
      sink = next;
      i += 1;
      continue;
    }

    if (arg === "--log-file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --log-file");
      }
      logFilePath = resolvePath(next);
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { propertiesFile, loggingMode, sink, logFilePath };
}

function printHelpAndExit(exitCode: number): never {
  const lines = [
    "Usage: agent-breadcrumbs-mcp-server [options]",
    "",
    "Options:",
    "  --properties-file <path>       JSON file for custom log_record.properties",
    '  --logging-mode <completion|time>  Logging guidance mode (default: "completion")',
    '  --sink <jsonl>                 Sink connector to use (default: "jsonl")',
    "  --log-file <path>              JSONL sink output file",
    "",
    "Environment:",
    "  AGENT_BREADCRUMBS_LOGGING_MODE",
    "  AGENT_BREADCRUMBS_SINK",
    "  AGENT_BREADCRUMBS_LOG_FILE",
    "  -h, --help                     Show help",
  ];

  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(exitCode);
}

function resolvePath(value: string): string {
  if (value.startsWith("~")) {
    return path.resolve(os.homedir(), value.slice(1));
  }
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
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

function buildToolDescription(defaultLoggingMode: LoggingMode, schemaSource: SchemaSource): string {
  const modeGuidance =
    defaultLoggingMode === "completion"
      ? "Default mode=completion: call on meaningful progress/completion."
      : "Default mode=time: call periodically when possible (best-effort on unmanaged clients).";

  const schemaGuidance =
    schemaSource === "custom"
      ? "Schema source=custom: persisted fields are defined by inputSchema.properties.log_record.properties."
      : "Schema source=default: persisted fields use the default log_record schema.";

  return `Log agent work. ${modeGuidance} Per-call logging_mode may override default. ${schemaGuidance}`;
}

function buildSinkDescription(sink: SinkName, logFilePath: string): string {
  if (sink === "jsonl") {
    return `Sink=jsonl: persisted records are appended to ${logFilePath}.`;
  }
  return "Sink=unknown.";
}

function buildToolArgumentsValidator(inputSchema: Tool["inputSchema"]): ValidateFunction<ToolArguments> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const addFormats =
    (AjvFormats as unknown as { default?: (instance: Ajv) => void }).default ??
    (AjvFormats as unknown as (instance: Ajv) => void);
  addFormats(ajv);
  return ajv.compile<ToolArguments>(inputSchema as JsonSchemaObject);
}

function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return "Invalid arguments.";
  }

  return errors
    .map((error) => {
      const pathPrefix = error.instancePath ? `${error.instancePath} ` : "";
      return `${pathPrefix}${error.message ?? "is invalid"}`.trim();
    })
    .join("; ");
}

function buildToolErrorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function buildToolSuccessResult(logId: string) {
  const ack = { ok: true, log_id: logId };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(ack) }],
    structuredContent: ack,
  };
}

function getSerializedSizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function inspectObjectShape(value: unknown): { keyCount: number; maxDepth: number } {
  let keyCount = 0;
  let maxDepth = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const { value: currentValue, depth } = current;
    maxDepth = Math.max(maxDepth, depth);

    if (!currentValue || typeof currentValue !== "object") {
      continue;
    }

    if (Array.isArray(currentValue)) {
      for (const item of currentValue) {
        stack.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    const entries = Object.entries(currentValue as Record<string, unknown>);
    keyCount += entries.length;
    for (const [, nested] of entries) {
      stack.push({ value: nested, depth: depth + 1 });
    }
  }

  return { keyCount, maxDepth };
}

function validateGuardrails(args: ToolArguments): string | null {
  let logRecordBytes: number;
  try {
    logRecordBytes = getSerializedSizeBytes(args.log_record);
  } catch {
    return "Invalid log_record: payload is not serializable.";
  }
  if (logRecordBytes > MAX_LOG_RECORD_BYTES) {
    return `log_record exceeds ${MAX_LOG_RECORD_BYTES} bytes limit.`;
  }

  const { keyCount, maxDepth } = inspectObjectShape(args.log_record);
  if (keyCount > MAX_LOG_RECORD_KEYS) {
    return `log_record exceeds ${MAX_LOG_RECORD_KEYS} total keys limit.`;
  }
  if (maxDepth > MAX_LOG_RECORD_DEPTH) {
    return `log_record exceeds max depth of ${MAX_LOG_RECORD_DEPTH}.`;
  }

  return null;
}

function createLogSink(sink: SinkName, logFilePath: string): LogSink {
  if (sink === "jsonl") {
    return {
      write: async (record: PersistedRecord) => {
        await mkdir(path.dirname(logFilePath), { recursive: true });
        await appendFile(logFilePath, `${JSON.stringify(record)}\n`, "utf8");
      },
    };
  }

  throw new Error(`Unsupported sink: ${sink}`);
}

async function main(): Promise<void> {
  const cliConfig = parseCliArgs(process.argv.slice(2));
  const logSink = createLogSink(cliConfig.sink, cliConfig.logFilePath);
  const { schemaSource, properties } = loadLogRecordProperties(cliConfig.propertiesFile);
  const inputSchema = buildInputSchema(properties);
  const validateToolArguments = buildToolArgumentsValidator(inputSchema);

  const logWorkTool: Tool = {
    name: TOOL_NAME,
    description: `${buildToolDescription(cliConfig.loggingMode, schemaSource)} ${buildSinkDescription(cliConfig.sink, cliConfig.logFilePath)}`,
    inputSchema,
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

    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (getSerializedSizeBytes(args) > MAX_REQUEST_BYTES) {
        return buildToolErrorResult(`Request payload exceeds ${MAX_REQUEST_BYTES} bytes limit.`);
      }
    } catch {
      return buildToolErrorResult("Invalid log_work arguments: request payload is not serializable.");
    }

    if (!validateToolArguments(args)) {
      const errorText = formatValidationErrors(validateToolArguments.errors);
      return buildToolErrorResult(`Invalid log_work arguments: ${errorText}`);
    }

    const validatedArgs = args as ToolArguments;
    const guardrailError = validateGuardrails(validatedArgs);
    if (guardrailError) {
      return buildToolErrorResult(guardrailError);
    }

    const logId = randomUUID();
    try {
      await logSink.write({
        log_id: logId,
        server_timestamp: new Date().toISOString(),
        log_record: validatedArgs.log_record,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return buildToolErrorResult(`Failed to persist log record: ${message}`);
    }

    return buildToolSuccessResult(logId);
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
