export type SchemaSource = "default" | "custom";
export type SinkName = "jsonl" | "webhook" | "postgres";

export interface JsonlSinkConfig {
  name: "jsonl";
  config: {
    log_file: string;
  };
}

export interface WebhookSinkConfig {
  name: "webhook";
  config: {
    url: string;
    headers: Record<string, string>;
    timeout_ms: number;
    retry: {
      max_attempts: number;
      backoff_ms: number;
    };
  };
}

export interface PostgresSinkConfig {
  name: "postgres";
  config: {
    connection_string: string;
    table: string;
    timeout_ms: number;
    retry: {
      max_attempts: number;
      backoff_ms: number;
    };
  };
}

export type SinkConfig = JsonlSinkConfig | WebhookSinkConfig | PostgresSinkConfig;

export type PropertySchema = Record<string, unknown>;
export type LogRecordProperties = Record<string, PropertySchema>;

export interface ToolArguments {
  log_record: Record<string, unknown>;
}
