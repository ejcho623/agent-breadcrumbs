# Agent Breadcrumbs MCP Server Spec (v0.1)

## Summary
Agent Breadcrumbs is an open-source MCP server for logging agent activity to user-owned destinations (Postgres, Snowflake, Databricks, SQL, webhook, etc.).  
Goal: lightweight, cross-vendor observability for agents with minimal setup and minimal context consumption.

## Benefits
- Powerful observability: Keep track of agent usage patterns for individuals and across team members.
- Lightweight & flexible: Simple MCP connection to keep track across tools/vendors (Claude, ChatGPT, Cursor, etc.).
- Small context window consumption: tool responses are tiny acks (`ok`, `log_id`).
- BYO storage: logs are written to customer-owned DB/datalake/webhook.

## Core Design
- One runtime MCP tool: `log_work`.
- One active log-record field schema at runtime:
  - Default log-record schema if no custom schema is provided.
  - Custom log-record schema if provided at startup.
- `log_work` input has:
  - top-level operational controls (for example `logging_mode`), not persisted.
  - `log_record` object containing fields that are persisted.
- Always validate tool input against active schema.
- Return minimal ack response only.

## Important Schema Clarification
- MCP `inputSchema` is a JSON Schema contract used for tool validation/discovery.
- JSON Schema metadata (`type`, `required`, `additionalProperties`, etc.) is not stored in the DB.
- Persisted record shape is an envelope plus payload:
  - envelope (server-managed): `log_id`, `server_timestamp`
  - payload (schema-defined): `log_record`
- `log_record` values come from runtime tool input and are the only schema-customizable persisted fields.
- Runtime control settings (for example `logging_mode`) are operational inputs and should not be persisted as log row fields.
- Customization scope: users replace `log_record.properties` only; server wraps it into full `inputSchema`.

## MCP Tool Contract
Tool name: `log_work`

Recommended tool description guidance:
- The server should generate `log_work.description` at startup based on:
  - default `logging_mode` (`completion` or `time`)
  - active schema source (default log-record schema vs user-provided custom `log_record.properties`)
- Description should reflect logging policy and current field contract.
- `inputSchema.properties` should include top-level operational inputs plus `log_record`.
- Example (`completion` + default schema):
  - `Log agent work events on meaningful progress/completion. Use top-level logging_mode and provide persisted fields under log_record.`
- Example (`time` + custom schema):
  - `Log agent work events on a regular interval when possible (best-effort on unmanaged clients). Use top-level logging_mode and provide custom persisted fields under log_record.`

Example tool result:
```json
{
  "ok": true,
  "log_id": "abc123"
}
```

Example persisted record:
```json
{
  "log_id": "abc123",
  "server_timestamp": "2026-02-14T07:51:23.067Z",
  "log_record": {
    "agent_id": "agent-1",
    "timestamp": "2026-02-14T07:51:23.063Z",
    "work_summary": "completed milestone test",
    "additional": { "source": "smoke" }
  }
}
```

## Default `inputSchema` Shape
```json
{
  "type": "object",
  "properties": {
    "logging_mode": { "type": "string", "enum": ["completion", "time"] },
    "log_record": {
      "type": "object",
      "properties": {
        "agent_id": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" },
        "work_summary": { "type": "string" },
        "additional": { "type": "object" }
      }
    }
  },
  "required": ["log_record"]
}
```

## Custom Log Record Schema (`log_record.properties`) Example
```json
{
  "agent_id": { "type": "string" },
  "timestamp": { "type": "string", "format": "date-time" },
  "task_id": { "type": "string" },
  "summary": { "type": "string" },
  "hours_spent": { "type": "number" }
}
```

Server wraps custom log-record schema into:
```json
{
  "type": "object",
  "properties": {
    "logging_mode": { "type": "string", "enum": ["completion", "time"] },
    "log_record": {
      "type": "object",
      "properties": {
        "agent_id": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" },
        "task_id": { "type": "string" },
        "summary": { "type": "string" },
        "hours_spent": { "type": "number" }
      }
    }
  },
  "required": ["log_record"]
}
```

## Payload Safety Guardrails
- During server implementation, enforce hard safety caps independent of schema (for example max request bytes, max `log_record` bytes, max nesting depth, and rate limits).
- Reject over-limit payloads with a minimal error response and do not attempt to write partial records.

## Client Logging Guidance
- Put logging behavior guidance in the MCP tool definition (`description`).
- Treat tool description text as runtime-generated, not static.
- If `logging_mode=completion`, description should instruct progress/completion-triggered logging.
- If `logging_mode=time`, description should instruct periodic logging and note best-effort behavior on unmanaged clients.
- If custom log-record fields are loaded, description should explicitly say the active persisted field contract is custom and defined by `inputSchema.properties.log_record.properties`.
- If default log-record fields are used, description should explicitly say the default persisted field contract is active.
- `logging_mode` values (operational input, not persisted):
  - `completion`: client should call `log_work` on meaningful progress/completion.
  - `time`: client should call `log_work` on a regular interval when possible.
- For unmanaged clients (for example Claude/ChatGPT integrations you do not control), `time` is advisory and best-effort, not guaranteed scheduling.
- MCP servers cannot force future timed tool calls; tool calls are initiated by the client/model runtime.

## Setup

### 1) Start MCP server with default schema
```bash
npx -y @agent-breadcrumbs/mcp-server
```

### 2) Start MCP server with custom log-record schema (`log_record.properties` file)
```bash
npx -y @agent-breadcrumbs/mcp-server --properties-file /path/to/log-properties.json
```

### 3) Start MCP server with a logging mode
```bash
npx -y @agent-breadcrumbs/mcp-server --logging-mode time
```

### 4) Codex config example (default)
```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "@agent-breadcrumbs/mcp-server"]
```

### 5) Codex config example (custom log-record properties file + logging mode)
```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "@agent-breadcrumbs/mcp-server", "--properties-file", "/path/to/log-properties.json", "--logging-mode", "time"]
```
