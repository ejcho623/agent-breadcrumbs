import { Pool } from "pg";

import type { PostgresSinkConfig } from "../types.js";
import type { LogSink, PersistedRecord } from "./index.js";

const AUTH_ERROR_CODES = new Set(["28P01", "28000"]);
const RETRYABLE_QUERY_CODES = new Set([
  "40001",
  "40P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);
const RETRYABLE_TRANSPORT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ECONNABORTED",
]);

type PgLikeError = Error & { code?: string; message: string };

export class PostgresTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Postgres timeout after ${timeoutMs}ms.`);
    this.name = "PostgresTimeoutError";
  }
}

export class PostgresAuthError extends Error {
  constructor() {
    super("Postgres authentication failed.");
    this.name = "PostgresAuthError";
  }
}

export class PostgresTransportError extends Error {
  constructor(message: string) {
    super(`Postgres transport error: ${message}`);
    this.name = "PostgresTransportError";
  }
}

export class PostgresQueryError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(`Postgres query error${code ? ` (${code})` : ""}: ${message}`);
    this.name = "PostgresQueryError";
    this.code = code;
  }
}

interface PostgresSinkDependencies {
  insertRecord?: (record: PersistedRecord) => Promise<void>;
}

export function createPostgresSink(
  config: PostgresSinkConfig["config"],
  dependencies: PostgresSinkDependencies = {},
): LogSink {
  const insertRecord = dependencies.insertRecord ?? createInsertRecordFn(config);

  return {
    write: async (record: PersistedRecord): Promise<void> => {
      const totalAttempts = config.retry.max_attempts + 1;

      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
          await insertRecord(record);
          return;
        } catch (error: unknown) {
          const normalizedError = normalizePostgresError(error, config.timeout_ms);
          const shouldRetry = attempt < totalAttempts && isRetryable(normalizedError);
          if (!shouldRetry) {
            throw normalizedError;
          }
          await sleep(config.retry.backoff_ms * attempt);
        }
      }
    },
  };
}

function createInsertRecordFn(config: PostgresSinkConfig["config"]): (record: PersistedRecord) => Promise<void> {
  const qualifiedTable = quoteQualifiedIdentifier(config.table);
  const pool = new Pool({
    connectionString: config.connection_string,
    max: 2,
    connectionTimeoutMillis: config.timeout_ms,
    query_timeout: config.timeout_ms,
    statement_timeout: config.timeout_ms,
    allowExitOnIdle: true,
  });

  return async (record: PersistedRecord): Promise<void> => {
    await pool.query(
      `INSERT INTO ${qualifiedTable} (log_id, server_timestamp, log_record) VALUES ($1, $2, $3::jsonb)`,
      [record.log_id, record.server_timestamp, JSON.stringify(record.log_record)],
    );
  };
}

function quoteQualifiedIdentifier(table: string): string {
  const parts = table.split(".");
  return parts.map((part) => `"${part.replaceAll('"', '""')}"`).join(".");
}

function normalizePostgresError(error: unknown, timeoutMs: number): Error {
  if (
    error instanceof PostgresTimeoutError ||
    error instanceof PostgresAuthError ||
    error instanceof PostgresTransportError ||
    error instanceof PostgresQueryError
  ) {
    return error;
  }

  if (!(error instanceof Error)) {
    return new PostgresTransportError(String(error));
  }

  const pgError = error as PgLikeError;
  const code = typeof pgError.code === "string" ? pgError.code : undefined;

  if (isTimeoutError(pgError, timeoutMs)) {
    return new PostgresTimeoutError(timeoutMs);
  }

  if (code && AUTH_ERROR_CODES.has(code)) {
    return new PostgresAuthError();
  }

  if (isTransportError(pgError)) {
    return new PostgresTransportError(pgError.message);
  }

  return new PostgresQueryError(pgError.message, code);
}

function isRetryable(error: Error): boolean {
  if (error instanceof PostgresTimeoutError || error instanceof PostgresTransportError) {
    return true;
  }
  if (error instanceof PostgresQueryError) {
    const code = error.code;
    if (!code) {
      return false;
    }
    if (RETRYABLE_QUERY_CODES.has(code)) {
      return true;
    }
    return code.startsWith("08");
  }
  return false;
}

function isTransportError(error: PgLikeError): boolean {
  const code = typeof error.code === "string" ? error.code : "";
  if (RETRYABLE_TRANSPORT_CODES.has(code)) {
    return true;
  }
  if (code.startsWith("08")) {
    return true;
  }
  return /connect|connection|socket|network|dns|econn/i.test(error.message);
}

function isTimeoutError(error: PgLikeError, timeoutMs: number): boolean {
  if (error.code === "57014") {
    return true;
  }
  const message = error.message.toLowerCase();
  return message.includes("timeout") || message.includes(`${timeoutMs}ms`);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}
