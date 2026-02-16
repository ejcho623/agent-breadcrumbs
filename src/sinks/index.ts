import os from "node:os";
import path from "node:path";

import type { SinkConfig } from "../types.js";
import { createJsonlSink } from "./jsonl.js";
import { createWebhookSink } from "./webhook.js";

const DEFAULT_WEBHOOK_TIMEOUT_MS = 3000;
const DEFAULT_WEBHOOK_RETRY_MAX_ATTEMPTS = 0;
const DEFAULT_WEBHOOK_RETRY_BACKOFF_MS = 250;
const DEFAULT_POSTGRES_TIMEOUT_MS = 5000;

export interface PersistedRecord {
  log_id: string;
  server_timestamp: string;
  log_record: Record<string, unknown>;
}

export interface LogSink {
  write(record: PersistedRecord): Promise<void>;
}

export function resolveSinkConfig(rawSink: unknown, baseDir: string, defaultLogFilePath: string): SinkConfig {
  if (rawSink === undefined) {
    return {
      name: "jsonl",
      config: {
        log_file: defaultLogFilePath,
      },
    };
  }

  const sinkObject = requireObject(rawSink, "config.sink");
  const name = sinkObject.name;
  const rawConfig = sinkObject.config;

  if (name === "jsonl") {
    const configObject = rawConfig === undefined ? {} : requireObject(rawConfig, "config.sink.config");
    const rawLogFile = configObject.log_file;
    if (rawLogFile !== undefined && typeof rawLogFile !== "string") {
      throw new Error("config.sink.config.log_file must be a string");
    }
    const resolvedLogFile = resolvePathFromBase(rawLogFile ?? defaultLogFilePath, baseDir);
    return {
      name: "jsonl",
      config: {
        log_file: resolvedLogFile,
      },
    };
  }

  if (name === "webhook") {
    const configObject = requireObject(rawConfig, "config.sink.config");
    const url = requireString(configObject.url, "config.sink.config.url");
    const headers = resolveStringMap(configObject.headers, "config.sink.config.headers");
    const timeoutMs = resolvePositiveInteger(
      configObject.timeout_ms,
      "config.sink.config.timeout_ms",
      DEFAULT_WEBHOOK_TIMEOUT_MS,
    );

    const retryObject =
      configObject.retry === undefined ? {} : requireObject(configObject.retry, "config.sink.config.retry");
    const maxAttempts = resolvePositiveInteger(
      retryObject.max_attempts,
      "config.sink.config.retry.max_attempts",
      DEFAULT_WEBHOOK_RETRY_MAX_ATTEMPTS,
      true,
    );
    const backoffMs = resolvePositiveInteger(
      retryObject.backoff_ms,
      "config.sink.config.retry.backoff_ms",
      DEFAULT_WEBHOOK_RETRY_BACKOFF_MS,
      true,
    );

    return {
      name: "webhook",
      config: {
        url,
        headers,
        timeout_ms: timeoutMs,
        retry: {
          max_attempts: maxAttempts,
          backoff_ms: backoffMs,
        },
      },
    };
  }

  if (name === "postgres") {
    const configObject = requireObject(rawConfig, "config.sink.config");
    const connectionString = requireString(configObject.connection_string, "config.sink.config.connection_string");
    const table = requireString(configObject.table, "config.sink.config.table");
    const timeoutMs = resolvePositiveInteger(
      configObject.timeout_ms,
      "config.sink.config.timeout_ms",
      DEFAULT_POSTGRES_TIMEOUT_MS,
    );

    return {
      name: "postgres",
      config: {
        connection_string: connectionString,
        table,
        timeout_ms: timeoutMs,
      },
    };
  }

  throw new Error('config.sink.name must be one of: "jsonl", "webhook", "postgres"');
}

export function createLogSink(sinkConfig: SinkConfig): LogSink {
  if (sinkConfig.name === "jsonl") {
    return createJsonlSink(sinkConfig.config.log_file);
  }

  if (sinkConfig.name === "webhook") {
    return createWebhookSink(sinkConfig.config);
  }

  if (sinkConfig.name === "postgres") {
    throw new Error('Sink "postgres" is configured but not implemented yet.');
  }

  throw new Error(`Unsupported sink: ${(sinkConfig as { name: string }).name}`);
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${context} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function resolveStringMap(value: unknown, context: string): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  const object = requireObject(value, context);
  const resolved: Record<string, string> = {};
  for (const [key, mapValue] of Object.entries(object)) {
    if (typeof mapValue !== "string") {
      throw new Error(`${context}.${key} must be a string`);
    }
    resolved[key] = mapValue;
  }
  return resolved;
}

function resolvePositiveInteger(
  value: unknown,
  context: string,
  defaultValue: number,
  allowZero = false,
): number {
  if (value === undefined) {
    return defaultValue;
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${context} must be an integer`);
  }
  const numberValue = value as number;
  if (allowZero ? numberValue < 0 : numberValue <= 0) {
    throw new Error(`${context} must be ${allowZero ? ">= 0" : "> 0"}`);
  }
  return numberValue;
}

function resolvePathFromBase(value: string, baseDir: string): string {
  if (value.startsWith("~")) {
    return path.resolve(os.homedir(), value.slice(1));
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(baseDir, value);
}
