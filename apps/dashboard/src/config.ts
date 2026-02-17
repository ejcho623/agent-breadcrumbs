import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { LogStoreConfig } from "./logstore/index.js";

interface RawDashboardConfig {
  host?: unknown;
  port?: unknown;
  logstore?: unknown;
}

interface RawLogStoreConfig {
  name?: unknown;
  config?: unknown;
}

interface DashboardConfigContext {
  cli: DashboardCliConfig;
  env: NodeJS.ProcessEnv;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4319;
const DEFAULT_JSONL_PATH = "~/.agent-breadcrumbs/logs.jsonl";

export interface DashboardCliConfig {
  configFile?: string;
}

export interface DashboardConfig {
  host: string;
  port: number;
  logStore: LogStoreConfig;
}

export function parseDashboardCliArgs(argv: string[]): DashboardCliConfig {
  let configFile: string | undefined;
  const invocationCwd = process.env.INIT_CWD ?? process.cwd();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--config") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --config");
      }
      configFile = resolvePath(next, invocationCwd);
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printDashboardHelpAndExit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { configFile };
}

export function resolveDashboardConfig(context: DashboardConfigContext): DashboardConfig {
  const { rawConfig, baseDir } = loadRawDashboardConfig(context.cli.configFile);

  const host = resolveHost(rawConfig.host, context.env.DASHBOARD_HOST);
  const port = resolvePort(rawConfig.port, context.env.DASHBOARD_PORT);

  const logStore = rawConfig.logstore
    ? resolveLogStoreFromRaw(rawConfig.logstore, baseDir)
    : resolveLogStoreFromEnv(context.env) ?? defaultLogStore();

  return {
    host,
    port,
    logStore,
  };
}

export function printDashboardHelpAndExit(exitCode: number): never {
  const lines = [
    "Usage: dashboard [options]",
    "",
    "Options:",
    "  --config <path>    JSON config file for dashboard runtime",
    "  -h, --help         Show help",
  ];

  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(exitCode);
}

function loadRawDashboardConfig(configFile?: string): { rawConfig: RawDashboardConfig; baseDir: string } {
  if (!configFile) {
    return { rawConfig: {}, baseDir: process.cwd() };
  }

  let rawText: string;
  try {
    rawText = readFileSync(configFile, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read dashboard config file ${configFile}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in dashboard config file ${configFile}: ${message}`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Dashboard config file root must be a JSON object");
  }

  return {
    rawConfig: parsed as RawDashboardConfig,
    baseDir: path.dirname(configFile),
  };
}

function resolveHost(rawHost: unknown, envHost: string | undefined): string {
  if (typeof rawHost === "string" && rawHost.trim() !== "") {
    return rawHost.trim();
  }

  if (envHost && envHost.trim() !== "") {
    return envHost.trim();
  }

  return DEFAULT_HOST;
}

function resolvePort(rawPort: unknown, envPort: string | undefined): number {
  if (typeof rawPort === "number" && Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535) {
    return rawPort;
  }

  if (typeof rawPort === "string") {
    return parsePort(rawPort, "dashboard config port");
  }

  if (envPort && envPort.trim() !== "") {
    return parsePort(envPort, "DASHBOARD_PORT");
  }

  return DEFAULT_PORT;
}

function resolveLogStoreFromRaw(rawLogStore: unknown, baseDir: string): LogStoreConfig {
  if (!rawLogStore || Array.isArray(rawLogStore) || typeof rawLogStore !== "object") {
    throw new Error("dashboard config.logstore must be a JSON object");
  }

  const candidate = rawLogStore as RawLogStoreConfig;

  if (candidate.name === "postgres") {
    if (!candidate.config || Array.isArray(candidate.config) || typeof candidate.config !== "object") {
      throw new Error("dashboard config.logstore.config must be an object for postgres");
    }

    const pg = candidate.config as Record<string, unknown>;
    const connectionString = requireNonEmptyString(pg.connection_string, "dashboard logstore postgres connection_string");
    const table = requireNonEmptyString(pg.table, "dashboard logstore postgres table");
    const scanLimit = optionalPositiveInt(pg.scan_limit, 5000, "dashboard logstore postgres scan_limit");

    return {
      kind: "postgres",
      connectionString,
      table,
      scanLimit,
    };
  }

  if (candidate.name === "jsonl") {
    if (!candidate.config || Array.isArray(candidate.config) || typeof candidate.config !== "object") {
      throw new Error("dashboard config.logstore.config must be an object for jsonl");
    }

    const jsonl = candidate.config as Record<string, unknown>;
    const filePath = requireNonEmptyString(jsonl.file_path, "dashboard logstore jsonl file_path");

    return {
      kind: "jsonl",
      filePath: resolvePath(filePath, baseDir),
    };
  }

  throw new Error("dashboard config.logstore.name must be one of: postgres, jsonl");
}

function resolveLogStoreFromEnv(env: NodeJS.ProcessEnv): LogStoreConfig | null {
  const rawKind = env.LOGSTORE_KIND?.trim().toLowerCase();
  if (!rawKind) {
    return null;
  }

  if (rawKind === "postgres") {
    const connectionString = env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DASHBOARD config error: DATABASE_URL is required when LOGSTORE_KIND=postgres");
    }

    return {
      kind: "postgres",
      connectionString,
      table: env.LOG_TABLE?.trim() || "public.agent_logs",
      scanLimit: optionalPositiveInt(env.LOGSTORE_SCAN_LIMIT, 5000, "LOGSTORE_SCAN_LIMIT"),
    };
  }

  if (rawKind === "jsonl") {
    const filePath = env.LOG_FILE_PATH?.trim();
    if (!filePath) {
      throw new Error("DASHBOARD config error: LOG_FILE_PATH is required when LOGSTORE_KIND=jsonl");
    }

    return {
      kind: "jsonl",
      filePath: resolvePath(filePath, process.cwd()),
    };
  }

  throw new Error(`DASHBOARD config error: unsupported LOGSTORE_KIND: ${rawKind}`);
}

function defaultLogStore(): LogStoreConfig {
  return {
    kind: "jsonl",
    filePath: resolvePath(DEFAULT_JSONL_PATH, process.cwd()),
  };
}

function requireNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function optionalPositiveInt(value: unknown, fallback: number, context: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  throw new Error(`${context} must be a positive integer`);
}

function parsePort(rawValue: string, label: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid ${label}: ${rawValue}`);
  }
  return parsed;
}

function resolvePath(value: string, baseDir: string): string {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.resolve(os.homedir(), value.slice(2));
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(baseDir, value);
}
