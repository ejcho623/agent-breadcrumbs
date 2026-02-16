import type { SchemaSource, SinkName } from "../types.js";

export function buildToolDescription(schemaSource: SchemaSource): string {
  const schemaGuidance =
    schemaSource === "custom"
      ? "Schema source=custom: persisted fields are defined by inputSchema.properties.log_record.properties."
      : "Schema source=default: persisted fields use the default log_record schema.";

  return `Log agent work. Call on meaningful progress/completion. ${schemaGuidance}`;
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
