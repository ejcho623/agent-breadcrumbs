# Agent Breadcrumbs MCP Server

`agent-breadcrumbs` is a config-first MCP server that exposes one tool, `log_work`, for structured agent activity logging.

## Why Use It

- Works across MCP-compatible clients with the same tool contract.
- Routes logs to multiple sinks (`jsonl`, `webhook`, `postgres`) without code changes.
- Supports reusable schema profiles or fully custom schemas.
- Returns deterministic validation/persistence errors for easier automation.

## Key Config Benefit

When you start the server with `--config`, the configured schema/profile is used to build the tool input schema.
That means agent clients receive field-level structure from MCP directly, so you do not need to keep re-describing
what `log_record` should contain in every prompt.

## Install And Run

Show CLI help:

```bash
npx -y agent-breadcrumbs --help
```

Run with defaults (no config file):

```bash
npx -y agent-breadcrumbs
```

Run with config file:

```bash
npx -y agent-breadcrumbs --config /absolute/path/to/server-config.json
```

Client config example (`~/.codex/config.toml`):

```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "agent-breadcrumbs", "--config", "/absolute/path/to/server-config.json"]
```

`--config` is optional. If omitted, built-in defaults are used:

```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "agent-breadcrumbs"]
```

## Tool Contract

- Tool name: `log_work`
- Input: `{"log_record": { ... }}` where fields are defined by active schema/profile
- Success response: `{ "ok": true, "log_id": "<uuid>" }`
- Persisted envelope in all sinks:

```json
{
  "log_id": "uuid",
  "server_timestamp": "2026-02-17T00:00:00.000Z",
  "log_record": {}
}
```

## Configuration

Pass a JSON config file via `--config`.

Top-level keys:

- `schema` (object): custom `log_record` JSON-schema-like property map
- `schema_profile` (string): loads a built-in profile from `examples/schema_profiles/*.json`
- `user_name` (string, optional): server-side identity to inject into each persisted log record
- `sink` (object): sink type + sink config

Rules:

- Set either `schema` or `schema_profile`, not both.
- If both are omitted, built-in default schema is used:
  - `agent_id: string`
  - `timestamp: string(date-time)`
  - `work_summary: string`
  - `additional: object`
- If `sink` is omitted, defaults to JSONL at `~/.agent-breadcrumbs/logs.jsonl`.
- If you need your own structure, use `schema` to define custom fields and types.

When `user_name` is configured, the server injects:

- `log_record.user_name`

### Built-In Schema Profiles

- `default_v1`
- `agent_insights_v1` (`model`, `tool`, `project`, `timestamp`, `event_type`, `status`, `work_summary`, `duration_ms`, `run_id`, `additional`)
- `delivery_tracking_v1`
- `audit_trail_v1`
- `knowledge_capture_v1`

### Sink Config Reference

`jsonl`:

- `sink.name = "jsonl"`
- `sink.config.log_file` (string, optional)
- If relative, resolved from config file directory.

`webhook`:

- `sink.name = "webhook"`
- `sink.config.url` (required)
- `sink.config.headers` (optional map, default `{}`)
- `sink.config.timeout_ms` (optional, default `3000`)
- `sink.config.retry.max_attempts` (optional, default `0`)
- `sink.config.retry.backoff_ms` (optional, default `250`)

`postgres`:

- `sink.name = "postgres"`
- `sink.config.connection_string` (required)
- `sink.config.table` (required: `table` or `schema.table`)
- `sink.config.timeout_ms` (optional, default `5000`)
- `sink.config.retry.max_attempts` (optional, default `0`)
- `sink.config.retry.backoff_ms` (optional, default `250`)

### Example Configs

Profile + JSONL:

```json
{
  "schema_profile": "agent_insights_v1",
  "user_name": "ejcho623",
  "sink": {
    "name": "jsonl",
    "config": {
      "log_file": "/tmp/agent-breadcrumbs/agent-insights.logs.jsonl"
    }
  }
}
```

Custom schema + JSONL:

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

Webhook sink:

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

Postgres sink:

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

Additional examples are in `examples/server-config*.sample.json`.

## Client Setup Examples

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "agent-breadcrumbs", "--config", "/absolute/path/to/server-config.json"]
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-breadcrumbs": {
      "command": "npx",
      "args": ["-y", "agent-breadcrumbs", "--config", "/absolute/path/to/server-config.json"]
    }
  }
}
```

Cursor (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agent-breadcrumbs": {
      "command": "npx",
      "args": ["-y", "agent-breadcrumbs", "--config", "/absolute/path/to/server-config.json"]
    }
  }
}
```

Recommended global instruction/system prompt:

```text
Call log_work when a meaningful unit of work is completed. Use exactly the
fields defined by the log_work tool schema and keep payloads concise.
```

## Reliability And Error Behavior

- Webhook retries on timeout/transport errors and retryable HTTP status codes (`408`, `425`, `429`, `500`, `502`, `503`, `504`).
- Postgres retries on timeout/transport and retryable query failures.
- 4xx webhook non-retryable errors fail fast.
- Invalid input returns tool-level error responses (not process crash).

## Guardrails

`log_work` enforces payload limits:

- request max size: `32 KB`
- `log_record` max size: `16 KB`
- `log_record` max depth: `8`
- `log_record` max total keys: `256`

## Postgres Bootstrap

```sql
CREATE TABLE public.agent_logs (
  log_id TEXT PRIMARY KEY,
  server_timestamp TIMESTAMPTZ NOT NULL,
  log_record JSONB NOT NULL
);
```

## Development

From `packages/mcp`:

```bash
npm run build
npm run test
npm run test:integration
```
