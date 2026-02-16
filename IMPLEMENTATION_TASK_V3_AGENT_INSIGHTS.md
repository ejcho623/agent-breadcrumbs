# Agent Breadcrumbs v3 Implementation Tasks (Agent Work Data Platform)

## Objective
Extend Agent Breadcrumbs from a sink-focused logger into a multi-use-case platform where logs power multiple downstream products and workflows:
- observability and proactive insights
- audit trail and traceability
- lightweight delivery tracking
- knowledge capture and reuse

## Product Positioning (v3)
- Core positioning: **Agent Work Data Platform**
- First-class outcomes (parallel, not sequential):
  - productivity/observability insights
  - delivery tracking
  - audit timeline and accountability
  - knowledge capture signals for future reuse
- Product surfaces can differ by schema profile and user needs; the platform should not assume a single UI narrative.

## Architectural Direction
- Keep sink adapters (`jsonl`, `webhook`, `postgres`) for ingestion flexibility.
- Treat Postgres as the default analytics backend for out-of-box value.
- Build a read API boundary so dashboard does not depend on Postgres SQL directly.
- Use append-only event semantics + projection tables for fast query UX.

## Milestone 1: Schema Profiles + Core Contract
### Tasks
- [ ] Define a required core field contract for all profiles:
  - [ ] `schema_version`
  - [ ] `schema_profile`
  - [ ] `team_id`
  - [ ] `project_id`
  - [ ] `agent_id`
  - [ ] `event_type`
  - [ ] `status`
  - [ ] `timestamp`
- [ ] Define initial profile set:
  - [ ] `agent_insights_v1`
  - [ ] `delivery_tracking_v1`
  - [ ] `audit_trail_v1`
  - [ ] `knowledge_capture_v1`
- [ ] Define profile-specific optional fields (for example):
  - [ ] `run_id`, `human_actor_id`, `duration_ms`, `output_count`, `cost_usd`
  - [ ] `artifact_type`, `artifact_ref`, `task_id`, `workflow_id`

### Exit Criteria
- One documented core contract exists and is stable.
- Profile definitions are explicit and versioned.
- Future dashboards can rely on core fields regardless of profile.

## Milestone 2: Config + Validation Support for Profiles
### Tasks
- [ ] Extend config model to support profile-based schema selection.
- [ ] Keep backward compatibility for custom inline `schema`.
- [ ] Add profile registry files under `examples/schemas/`.
- [ ] Validate `schema_profile` and `schema_version` at tool-call time.
- [ ] Add migration guidance from arbitrary custom schema to profile-based schemas.

### Exit Criteria
- Users can choose a profile via config without writing full schema JSON manually.
- Existing users with custom schemas are not broken.

## Milestone 3: Event Taxonomy + Postgres Read Models
### Tasks
- [ ] Define v1 event taxonomy for insights-oriented use cases:
  - [ ] `telemetry.log_work`
  - [ ] `delivery.completed`
  - [ ] `audit.action_recorded`
  - [ ] `knowledge.captured`
- [ ] Add canonical analytics tables/views for Postgres:
  - [ ] `insights_events` (normalized envelope + key dimensions)
  - [ ] `agent_activity_daily`
  - [ ] `project_activity_daily`
  - [ ] `delivery_summary_daily`
  - [ ] `audit_recent_activity`
- [ ] Implement SQL bootstrap and migrations for these read models.
- [ ] Add tests verifying projection/query correctness on sample events.

### Exit Criteria
- Postgres can answer core insights queries without JSONB-heavy ad hoc scanning.
- Read models produce stable, repeatable metrics.

## Milestone 4: Analytics API Service (Read Boundary)
### Tasks
- [ ] Create `apps/analytics-api` service in this repo.
- [ ] Add v1 endpoints:
  - [ ] `GET /health`
  - [ ] `GET /metrics/events-over-time`
  - [ ] `GET /metrics/agent-contributions`
  - [ ] `GET /metrics/delivery-summary`
  - [ ] `GET /events/recent`
- [ ] Normalize response DTOs (UI should be backend-agnostic).
- [ ] Add pagination, date-range filters, and team/project filters.
- [ ] Add integration tests for endpoint correctness with Postgres.

### Exit Criteria
- Dashboard can render all v1 pages via API only (no DB-direct frontend queries).
- API contract is storage-provider-ready for future non-Postgres backends.

## Milestone 5: Reference App v1 (Observability + Delivery + Audit)
### Tasks
- [ ] Create `apps/dashboard` with three initial pages:
  - [ ] Overview (volume, active agents, success/failure status trend)
  - [ ] Contributions (agent/person/project output)
  - [ ] Audit Timeline (recent events with filters + drill-down)
- [ ] Add date filters (`today`, `7d`, `30d`, custom range).
- [ ] Add basic saved views and CSV export.
- [ ] Handle empty/no-data states and invalid filter states.

### Exit Criteria
- Team can answer "what did agents do today?" in under 30 seconds.
- Dashboard is usable on desktop and mobile.

## Milestone 6: Operational Readiness + Adoption
### Tasks
- [ ] Add docker-compose quickstart for:
  - [ ] Postgres
  - [ ] MCP server
  - [ ] analytics API
  - [ ] dashboard
- [ ] Add seeded demo dataset for first-run experience.
- [ ] Add docs for sink strategy:
  - [ ] default Postgres flow
  - [ ] webhook/jsonl + downstream ingestion flow
- [ ] Add CI jobs for analytics API + dashboard tests.

### Exit Criteria
- New user can run end-to-end local stack with one command.
- Value is visible without manual schema or dashboard setup.

## Suggested Build Order
1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5
6. Milestone 6

## v3 Definition of Done
- Profile-based schemas exist with a stable core contract.
- Postgres-backed insights are available through analytics API endpoints.
- Dashboard v1 delivers contribution + delivery + audit visibility.
- Architecture remains sink-pluggable while keeping default analytics experience strong.

## Explicit Defaults and Assumptions
- Default analytics backend for v3 quickstart is Postgres.
- `log_work` remains supported as the single runtime MCP tool during v3.
- Non-Postgres sinks are still supported for ingestion, but full dashboard UX requires:
  - either Postgres sink directly, or
  - downstream ingestion into Postgres-compatible analytics tables.
