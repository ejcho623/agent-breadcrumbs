import os from "node:os";
import path from "node:path";

export const TOOL_NAME = "log_work";
export const SERVER_NAME = "agent-breadcrumbs";
export const SERVER_VERSION = "0.1.0";

export const DEFAULT_LOG_FILE_PATH = path.join(os.homedir(), ".agent-breadcrumbs", "logs.jsonl");

export const MAX_REQUEST_BYTES = 32 * 1024;
export const MAX_LOG_RECORD_BYTES = 16 * 1024;
export const MAX_LOG_RECORD_DEPTH = 8;
export const MAX_LOG_RECORD_KEYS = 256;
