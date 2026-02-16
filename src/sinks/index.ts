import type { SinkName } from "../types.js";
import { createJsonlSink } from "./jsonl.js";

export interface PersistedRecord {
  log_id: string;
  server_timestamp: string;
  log_record: Record<string, unknown>;
}

export interface LogSink {
  write(record: PersistedRecord): Promise<void>;
}

export function createLogSink(sink: SinkName, logFilePath: string): LogSink {
  if (sink === "jsonl") {
    return createJsonlSink(logFilePath);
  }

  throw new Error(`Unsupported sink: ${sink}`);
}
