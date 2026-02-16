# Agent Breadcrumbs v2 Implementation Tasks (Webhook + Postgres Sinks)

## Objective
Extend the server with first-class `webhook` and `postgres` sinks while keeping the MCP tool contract minimal (`log_work` + tiny ack) and configuration easy to reason about.

## Scope (v2)
- In scope:
  - Single server config file (`--config <path>`) as primary runtime configuration.
  - New sinks: `webhook`, `postgres` (in addition to existing `jsonl`).
  - Optional multi-sink fanout (`multi`) with explicit delivery mode.
  - Sink-specific validation and integration tests.
  - Docs and client setup updates for new config model.
- Out of scope:
  - Queueing/buffering subsystem.
  - Exactly-once delivery guarantees.
  - Vendor-specific project management sinks (Notion/Jira/etc.) in core.

## Milestone 1: Unified Config Foundation
### Tasks
- [ ] Add `--config <path>` CLI option.
- [ ] Define v2 config shape:
  - [ ] `schema` (inline `log_record.properties` map)
  - [ ] `sink` (`name` + `config`)
- [ ] Remove legacy runtime flags (`--properties-file`, `--sink`, `--log-file`) in the same change that introduces `--config`.
- [ ] Define precedence clearly (for v2 target behavior): CLI > config > built-in defaults.

### Exit Criteria
- Server starts with only `--config`.
- Legacy runtime flags are rejected with actionable errors that point users to `--config`.
- Invalid config fails fast with actionable errors.

## Milestone 2: Sink Interface + Registry
### Tasks
- [ ] Expand sink union to include `jsonl`, `webhook`, `postgres`, `multi`.
- [ ] Add sink factory/registry with per-sink config parsing.
- [ ] Ensure persisted record envelope remains:
  - [ ] `log_id`
  - [ ] `server_timestamp`
  - [ ] `log_record`

### Exit Criteria
- Sink selection is driven entirely by resolved config.
- `log_work` response contract remains unchanged.

## Milestone 3: Webhook Sink
### Tasks
- [ ] Implement HTTP POST sink with:
  - [ ] URL
  - [ ] headers
  - [ ] timeout
  - [ ] retry policy (bounded attempts/backoff)
- [ ] Implement safe error classification (timeout vs non-2xx vs transport).
- [ ] Add idempotency guidance using `log_id` in payload.

### Exit Criteria
- Successful calls deliver envelope to configured endpoint.
- Failures produce deterministic tool errors (or follow multi-sink delivery mode rules).

## Milestone 4: Postgres Sink
### Tasks
- [ ] Implement Postgres sink with connection string + target table config.
- [ ] Create insert path for envelope + `log_record` JSON.
- [ ] Add basic schema bootstrap doc (recommended table DDL).
- [ ] Add connection/retry timeout guardrails.

### Exit Criteria
- Valid calls insert one row per event.
- Inserted row preserves envelope + payload structure.

## Milestone 5: Multi-Sink Fanout
### Tasks
- [ ] Implement `multi` sink target list.
- [ ] Support multiple targets of the same sink type (for example two `webhook` targets).
- [ ] Require unique `target.id` per target for deterministic error/reporting attribution.
- [ ] Execute writes in parallel with per-target timeout.
- [ ] Support delivery modes:
  - [ ] `all` (all targets must succeed)
  - [ ] `any` (at least one target succeeds)
  - [ ] `best_effort` (ack success, surface internal sink failures in logs)

### Exit Criteria
- Fanout behavior is deterministic for each delivery mode.
- One `log_id` is shared across all targets for the same call.
- Configuration supports same-type target fanout (for example customer webhook + Agent Breadcrumbs cloud webhook).

## Milestone 6: Validation + Docs
### Tasks
- [ ] Extend integration tests:
  - [ ] webhook happy path + failure path
  - [ ] postgres happy path + failure path
  - [ ] multi-sink mode behavior
- [ ] Update README with v2 config examples:
  - [ ] single `jsonl`
  - [ ] single `webhook`
  - [ ] single `postgres`
  - [ ] `multi` fanout
  - [ ] `multi` fanout with duplicate sink type targets using distinct `target.id`
- [ ] Update client setup docs to prefer `--config`.

### Exit Criteria
- `npm test` covers all added sink flows.
- New user can configure and run any supported sink with one config file.

## Testing Strategy (v2)
### Fast test suite (`npm test`)
- [ ] Keep default suite container-free and quick.
- [ ] Webhook sink tests use an in-process local HTTP server (`node:http`) to validate:
  - [ ] request envelope shape (`log_id`, `server_timestamp`, `log_record`)
  - [ ] header forwarding/auth header behavior
  - [ ] timeout and retry behavior with controlled non-2xx/slow responses
- [ ] Postgres sink in fast suite validates:
  - [ ] config parsing and validation
  - [ ] deterministic error mapping without requiring a real database

### Integration suite (`npm run test:integration`)
- [ ] Add dedicated integration command for heavier sink tests.
- [ ] Webhook integration tests:
  - [ ] real HTTP listener with scripted response patterns (2xx, 4xx/5xx, timeout)
- [ ] Postgres integration tests:
  - [ ] spin up ephemeral Postgres (Docker/Testcontainers)
  - [ ] create test table
  - [ ] assert one-row insert per successful `log_work` call
  - [ ] verify stored envelope + payload structure
  - [ ] validate expected failure behavior (bad credentials/unreachable DB/timeout)

### CI execution model
- [ ] Run fast suite on every PR.
- [ ] Run integration suite on main/nightly (or required PR job once stable).
- [ ] Publish clear pass/fail evidence in CI logs for each sink mode.

## Suggested Build Order
1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5
6. Milestone 6

## v2 Definition of Done
- `log_work` remains the only MCP runtime tool and returns minimal ack.
- Users can choose `jsonl`, `webhook`, `postgres`, or `multi` via a single config file.
- Persisted envelope contract is stable across all sinks.
- Integration tests verify sink behavior and failure handling.
