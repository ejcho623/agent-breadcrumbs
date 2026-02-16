import type { LogRecordProperties, SchemaProfileName } from "../types.js";

const AGENT_INSIGHTS_V1: LogRecordProperties = {
  schema_profile: { type: "string" },
  schema_version: { type: "string" },
  team_id: { type: "string" },
  project_id: { type: "string" },
  human_actor_id: { type: "string" },
  agent_id: { type: "string" },
  run_id: { type: "string" },
  event_type: { type: "string" },
  status: { type: "string" },
  duration_ms: { type: "number" },
  output_count: { type: "number" },
  cost_usd: { type: "number" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

const DELIVERY_TRACKING_V1: LogRecordProperties = {
  schema_profile: { type: "string" },
  schema_version: { type: "string" },
  team_id: { type: "string" },
  project_id: { type: "string" },
  initiative_id: { type: "string" },
  milestone_id: { type: "string" },
  task_id: { type: "string" },
  delivery_id: { type: "string" },
  artifact_ref: { type: "string" },
  event_type: { type: "string" },
  status: { type: "string" },
  delivered_at: { type: "string", format: "date-time" },
  effort_hours: { type: "number" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

const AUDIT_TRAIL_V1: LogRecordProperties = {
  schema_profile: { type: "string" },
  schema_version: { type: "string" },
  team_id: { type: "string" },
  project_id: { type: "string" },
  actor_type: { type: "string" },
  actor_id: { type: "string" },
  action: { type: "string" },
  target_type: { type: "string" },
  target_id: { type: "string" },
  reason: { type: "string" },
  status: { type: "string" },
  timestamp: { type: "string", format: "date-time" },
  work_summary: { type: "string" },
  additional: { type: "object" },
};

const KNOWLEDGE_CAPTURE_V1: LogRecordProperties = {
  schema_profile: { type: "string" },
  schema_version: { type: "string" },
  team_id: { type: "string" },
  project_id: { type: "string" },
  knowledge_type: { type: "string" },
  title: { type: "string" },
  summary: { type: "string" },
  source_ref: { type: "string" },
  tags: { type: "array", items: { type: "string" } },
  confidence: { type: "number" },
  event_type: { type: "string" },
  status: { type: "string" },
  captured_at: { type: "string", format: "date-time" },
  additional: { type: "object" },
};

export const SCHEMA_PROFILES: Record<SchemaProfileName, LogRecordProperties> = {
  agent_insights_v1: AGENT_INSIGHTS_V1,
  delivery_tracking_v1: DELIVERY_TRACKING_V1,
  audit_trail_v1: AUDIT_TRAIL_V1,
  knowledge_capture_v1: KNOWLEDGE_CAPTURE_V1,
};

export function listSchemaProfiles(): SchemaProfileName[] {
  return Object.keys(SCHEMA_PROFILES) as SchemaProfileName[];
}

export function isSchemaProfileName(value: string): value is SchemaProfileName {
  return value in SCHEMA_PROFILES;
}
