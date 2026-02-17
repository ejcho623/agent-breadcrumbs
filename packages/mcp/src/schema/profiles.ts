import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LogRecordProperties, PropertySchema, SchemaProfileName } from "../types.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(moduleDir, "../../examples/schema_profiles");

let profileCache: Record<string, LogRecordProperties> | null = null;

export function listSchemaProfiles(): SchemaProfileName[] {
  return Object.keys(loadProfiles()).sort();
}

export function hasSchemaProfile(profileName: string): boolean {
  return profileName in loadProfiles();
}

export function resolveSchemaProfile(profileName: SchemaProfileName): LogRecordProperties {
  const profiles = loadProfiles();
  const profile = profiles[profileName];
  if (!profile) {
    throw new Error(`Unknown schema profile: ${profileName}`);
  }
  return profile;
}

function loadProfiles(): Record<string, LogRecordProperties> {
  if (profileCache) {
    return profileCache;
  }

  let files: string[];
  try {
    files = readdirSync(schemaDirectory);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read schema profiles directory at ${schemaDirectory}: ${message}`);
  }

  const profiles: Record<string, LogRecordProperties> = {};

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const profileName = file.slice(0, -".json".length);
    const filePath = path.join(schemaDirectory, file);

    let rawText: string;
    try {
      rawText = readFileSync(filePath, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read schema profile file ${filePath}: ${message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in schema profile file ${filePath}: ${message}`);
    }

    profiles[profileName] = normalizeLogRecordProperties(parsed, `schema profile ${profileName}`);
  }

  profileCache = profiles;
  return profileCache;
}

function normalizeLogRecordProperties(rawSchema: unknown, context: string): LogRecordProperties {
  if (!rawSchema || Array.isArray(rawSchema) || typeof rawSchema !== "object") {
    throw new Error(`${context} must be a JSON object`);
  }

  const candidate = rawSchema as Record<string, unknown>;
  const normalized: LogRecordProperties = {};

  for (const [key, value] of Object.entries(candidate)) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`${context}.${key} must be a JSON object`);
    }
    normalized[key] = value as PropertySchema;
  }

  return normalized;
}
