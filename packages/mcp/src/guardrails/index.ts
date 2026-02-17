import {
  MAX_LOG_RECORD_BYTES,
  MAX_LOG_RECORD_DEPTH,
  MAX_LOG_RECORD_KEYS,
  MAX_REQUEST_BYTES,
} from "../constants.js";
import type { ToolArguments } from "../types.js";

export function validateRequestSize(rawArguments: Record<string, unknown>): string | null {
  try {
    if (getSerializedSizeBytes(rawArguments) > MAX_REQUEST_BYTES) {
      return `Request payload exceeds ${MAX_REQUEST_BYTES} bytes limit.`;
    }
  } catch {
    return "Invalid log_work arguments: request payload is not serializable.";
  }

  return null;
}

export function validateLogRecordGuardrails(args: ToolArguments): string | null {
  let logRecordBytes: number;
  try {
    logRecordBytes = getSerializedSizeBytes(args.log_record);
  } catch {
    return "Invalid log_record: payload is not serializable.";
  }
  if (logRecordBytes > MAX_LOG_RECORD_BYTES) {
    return `log_record exceeds ${MAX_LOG_RECORD_BYTES} bytes limit.`;
  }

  const { keyCount, maxDepth } = inspectObjectShape(args.log_record);
  if (keyCount > MAX_LOG_RECORD_KEYS) {
    return `log_record exceeds ${MAX_LOG_RECORD_KEYS} total keys limit.`;
  }
  if (maxDepth > MAX_LOG_RECORD_DEPTH) {
    return `log_record exceeds max depth of ${MAX_LOG_RECORD_DEPTH}.`;
  }

  return null;
}

function getSerializedSizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function inspectObjectShape(value: unknown): { keyCount: number; maxDepth: number } {
  let keyCount = 0;
  let maxDepth = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const { value: currentValue, depth } = current;
    maxDepth = Math.max(maxDepth, depth);

    if (!currentValue || typeof currentValue !== "object") {
      continue;
    }

    if (Array.isArray(currentValue)) {
      for (const item of currentValue) {
        stack.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    const entries = Object.entries(currentValue as Record<string, unknown>);
    keyCount += entries.length;
    for (const [, nested] of entries) {
      stack.push({ value: nested, depth: depth + 1 });
    }
  }

  return { keyCount, maxDepth };
}
