export interface PersistedRecord {
  log_id: string;
  server_timestamp: string;
  log_record: Record<string, unknown>;
}

export interface LogSink {
  write(record: PersistedRecord): Promise<void>;
}
