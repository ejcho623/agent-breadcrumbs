# Agent Breadcrumbs Dashboard

Read-only dashboard for browsing `agent-breadcrumbs` logs.

- Data sources: `jsonl`, `postgres`
- Views: event feed, time series, status breakdown
- Filters: time range, actor, status, text search

## Run

From repo root:

```bash
npm --workspace apps/dashboard run build
npm --workspace apps/dashboard run start -- --config ./apps/dashboard/examples/dashboard-config.sample.json
```

## Config Examples

- `apps/dashboard/examples/dashboard-config.sample.json`
- `apps/dashboard/examples/dashboard-config.postgres.sample.json`

If no `--config` is provided, defaults are:

- host: `127.0.0.1`
- port: `4319`
- source: `jsonl` at `~/.agent-breadcrumbs/logs.jsonl`
