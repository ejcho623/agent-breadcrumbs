import os from "node:os";
import path from "node:path";

import { DEFAULT_LOG_FILE_PATH } from "../constants.js";
import type { SinkName } from "../types.js";

export interface CliConfig {
  propertiesFile?: string;
  sink: SinkName;
  logFilePath: string;
}

export function parseCliArgs(argv: string[]): CliConfig {
  let propertiesFile: string | undefined;
  let sink: SinkName = "jsonl";
  let logFilePath = DEFAULT_LOG_FILE_PATH;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--properties-file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --properties-file");
      }
      propertiesFile = next;
      i += 1;
      continue;
    }

    if (arg === "--sink") {
      const next = argv[i + 1];
      if (next !== "jsonl") {
        throw new Error('Invalid value for --sink. Use "jsonl".');
      }
      sink = next;
      i += 1;
      continue;
    }

    if (arg === "--log-file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --log-file");
      }
      logFilePath = resolvePath(next);
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { propertiesFile, sink, logFilePath };
}

export function printHelpAndExit(exitCode: number): never {
  const lines = [
    "Usage: agent-breadcrumbs-mcp-server [options]",
    "",
    "Options:",
    "  --properties-file <path>       JSON file for custom log_record.properties",
    '  --sink <jsonl>                 Sink connector to use (default: "jsonl")',
    "  --log-file <path>              JSONL sink output file",
    "  -h, --help                     Show help",
  ];

  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(exitCode);
}

function resolvePath(value: string): string {
  if (value.startsWith("~")) {
    return path.resolve(os.homedir(), value.slice(1));
  }
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
