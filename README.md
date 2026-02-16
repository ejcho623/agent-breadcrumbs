# Agent Breadcrumbs MCP Server

Minimal MCP server for logging agent work with low response overhead.

## What v1 includes
- One tool: `log_work`
- Active schema from default `log_record` fields or `--properties-file`
- Sink model with connector selection (`--sink`)
- Tool input validation against active schema
- Local JSONL persistence for quick testing
- Minimal success ack: `{ "ok": true, "log_id": "..." }`

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
Default schema, default logging mode (`completion`):
```bash
npm start
```

With custom schema:
```bash
npm start -- --properties-file ./examples/log-record-properties.sample.json
```

With time guidance mode:
```bash
npm start -- --logging-mode time
```

With explicit sink file path:
```bash
npm start -- --sink jsonl --log-file /tmp/agent-breadcrumbs/logs.jsonl
```

## Tool shape
`log_work` input schema is built as:
- top-level `logging_mode` (`completion` | `time`)
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

## Persistence behavior (v1)
Default sink:
- `jsonl`

Default output file:
- `~/.agent-breadcrumbs/logs.jsonl`

Persisted entries include:
- `log_id`
- `server_timestamp`
- `log_record`

Operational controls (for example `logging_mode`) are not persisted.

Override location via:
- CLI: `--log-file <path>`

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
```

## Client setup and validation matrix
See `/Users/ejcho/Documents/projects/agent-breadcrumbs/CLIENT_SETUP_AND_VALIDATION.md`.

## Milestone status
See `/Users/ejcho/Documents/projects/agent-breadcrumbs/IMPLEMENTATION_TASK.md`.
