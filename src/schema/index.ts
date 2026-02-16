import { readFileSync } from "node:fs";
import path from "node:path";

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { LogRecordProperties, PropertySchema, SchemaSource } from "../types.js";

export const DEFAULT_LOG_RECORD_PROPERTIES: LogRecordProperties = {
  agent_id: { type: "string" },
  timestamp: { type: "string", format: "date-time" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

export function loadLogRecordProperties(propertiesFile?: string): {
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

export function buildInputSchema(logRecordProperties: LogRecordProperties): Tool["inputSchema"] {
  return {
    type: "object",
    properties: {
      log_record: {
        type: "object",
        properties: logRecordProperties,
      },
    },
    required: ["log_record"],
  };
}
