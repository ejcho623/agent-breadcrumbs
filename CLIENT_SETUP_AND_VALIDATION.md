# Client Setup And Validation (config-first runtime)

This file tracks setup snippets for supported clients and evidence from local validation runs.

## Shared config file
Create a server config file and reference it from client startup args:

```json
{
  "sink": {
    "name": "jsonl",
    "config": {
      "log_file": "/Users/ejcho/.agent-breadcrumbs/logs.jsonl"
    }
  }
}
```

## 1) Codex
Add server via CLI:
```bash
codex mcp add agent-breadcrumbs -- node /Users/ejcho/Documents/projects/agent-breadcrumbs/dist/index.js --config /Users/ejcho/.agent-breadcrumbs/server-config.json
```

Or via config (`~/.codex/config.toml`):
```toml
[mcp_servers.agent_breadcrumbs]
command = "node"
args = ["/Users/ejcho/Documents/projects/agent-breadcrumbs/dist/index.js", "--config", "/Users/ejcho/.agent-breadcrumbs/server-config.json"]
```

## 2) Claude Code
Add server via CLI:
```bash
claude mcp add agent-breadcrumbs node /Users/ejcho/Documents/projects/agent-breadcrumbs/dist/index.js --config /Users/ejcho/.agent-breadcrumbs/server-config.json
```

Project-scoped JSON alternative:
```bash
claude mcp add-json agent-breadcrumbs '{"type":"stdio","command":"node","args":["/Users/ejcho/Documents/projects/agent-breadcrumbs/dist/index.js","--config","/Users/ejcho/.agent-breadcrumbs/server-config.json"]}'
```

## 3) Cursor
Project config (`.cursor/mcp.json`) or global (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "agent-breadcrumbs": {
      "command": "node",
      "args": [
        "/Users/ejcho/Documents/projects/agent-breadcrumbs/dist/index.js",
        "--config",
        "/Users/ejcho/.agent-breadcrumbs/server-config.json"
      ]
    }
  }
}
```

## 4) Claude Desktop
In Claude Desktop: Settings -> Developer -> Edit Config, then add:
```json
{
  "mcpServers": {
    "agent-breadcrumbs": {
      "command": "node",
      "args": [
        "/Users/ejcho/Documents/projects/agent-breadcrumbs/dist/index.js",
        "--config",
        "/Users/ejcho/.agent-breadcrumbs/server-config.json"
      ]
    }
  }
}
```

## 5) ChatGPT
ChatGPT supports remote MCP connectors (Developer Mode / Connectors). It does not support directly running local `stdio` servers from the ChatGPT product itself.

For ChatGPT testing, deploy this server behind a remote MCP endpoint (HTTP/SSE/streamable transport) and add it as a custom connector in ChatGPT.

## Validation Evidence

### Automated integration tests
Command:
```bash
npm test
```

Covers:
- happy path with default tool contract
- custom schema load + validation
- invalid payload rejection
- config file validation failures
- legacy flag rejection with migration guidance
- webhook envelope/header/retry behavior
- startup behavior for unimplemented sinks (`postgres`)
- JSONL persistence shape (`log_record` + server metadata only)
- guardrail rejection for oversized payloads
- guardrail rejection for excessive nesting depth
- resilience after repeated rejected payloads

Latest run (2026-02-16):
```text
✔ log_work success path persists only log_record + metadata
✔ schema validation rejects missing required log_record
✔ custom schema overrides default log_record properties
✔ server startup fails when --config points to a missing file
✔ server startup fails when config file contains invalid JSON
✔ server startup rejects legacy runtime flags with migration guidance
✔ webhook sink sends envelope and forwards headers
✔ webhook sink retries after timeout and eventually succeeds
✔ webhook sink returns deterministic non-2xx error and does not retry 4xx
✔ server startup accepts postgres sink config but reports not implemented
✔ guardrails reject oversized log_record payloads
✔ guardrails reject excessive nesting depth
✔ server remains responsive after repeated rejected requests
tests 13
pass 13
fail 0
```

### Webhook integration tests
Command:
```bash
npm run test:integration
```

Latest run (2026-02-16):
```text
✔ webhook integration retries scripted 5xx responses and then succeeds
✔ webhook integration returns deterministic error after retries are exhausted
tests 2
pass 2
fail 0
```

Sample persisted JSONL line:
```json
{"log_id":"ee924a1e-16e3-45b2-a6f9-2786ddca3751","server_timestamp":"2026-02-14T07:51:23.067Z","log_record":{"agent_id":"agent-1","timestamp":"2026-02-14T07:51:23.063Z","work_summary":"completed milestone test","additional":{"source":"smoke"}}}
```

### Manual app checks
The snippets above are ready for manual verification in:
- Codex
- Claude Code
- Cursor
- Claude Desktop
- ChatGPT (remote connector path)

## References
- Codex MCP management: https://platform.openai.com/docs/guides/tools-remote-mcp
- Claude Code MCP commands: https://docs.anthropic.com/en/docs/claude-code/mcp
- Cursor MCP configuration: https://docs.cursor.com/context/model-context-protocol
- Claude Desktop MCP setup: https://modelcontextprotocol.io/quickstart/user
- ChatGPT connector limitations for local servers: https://help.openai.com/en/articles/11487775-connectors-in-chatgpt/
