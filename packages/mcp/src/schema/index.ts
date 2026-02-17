import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { LogRecordProperties, PropertySchema, SchemaProfileName, SchemaSource } from "../types.js";
import { hasSchemaProfile, listSchemaProfiles, resolveSchemaProfile } from "./profiles.js";

export const DEFAULT_LOG_RECORD_PROPERTIES: LogRecordProperties = {
  agent_id: { type: "string" },
  timestamp: { type: "string", format: "date-time" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

export function resolveLogRecordProperties(rawSchema?: unknown): {
  schemaSource: SchemaSource;
  properties: LogRecordProperties;
} {
  if (rawSchema === undefined) {
    return { schemaSource: "default", properties: DEFAULT_LOG_RECORD_PROPERTIES };
  }

  if (!rawSchema || Array.isArray(rawSchema) || typeof rawSchema !== "object") {
    throw new Error("config.schema must be a JSON object");
  }

  const candidate = rawSchema as Record<string, unknown>;

  const normalized: LogRecordProperties = {};

  for (const [key, value] of Object.entries(candidate)) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`config.schema.${key} must be a JSON object`);
    }
    normalized[key] = value as PropertySchema;
  }

  return { schemaSource: "custom", properties: normalized };
}

export function resolveLogRecordPropertiesFromProfile(rawSchemaProfile: unknown): {
  schemaSource: SchemaSource;
  schemaProfileName: SchemaProfileName;
  properties: LogRecordProperties;
} {
  if (typeof rawSchemaProfile !== "string" || rawSchemaProfile.trim() === "") {
    throw new Error("config.schema_profile must be a non-empty string");
  }

  if (!hasSchemaProfile(rawSchemaProfile)) {
    const supported = listSchemaProfiles().join(", ");
    throw new Error(
      `Unknown config.schema_profile: ${rawSchemaProfile}. Supported profiles: ${supported}. ` +
        "Use config.schema for a custom schema.",
    );
  }

  return {
    schemaSource: "profile",
    schemaProfileName: rawSchemaProfile,
    properties: resolveSchemaProfile(rawSchemaProfile),
  };
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
