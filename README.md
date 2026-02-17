# Agent Breadcrumbs 🍞

Lightweight observability for agent work across clients (Codex, Claude, Cursor, ChatGPT, OpenClaw, and others).

## What You Get

- One MCP tool (`log_work`) that works across different agent clients.
- Define your own logging structure with custom schemas (or use built-in profiles).
- Config-driven output sinks:
  - local JSONL
  - webhook
  - Postgres
- Reusable schema profiles for common use cases:
  - agent insights
  - delivery tracking
  - audit trail
  - knowledge capture

This lets teams standardize logging once, then route data wherever they need it.

## Repository Layout

- MCP server package (published): `packages/mcp`
- Dashboard app (repo-local, not published): `apps/dashboard`

## Quick Start (Repo)

```bash
npm install
npm run build:all
```

Run MCP server locally with a sample config:

```bash
node packages/mcp/dist/index.js --config packages/mcp/examples/server-config.agent-insights.sample.json
```

Run dashboard locally:

```bash
npm run dev:dashboard -- --config apps/dashboard/examples/dashboard-config.sample.json
```

## MCP Config Model

Top-level config file is JSON and supports:

- `schema` for fully custom `log_record` properties, or
- `schema_profile` for built-in profile files in `packages/mcp/examples/schema_profiles`
- `sink` for destination settings (`jsonl`, `webhook`, `postgres`)

Do not set both `schema` and `schema_profile` together.

Default behavior when omitted:

- schema: built-in default (`agent_id`, `timestamp`, `work_summary`, `additional`)
- sink: `jsonl`
- output file: `~/.agent-breadcrumbs/logs.jsonl`

## Why Config

- Your schema/profile is applied directly to the MCP tool input schema.
- Agent clients see the required `log_record` fields from the tool definition.
- You do not need to repeatedly explain payload format for every tool call in client.

## Client Setup Examples

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "agent-breadcrumbs", "--config", "/absolute/path/to/server-config.json"]
```

`--config` is optional. If omitted, server defaults are used:

```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "agent-breadcrumbs"]
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

Example global instruction/system prompt for clients:

```text
When a meaningful chunk of work is completed, call log_work exactly once with
log_record matching the configured tool schema.
```

For full MCP server setup, config, and sink details, see `packages/mcp/README.md`.


## Common Commands

```bash
npm run build:mcp
npm run dev:mcp
npm run test
npm run test:integration
npm run build:dashboard
npm run dev:dashboard
```

## Docs

- MCP package docs: `packages/mcp/README.md`
- Dashboard app docs: `apps/dashboard/README.md`
- Client setup snippets: `CLIENT_SETUP_AND_VALIDATION.md`
