# Agent Breadcrumbs 🍞

Lightweight logging & observability for agent work across clients (Codex, Claude, Cursor, ChatGPT, OpenClaw, and others).

https://github.com/user-attachments/assets/b78cfb0c-707e-4a97-b751-a7ac15dc61da

## What You Get

- One MCP tool (`log_work`) that aggregates work done across different agents for single or multiple users.
- Define your own logging structure with custom schemas (or use built-in profiles) once, and the MCP schema 
will guide clients to log with correct payloads. 
- This lets teams standardize logging once, then route data wherever they need it.
- Multiple options for output sinks:
  - local JSONL
  - webhook
  - Postgres
- Starter schema profiles for common use cases:
  - agent insights
  - delivery tracking
  - audit trail
  - knowledge capture
- Simple dashboard app to view logged work.

## Repository Layout

- MCP server package (published): `packages/mcp`
- Dashboard app (repo-local, not published): `apps/dashboard`

## Quick Start (MCP)

Install and run with defaults:

```bash
npx -y agent-breadcrumbs
```

Use with an explicit config file:

```bash
npx -y agent-breadcrumbs --config /absolute/path/to/server-config.json
```

Codex config example (`~/.codex/config.toml`):

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
When a meaningful chunk of work is completed, use log_work with agent_breadcrumbs to record your work.
```

For cron-driven workflows (e.g., OpenClaw), instruct agents to call log_work on each scheduled run
for regular time-based logging.

For full MCP server setup, config, and sink details, see `packages/mcp/README.md`.

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
