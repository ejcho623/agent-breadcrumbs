import type { SinkName } from "../types.js";
import { createJsonlSink } from "./jsonl.js";
import type { LogSink } from "./types.js";

export type { LogSink, PersistedRecord } from "./types.js";

export function createLogSink(sink: SinkName, logFilePath: string): LogSink {
  if (sink === "jsonl") {
    return createJsonlSink(logFilePath);
  }

  throw new Error(`Unsupported sink: ${sink}`);
}
