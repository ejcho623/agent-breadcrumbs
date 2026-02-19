import type { NormalizedEvent } from "./types.js";

interface EnvelopeRow {
  log_id?: unknown;
  server_timestamp?: unknown;
  log_record?: unknown;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function toIsoDateFromUnknown(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  return toIsoDate(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readServerUserName(record: Record<string, unknown>): string | null {
  const serverMetadata = record._agent_breadcrumbs_server;
  if (!serverMetadata || Array.isArray(serverMetadata) || typeof serverMetadata !== "object") {
    return null;
  }

  const value = (serverMetadata as Record<string, unknown>).user_name;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function normalizeEnvelope(
  row: EnvelopeRow,
  source: NormalizedEvent["source"],
): NormalizedEvent | null {
  const serverTimestamp = toIsoDateFromUnknown(row.server_timestamp);
  if (!serverTimestamp) {
    return null;
  }

  const payload = row.log_record;
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return null;
  }

  const payloadObject = payload as Record<string, unknown>;

  const eventTime = serverTimestamp;
  const actor = readString(payloadObject, "agent_id") ?? readString(payloadObject, "actor_id");
  const userName = readServerUserName(payloadObject) ?? readString(payloadObject, "user_name");
  const summary = readString(payloadObject, "work_summary") ?? readString(payloadObject, "summary");
  const status = readString(payloadObject, "status");

  return {
    id: typeof row.log_id === "string" ? row.log_id : `${serverTimestamp}:${Math.random().toString(16).slice(2)}`,
    serverTimestamp,
    eventTime,
    actor,
    userName,
    summary,
    status,
    payload: payloadObject,
    source,
  };
}

export function eventSearchText(event: NormalizedEvent): string {
  return `${event.summary ?? ""} ${JSON.stringify(event.payload)}`.toLowerCase();
}

export function bucketStartIso(dateInput: string, bucket: "hour" | "day"): string {
  const date = new Date(dateInput);
  if (bucket === "day") {
    date.setUTCHours(0, 0, 0, 0);
  } else {
    date.setUTCMinutes(0, 0, 0);
  }
  return date.toISOString();
}
