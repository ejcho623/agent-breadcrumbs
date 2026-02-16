import { DEFAULT_LOG_FILE_PATH } from "../constants.js";
import { DEFAULT_LOG_RECORD_PROPERTIES } from "../schema/index.js";

export const DEFAULT_SERVER_CONFIG = {
  schema: DEFAULT_LOG_RECORD_PROPERTIES,
  sink: {
    name: "jsonl" as const,
    config: {
      log_file: DEFAULT_LOG_FILE_PATH,
    },
  },
};
