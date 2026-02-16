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
- Keep append-only event semantics so logs can support multiple downstream use cases.
- Do not scope v3 to any specific app/service UI implementation yet.

## Milestone 1: Schema Profile Packs (No Enforced Core Contract)
### Tasks
- [x] Define initial profile set:
  - [x] `agent_insights_v1`
  - [x] `delivery_tracking_v1`
  - [x] `audit_trail_v1`
  - [x] `knowledge_capture_v1`
- [x] Create example schema files per profile under `examples/schema_profiles/`.
- [x] Create full example server configs per profile under `examples/`.
- [x] Keep profile fields flexible; no hard required global field set.

### Exit Criteria
- Users can pick a use-case schema out of the box without writing custom schema JSON.
- Profiles are versioned and documented.
- Custom schemas remain fully supported.
- Profile marker fields remain optional and are never required for acceptance.

## Milestone 2: Config UX + Validation for Profile Selection
### Tasks
- [x] Extend config model to support `schema_profile` selection.
- [x] Keep support for custom inline `schema` alongside profiles.
- [x] Resolve selected profile schema at startup (same behavior as inline schema resolution).
- [x] Validate profile-related fields only if they are present in the selected profile.
- [x] Add migration guidance from arbitrary custom schema to profile-based schemas.

### Exit Criteria
- Users can choose a profile via config without writing full schema JSON manually.
- Inline custom schemas and profile schemas are both supported.

## Suggested Build Order
1. Milestone 1
2. Milestone 2

## v3 Definition of Done
- Profile-based schemas/configs are available out of the box for multiple use cases.
- No hard global core field contract is required.
- Architecture remains sink-pluggable and use-case-driven.

## Explicit Defaults and Assumptions
- Default analytics backend for v3 quickstart is Postgres.
- `log_work` remains supported as the single runtime MCP tool during v3.
- No analytics API service or dashboard app is included in v3 scope.
- Non-Postgres sinks are first-class for ingestion and may be analyzed through user-provided downstream systems.
- Documentation packaging/quickstart expansion is intentionally deferred beyond v3 scope.
