import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { LogSink, PersistedRecord } from "./types.js";

export function createJsonlSink(logFilePath: string): LogSink {
  return {
    write: async (record: PersistedRecord) => {
      await mkdir(path.dirname(logFilePath), { recursive: true });
      await appendFile(logFilePath, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}
