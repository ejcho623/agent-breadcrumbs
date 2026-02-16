#!/usr/bin/env node

import { randomUUID } from "node:crypto";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, Tool } from "@modelcontextprotocol/sdk/types.js";

import { SERVER_NAME, SERVER_VERSION, TOOL_NAME } from "./constants.js";
import { parseCliArgs, resolveRuntimeConfig } from "./config/index.js";
import { validateLogRecordGuardrails, validateRequestSize } from "./guardrails/index.js";
import { buildInputSchema } from "./schema/index.js";
import { buildToolArgumentsValidator, formatValidationErrors } from "./schema/validator.js";
import { createLogSink } from "./sinks/index.js";
import { buildSinkDescription, buildToolDescription, buildToolErrorResult, buildToolSuccessResult } from "./tool/index.js";
import type { ToolArguments } from "./types.js";

async function main(): Promise<void> {
  const cliConfig = parseCliArgs(process.argv.slice(2));
  const runtimeConfig = resolveRuntimeConfig(cliConfig);

  const logSink = createLogSink(runtimeConfig.sink);
  const inputSchema = buildInputSchema(runtimeConfig.logRecordProperties);
  const validateToolArguments = buildToolArgumentsValidator(inputSchema);

  const logWorkTool: Tool = {
    name: TOOL_NAME,
    description: `${buildToolDescription(runtimeConfig.schemaSource)} ${buildSinkDescription(runtimeConfig.sink)}`,
    inputSchema,
  };

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
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

    const rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;

    const requestSizeError = validateRequestSize(rawArgs);
    if (requestSizeError) {
      return buildToolErrorResult(requestSizeError);
    }

    if (!validateToolArguments(rawArgs)) {
      const errorText = formatValidationErrors(validateToolArguments.errors);
      return buildToolErrorResult(`Invalid log_work arguments: ${errorText}`);
    }

    const validatedArgs = rawArgs as ToolArguments;

    const guardrailError = validateLogRecordGuardrails(validatedArgs);
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
