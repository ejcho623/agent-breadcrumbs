# Changelog

## 0.1.0 - 2026-02-14

Initial local-testable MVP.

### Added
- TypeScript MCP server over stdio with tool discovery/call handlers.
- Single `log_work` tool with dynamic description based on logging mode and schema source.
- Default `log_record` schema and custom schema loading via `--properties-file`.
- Input validation against active schema.
- Local JSONL persistence at `data/logs.jsonl`.
- Minimal ack response contract: `{ "ok": true, "log_id": "..." }`.
- Implementation guardrails for payload size, depth, and key count.
- Integration test suite.
- Client setup + validation matrix documentation.
