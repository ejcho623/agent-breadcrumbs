# Agent Breadcrumbs MCP Server

Minimal MCP server for logging agent work with low response overhead.

## What the current build includes
- One tool: `log_work`
- Active schema from default `log_record` fields or inline `config.schema`
- Config-first runtime via `--config <path>`
- Tool input validation against active schema
- Local JSONL persistence for quick testing (`jsonl` sink)
- Minimal success ack: `{ "ok": true, "log_id": "..." }`

Current sink status:
- Implemented: `jsonl`, `webhook`, `postgres`

## Requirements
- Node.js 18+

## Install
```bash
npm install
```

## Build
```bash
npm run build
```

## Run
Default runtime config (no args):
```bash
npm start
```

With config file:
```bash
npm start -- --config ./examples/server-config.sample.json
```

`jsonl` sample config:
```json
{
  "schema": {
    "task_id": { "type": "string" },
    "hours_spent": { "type": "number" }
  },
  "sink": {
    "name": "jsonl",
    "config": {
      "log_file": "/tmp/agent-breadcrumbs/logs.jsonl"
    }
  }
}
```

`webhook` sample config:
```json
{
  "sink": {
    "name": "webhook",
    "config": {
      "url": "https://example.com/ingest",
      "headers": {
        "authorization": "Bearer <token>"
      },
      "timeout_ms": 3000,
      "retry": {
        "max_attempts": 2,
        "backoff_ms": 250
      }
    }
  }
}
```

`postgres` sample config:
```json
{
  "sink": {
    "name": "postgres",
    "config": {
      "connection_string": "postgres://user:password@localhost:5432/agent_breadcrumbs",
      "table": "public.agent_logs",
      "timeout_ms": 5000,
      "retry": {
        "max_attempts": 1,
        "backoff_ms": 250
      }
    }
  }
}
```

Also available as files:
- `/Users/ejcho/Documents/projects/agent-breadcrumbs/examples/server-config.sample.json`
- `/Users/ejcho/Documents/projects/agent-breadcrumbs/examples/server-config.webhook.sample.json`
- `/Users/ejcho/Documents/projects/agent-breadcrumbs/examples/server-config.postgres.sample.json`

Postgres table bootstrap (recommended):
```sql
CREATE TABLE public.agent_logs (
  log_id TEXT PRIMARY KEY,
  server_timestamp TIMESTAMPTZ NOT NULL,
  log_record JSONB NOT NULL
);
```

## Tool shape
`log_work` input schema is built as:
- top-level `log_record` (persisted fields)
- required: `log_record`

Default `log_record` properties:
```json
{
  "agent_id": { "type": "string" },
  "timestamp": { "type": "string", "format": "date-time" },
  "work_summary": { "type": "string" },
  "additional": { "type": "object" }
}
```

## Persistence behavior
Default sink:
- `jsonl`

Default output file:
- `~/.agent-breadcrumbs/logs.jsonl`

Persisted entries include:
- `log_id`
- `server_timestamp`
- `log_record`

Override location via:
- config file: `sink.config.log_file`

## Guardrails (implementation-level)
Current hard caps:
- Max request payload bytes: `32768`
- Max `log_record` serialized bytes: `16384`
- Max `log_record` depth: `8`
- Max `log_record` keys: `256`

Over-limit payloads are rejected before write.

## Test
```bash
npm test
npm run test:integration
```

`npm run test:integration` notes:
- Postgres success + timeout integration cases run only when `POSTGRES_TEST_URL` is set.
- The unreachable-Postgres case runs without `POSTGRES_TEST_URL`.

Example:
```bash
export POSTGRES_TEST_URL="postgres://user:password@localhost:5432/agent_breadcrumbs"
npm run test:integration
```

## Client setup and validation matrix
See `/Users/ejcho/Documents/projects/agent-breadcrumbs/CLIENT_SETUP_AND_VALIDATION.md`.

## Milestone status
See `/Users/ejcho/Documents/projects/agent-breadcrumbs/IMPLEMENTATION_TASK_V2.md`.
