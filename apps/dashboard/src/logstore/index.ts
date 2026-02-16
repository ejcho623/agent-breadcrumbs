import { JsonlLogStore } from "./jsonl.js";
import { PostgresLogStore } from "./postgres.js";
import type { LogStore } from "./types.js";

export type LogStoreConfig =
  | {
      kind: "postgres";
      connectionString: string;
      table: string;
      scanLimit: number;
    }
  | {
      kind: "jsonl";
      filePath: string;
    };

export function createLogStore(config: LogStoreConfig): LogStore {
  if (config.kind === "postgres") {
    return new PostgresLogStore({
      connectionString: config.connectionString,
      table: config.table,
      scanLimit: config.scanLimit,
    });
  }

  return new JsonlLogStore({ filePath: config.filePath });
}

export type { LogStore } from "./types.js";
