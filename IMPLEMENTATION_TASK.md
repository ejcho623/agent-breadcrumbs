# Agent Breadcrumbs v1 Implementation Tasks (Local-Testable MVP)

## Objective
Ship a minimal MCP server that can be run locally and tested from agent clients (Cursor, Claude, ChatGPT) with one tool (`log_work`), schema validation, and durable local logging.

## Scope (v1)
- In scope:
  - MCP server with `tools/list` + `tools/call` for `log_work`
  - `inputSchema` built from default `log_record` schema or custom schema file
  - Persist only `log_record` fields
  - Minimal ack response: `{ "ok": true, "log_id": "..." }`
  - Local destination for testing (JSONL file)
- Out of scope:
  - Multi-destination connectors (Postgres/Snowflake/etc.)
  - Auth, tenancy, dashboards, retries/queues
  - Scheduling guarantees for time-based logging

## Milestone 1: Project Scaffold + MCP Server Bootstrap
### Tasks
- [x] Initialize project (TypeScript) and package metadata.
- [x] Implement MCP transport startup/stdio wiring.
- [x] Implement `tools/list` returning `log_work`.
- [x] Add CLI args:
  - [x] `--properties-file <path>`
  - [x] `--sink <jsonl>`
  - [x] `--log-file <path>`
- [x] Generate `log_work.description` from active schema source.

### Exit Criteria
- Server starts from terminal without errors.
- Client can discover `log_work` from `tools/list`.

## Milestone 2: Schema Assembly + Validation
### Tasks
- [x] Define default `log_record` schema.
- [x] Load optional custom schema file (interpreted as `log_record.properties`).
- [x] Assemble final `inputSchema`:
  - [x] top-level `log_record` (object)
  - [x] `required: ["log_record"]`
- [x] Validate incoming `log_work` args against active schema.
- [x] Reject invalid input with clear tool error.

### Exit Criteria
- Valid inputs pass.
- Missing/invalid `log_record` fails.
- Custom schema overrides default `log_record.properties`.

## Milestone 3: Persistence (Local JSONL)
### Tasks
- [x] Implement local sink writing one JSON object per line to a file (e.g. `./data/logs.jsonl`).
- [x] Persist only:
  - [x] `log_record`
  - [x] generated metadata (`log_id`, server timestamp)
- [x] Return minimal ack only.

### Exit Criteria
- Each valid call appends one line.
- Ack format is exactly minimal contract.
- Stored record includes only `log_record` + server metadata.

## Milestone 4: Guardrails (Implementation-Level)
### Tasks
- [x] Add max request-size cap.
- [x] Add max `log_record` serialized-size cap.
- [x] Add max object depth/key-count checks before write.
- [x] Fail safely on oversized/invalid payloads (no partial writes).

### Exit Criteria
- Oversized/malicious payloads are rejected predictably.
- Server remains responsive under repeated bad inputs.

## Milestone 5: Local Client Validation Matrix
### Tasks
- [x] Create client setup snippets for:
  - [x] Codex
  - [x] Claude Code
  - [x] Cursor
  - [x] Claude Desktop
  - [x] ChatGPT (MCP server config)
- [x] Test scenarios:
  - [x] happy path
  - [x] tool description reflects schema source guidance
  - [x] Custom schema file path load
  - [x] Invalid payload rejection
- [x] Capture test evidence (commands + expected/actual + sample log lines).

### Exit Criteria
- At least one successful `log_work` call from automated integration tests.
- Setup snippets documented for each target client.
- JSONL output confirms persisted shape.

## Milestone 6: Release-Ready Basics
### Tasks
- [x] Add README with quickstart and examples.
- [x] Add sample custom schema JSON.
- [x] Add npm scripts (`start`, `dev`, `test` if present).
- [x] Pin minimal version and changelog notes for v1.

### Exit Criteria
- New user can run local server and log from a client in <10 minutes.

## Suggested Build Order
1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 5 (basic validation early)
5. Milestone 4
6. Milestone 6

## v1 Definition of Done
- `log_work` is discoverable and callable from local MCP clients.
- Active schema is default or custom (`--properties-file`).
- Persisted output contains only `log_record` + server metadata.
- Minimal ack response contract is stable.
