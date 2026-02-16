# Agent Breadcrumbs v2 Implementation Tasks (Webhook + Postgres Sinks)

## Objective
Extend the server with first-class `webhook` and `postgres` sinks while keeping the MCP tool contract minimal (`log_work` + tiny ack) and configuration easy to reason about.

## Scope (v2)
- In scope:
  - Single server config file (`--config <path>`) as primary runtime configuration.
  - New sinks: `webhook`, `postgres` (in addition to existing `jsonl`).
  - Sink-specific validation and integration tests.
  - Docs and client setup updates for new config model.
- Out of scope:
  - Queueing/buffering subsystem.
  - Exactly-once delivery guarantees.
  - Vendor-specific project management sinks (Notion/Jira/etc.) in core.

## Milestone 1: Unified Config Foundation
### Tasks
- [x] Add `--config <path>` CLI option.
- [x] Define v2 config shape:
  - [x] `schema` (inline `log_record.properties` map)
  - [x] `sink` (`name` + `config`)
- [x] Remove legacy runtime flags (`--properties-file`, `--sink`, `--log-file`) in the same change that introduces `--config`.
- [x] Define precedence clearly (for v2 target behavior): CLI > config > built-in defaults.
- [x] Add tests for config resolution and validation:
  - [x] valid config load
  - [x] missing/invalid config failure
  - [x] legacy flag rejection with actionable migration message

### Exit Criteria
- Server starts with only `--config`.
- Legacy runtime flags are rejected with actionable errors that point users to `--config`.
- Invalid config fails fast with actionable errors.
- Config tests pass in default test suite.

## Milestone 2: Sink Interface + Registry
### Tasks
- [x] Expand sink union to include `jsonl`, `webhook`, `postgres`.
- [x] Add sink factory/registry with per-sink config parsing.
- [x] Ensure persisted record envelope remains:
  - [x] `log_id`
  - [x] `server_timestamp`
  - [x] `log_record`
- [x] Add tests for sink resolution and envelope consistency across sink implementations.

### Exit Criteria
- Sink selection is driven entirely by resolved config.
- `log_work` response contract remains unchanged.
- Registry/envelope tests pass.

## Milestone 3: Webhook Sink
### Tasks
- [ ] Implement HTTP POST sink with:
  - [ ] URL
  - [ ] headers
  - [ ] timeout
  - [ ] retry policy (bounded attempts/backoff)
- [ ] Implement safe error classification (timeout vs non-2xx vs transport).
- [ ] Add idempotency guidance using `log_id` in payload.
- [ ] Add fast webhook tests (`npm test`) with in-process `node:http` server:
  - [ ] request envelope shape (`log_id`, `server_timestamp`, `log_record`)
  - [ ] header forwarding/auth behavior
  - [ ] timeout + retry behavior on controlled failures
- [ ] Add webhook integration tests (`npm run test:integration`) with scripted response patterns.

### Exit Criteria
- Successful calls deliver envelope to configured endpoint.
- Failures produce deterministic tool errors.
- Webhook fast + integration tests pass.

## Milestone 4: Postgres Sink
### Tasks
- [ ] Implement Postgres sink with connection string + target table config.
- [ ] Create insert path for envelope + `log_record` JSON.
- [ ] Add basic schema bootstrap doc (recommended table DDL).
- [ ] Add connection/retry timeout guardrails.
- [ ] Add fast Postgres tests (`npm test`) for config validation and deterministic error mapping (no real DB).
- [ ] Add Postgres integration tests (`npm run test:integration`) with ephemeral Postgres:
  - [ ] create test table
  - [ ] assert one-row insert per successful `log_work`
  - [ ] verify stored envelope + payload structure
  - [ ] validate expected failure paths (bad credentials/unreachable DB/timeout)

### Exit Criteria
- Valid calls insert one row per event.
- Inserted row preserves envelope + payload structure.
- Postgres fast + integration tests pass.

## Milestone 5: Validation + Docs
### Tasks
- [ ] Update README with v2 config examples:
  - [ ] single `jsonl`
  - [ ] single `webhook`
  - [ ] single `postgres`
- [ ] Update client setup docs to prefer `--config`.
- [ ] Add `npm run test:integration` command and document local prerequisites.

### Exit Criteria
- `npm test` and `npm run test:integration` are both documented and runnable.
- New user can configure and run any supported sink with one config file.

## Suggested Build Order
1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5

## v2 Definition of Done
- `log_work` remains the only MCP runtime tool and returns minimal ack.
- Users can choose `jsonl`, `webhook`, or `postgres` via a single config file.
- Persisted envelope contract is stable across all sinks.
- Integration tests verify sink behavior and failure handling.
