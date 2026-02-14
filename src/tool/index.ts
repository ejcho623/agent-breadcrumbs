import type { LoggingMode, SchemaSource, SinkName } from "../types.js";

export function buildToolDescription(defaultLoggingMode: LoggingMode, schemaSource: SchemaSource): string {
  const modeGuidance =
    defaultLoggingMode === "completion"
      ? "Default mode=completion: call on meaningful progress/completion."
      : "Default mode=time: call periodically when possible (best-effort on unmanaged clients).";

  const schemaGuidance =
    schemaSource === "custom"
      ? "Schema source=custom: persisted fields are defined by inputSchema.properties.log_record.properties."
      : "Schema source=default: persisted fields use the default log_record schema.";

  return `Log agent work. ${modeGuidance} Per-call logging_mode may override default. ${schemaGuidance}`;
}

export function buildSinkDescription(sink: SinkName, logFilePath: string): string {
  if (sink === "jsonl") {
    return `Sink=jsonl: persisted records are appended to ${logFilePath}.`;
  }
  return "Sink=unknown.";
}

export function buildToolErrorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function buildToolSuccessResult(logId: string) {
  const ack = { ok: true, log_id: logId };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(ack) }],
    structuredContent: ack,
  };
}
