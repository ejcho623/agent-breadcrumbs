import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist', 'index.js');

async function withClient({ args = [], cwd }, run) {
  const effectiveArgs = [...args];
  if (cwd && !effectiveArgs.includes('--log-file')) {
    effectiveArgs.push('--log-file', path.join(cwd, 'data', 'logs.jsonl'));
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, ...effectiveArgs],
    cwd,
  });

  const client = new Client({ name: 'integration-test-client', version: '0.1.0' }, { capabilities: {} });

  await client.connect(transport);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

test('log_work success path persists only log_record + metadata', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-success-'));
  try {
    await withClient({ cwd }, async (client) => {
      const tools = await client.listTools();
      const logWork = tools.tools.find((tool) => tool.name === 'log_work');
      assert.ok(logWork);

      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            agent_id: 'agent-1',
            timestamp: new Date().toISOString(),
            work_summary: 'completed integration test',
            additional: { source: 'test' },
          },
          logging_mode: 'time',
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.ok, true);
      assert.equal(typeof result.structuredContent.log_id, 'string');
    });

    const logsPath = path.join(cwd, 'data', 'logs.jsonl');
    const data = await readFile(logsPath, 'utf8');
    const lines = data.trim().split('\n');
    assert.equal(lines.length, 1);

    const record = JSON.parse(lines[0]);
    assert.equal(typeof record.log_id, 'string');
    assert.equal(typeof record.server_timestamp, 'string');
    assert.equal(record.log_record.agent_id, 'agent-1');
    assert.equal(record.log_record.work_summary, 'completed integration test');
    assert.equal(Object.hasOwn(record, 'logging_mode'), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('schema validation rejects missing required log_record', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-validation-'));
  try {
    await withClient({ cwd }, async (client) => {
      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          logging_mode: 'completion',
        },
      });

      assert.equal(result.isError, true);
      assert.match(result.content?.[0]?.text ?? '', /required property 'log_record'/i);
    });

    const logsPath = path.join(cwd, 'data', 'logs.jsonl');
    await assert.rejects(() => stat(logsPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('custom schema overrides default log_record properties', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-custom-'));
  const schemaPath = path.join(cwd, 'custom-properties.json');

  await writeFile(
    schemaPath,
    JSON.stringify({
      task_id: { type: 'string' },
      hours_spent: { type: 'number' },
    }),
    'utf8',
  );

  try {
    await withClient({ cwd, args: ['--properties-file', schemaPath, '--logging-mode', 'time'] }, async (client) => {
      const tools = await client.listTools();
      const logWork = tools.tools.find((tool) => tool.name === 'log_work');
      assert.ok(logWork);
      assert.match(logWork.description ?? '', /Schema source=custom/i);
      assert.match(logWork.description ?? '', /Default mode=time/i);

      const invalid = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            task_id: 'task-1',
            hours_spent: '2',
          },
        },
      });

      assert.equal(invalid.isError, true);
      assert.match(invalid.content?.[0]?.text ?? '', /must be number/i);

      const valid = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            task_id: 'task-1',
            hours_spent: 2,
          },
        },
      });

      assert.equal(valid.isError, undefined);
      assert.equal(valid.structuredContent.ok, true);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('guardrails reject oversized log_record payloads', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-guardrails-'));
  try {
    await withClient({ cwd }, async (client) => {
      const huge = 'x'.repeat(17 * 1024);
      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            work_summary: huge,
          },
        },
      });

      assert.equal(result.isError, true);
      assert.match(result.content?.[0]?.text ?? '', /exceeds 16384 bytes limit/i);
    });

    const logsPath = path.join(cwd, 'data', 'logs.jsonl');
    await assert.rejects(() => stat(logsPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('guardrails reject excessive nesting depth', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-depth-'));
  try {
    await withClient({ cwd }, async (client) => {
      const deeplyNested = {
        a: { b: { c: { d: { e: { f: { g: { h: { i: 'too deep' } } } } } } } },
      };

      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: deeplyNested,
        },
      });

      assert.equal(result.isError, true);
      assert.match(result.content?.[0]?.text ?? '', /max depth of 8/i);
    });

    const logsPath = path.join(cwd, 'data', 'logs.jsonl');
    await assert.rejects(() => stat(logsPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server remains responsive after repeated rejected requests', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-resilience-'));
  try {
    await withClient({ cwd }, async (client) => {
      const huge = 'x'.repeat(17 * 1024);
      for (let i = 0; i < 20; i += 1) {
        const rejected = await client.callTool({
          name: 'log_work',
          arguments: {
            log_record: { work_summary: huge },
          },
        });
        assert.equal(rejected.isError, true);
      }

      const accepted = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: { work_summary: 'server still healthy' },
        },
      });
      assert.equal(accepted.isError, undefined);
      assert.equal(accepted.structuredContent.ok, true);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
