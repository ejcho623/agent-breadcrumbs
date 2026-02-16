import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_SERVER_CONFIG } from "./defaults.js";
import { resolveLogRecordProperties, resolveLogRecordPropertiesFromProfile } from "../schema/index.js";
import { resolveSinkConfig } from "../sinks/index.js";
import type { LogRecordProperties, SchemaProfileName, SchemaSource, SinkConfig } from "../types.js";

const LEGACY_RUNTIME_FLAGS = new Set(["--properties-file", "--sink", "--log-file"]);

export interface CliConfig {
  configFile?: string;
}

export interface RuntimeConfig {
  schemaSource: SchemaSource;
  schemaProfileName?: SchemaProfileName;
  logRecordProperties: LogRecordProperties;
  sink: SinkConfig;
}

export function parseCliArgs(argv: string[]): CliConfig {
  let configFile: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--config") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --config");
      }
      configFile = resolvePath(next);
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }

    if (LEGACY_RUNTIME_FLAGS.has(arg)) {
      throw new Error(`Flag ${arg} is no longer supported. Use --config <path>.`);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { configFile };
}

export function resolveRuntimeConfig(cliConfig: CliConfig): RuntimeConfig {
  const { rawConfig, baseDir } = loadRawConfig(cliConfig.configFile);

  const schemaResolution = resolveSchemaConfig(rawConfig);
  const sink = resolveSinkConfig(rawConfig.sink, baseDir, DEFAULT_SERVER_CONFIG.sink.config.log_file);

  return {
    schemaSource: schemaResolution.schemaSource,
    schemaProfileName: schemaResolution.schemaProfileName,
    logRecordProperties: schemaResolution.properties,
    sink,
  };
}

export function printHelpAndExit(exitCode: number): never {
  const lines = [
    "Usage: agent-breadcrumbs-mcp-server [options]",
    "",
    "Options:",
    "  --config <path>                JSON config file for schema + sink settings",
    "  -h, --help                     Show help",
  ];

  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(exitCode);
}

function loadRawConfig(configFile?: string): { rawConfig: Record<string, unknown>; baseDir: string } {
  if (!configFile) {
    return { rawConfig: {}, baseDir: process.cwd() };
  }

  let rawText: string;
  try {
    rawText = readFileSync(configFile, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config file ${configFile}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in config file ${configFile}: ${message}`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Config file root must be a JSON object");
  }

  return { rawConfig: parsed as Record<string, unknown>, baseDir: path.dirname(configFile) };
}

function resolvePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.resolve(os.homedir(), value.slice(2));
  }

  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function resolveSchemaConfig(rawConfig: Record<string, unknown>): {
  schemaSource: SchemaSource;
  schemaProfileName?: SchemaProfileName;
  properties: LogRecordProperties;
} {
  const hasSchema = rawConfig.schema !== undefined;
  const hasSchemaProfile = rawConfig.schema_profile !== undefined;

  if (hasSchema && hasSchemaProfile) {
    throw new Error(
      "Config cannot set both config.schema and config.schema_profile. " +
        "Choose one schema source; use config.schema for fully custom fields.",
    );
  }

  if (hasSchemaProfile) {
    return resolveLogRecordPropertiesFromProfile(rawConfig.schema_profile);
  }

  return resolveLogRecordProperties(rawConfig.schema ?? DEFAULT_SERVER_CONFIG.schema);
}
