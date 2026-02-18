# Agent Breadcrumbs 🍞

Lightweight logging & observability for agent work across clients (Codex, Claude, Cursor, ChatGPT, OpenClaw, and others).

https://github.com/user-attachments/assets/3eac31a8-107c-4a82-a14c-dcfa500dd1a9

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

### Codex config example (`~/.codex/config.toml`):
```toml
[mcp_servers.agent_breadcrumbs]
command = "npx"
args = ["-y", "agent-breadcrumbs", "--config", "/absolute/path/to/server-config.json"]
```

`--config` is optional. If omitted, server defaults are used:

<img width="1171" height="491" alt="Screenshot 2026-02-18 at 11 20 21 AM" src="https://github.com/user-attachments/assets/0340fa51-8ad0-4533-80df-e3b10166b0c6" />
<img width="1170" height="561" alt="Screenshot 2026-02-18 at 11 20 26 AM" src="https://github.com/user-attachments/assets/b5a8823b-68a1-4284-a4ed-2de9010efb1f" />

### Claude Desktop (`claude_desktop_config.json`):
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

<img width="1267" height="878" alt="Screenshot 2026-02-18 at 11 21 15 AM" src="https://github.com/user-attachments/assets/faa646f3-843a-4501-8d60-266e7f69b838" /><img width="1267" height="878" alt="Screenshot 2026-02-18 at 11 21 21 AM" src="https://github.com/user-attachments/assets/2e690d3c-4d9b-4370-a14d-2b8c5d95c33b" />

### OpenClaw:
After you install the MCP server make sure to use mcporter so the server can be called through the CLI. 
Then add a system prompt to the channel you're using.

<img width="810" height="473" alt="Screenshot 2026-02-18 at 11 23 58 AM" src="https://github.com/user-attachments/assets/9fc7095d-9582-423f-822c-8e6926d458fb" />

For cron-driven workflows, instruct agents to call log_work on each scheduled run
for regular time-based logging.

```text
Every hour, make sure to use mcporter agent-breadcrumbs.log_work to log work.
If spinning up a cron job, make sure to add this context (e.g., logging work every hour) in the cron job description as well.
```

General example global instruction/system prompt for clients:

```text
When a meaningful chunk of work is completed, use log_work with agent_breadcrumbs to record your work.
```

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
