export type SchemaSource = "default" | "custom";
export type SinkName = "jsonl";

export type PropertySchema = Record<string, unknown>;
export type LogRecordProperties = Record<string, PropertySchema>;

export interface ToolArguments {
  log_record: Record<string, unknown>;
}
