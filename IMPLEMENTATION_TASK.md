# Agent Breadcrumbs v1 Implementation Tasks (Local-Testable MVP)

## Objective
Ship a minimal MCP server that can be run locally and tested from agent clients (Cursor, Claude, ChatGPT) with one tool (`log_work`), schema validation, and durable local logging.

## Scope (v1)
- In scope:
  - MCP server with `tools/list` + `tools/call` for `log_work`
  - `inputSchema` built from default `log_record` schema or custom schema file
  - Top-level operational input: `logging_mode` (`completion` | `time`)
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
  - [x] `--logging-mode <completion|time>` (default `completion`)
- [x] Generate `log_work.description` from active logging mode + schema source.

### Exit Criteria
- Server starts from terminal without errors.
- Client can discover `log_work` from `tools/list`.

## Milestone 2: Schema Assembly + Validation
### Tasks
- [ ] Define default `log_record` schema.
- [ ] Load optional custom schema file (interpreted as `log_record.properties`).
- [ ] Assemble final `inputSchema`:
  - [ ] top-level `logging_mode`
  - [ ] top-level `log_record` (object)
  - [ ] `required: ["log_record"]`
- [ ] Validate incoming `log_work` args against active schema.
- [ ] Reject invalid input with clear tool error.

### Exit Criteria
- Valid inputs pass.
- Missing/invalid `log_record` fails.
- Custom schema overrides default `log_record.properties`.

## Milestone 3: Persistence (Local JSONL)
### Tasks
- [ ] Implement local sink writing one JSON object per line to a file (e.g. `./data/logs.jsonl`).
- [ ] Persist only:
  - [ ] `log_record`
  - [ ] generated metadata (`log_id`, server timestamp)
- [ ] Do not persist operational controls (e.g. top-level `logging_mode`).
- [ ] Return minimal ack only.

### Exit Criteria
- Each valid call appends one line.
- Ack format is exactly minimal contract.
- Stored record excludes `logging_mode`.

## Milestone 4: Guardrails (Implementation-Level)
### Tasks
- [ ] Add max request-size cap.
- [ ] Add max `log_record` serialized-size cap.
- [ ] Add max object depth/key-count checks before write.
- [ ] Fail safely on oversized/invalid payloads (no partial writes).

### Exit Criteria
- Oversized/malicious payloads are rejected predictably.
- Server remains responsive under repeated bad inputs.

## Milestone 5: Local Client Validation Matrix
### Tasks
- [ ] Create client setup snippets for:
  - [ ] Codex
  - [ ] Claude Code
  - [ ] Cursor
  - [ ] Claude Desktop
  - [ ] ChatGPT (MCP server config)
- [ ] Test scenarios:
  - [ ] `logging_mode=completion` happy path
  - [ ] `logging_mode=time` guidance visible in tool description
  - [ ] Custom schema file path load
  - [ ] Invalid payload rejection
- [ ] Capture test evidence (commands + expected/actual + sample log lines).

### Exit Criteria
- At least one successful `log_work` call from each client.
- JSONL output confirms persisted shape.

## Milestone 6: Release-Ready Basics
### Tasks
- [ ] Add README with quickstart and examples.
- [ ] Add sample custom schema JSON.
- [ ] Add npm scripts (`start`, `dev`, `test` if present).
- [ ] Pin minimal version and changelog notes for v1.

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
- `logging_mode` guidance is reflected in tool description.
- Persisted output contains only `log_record` + server metadata.
- Minimal ack response contract is stable.
