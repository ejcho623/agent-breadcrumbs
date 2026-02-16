import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

function buildDefaultConfig(cwd) {
  return {
    sink: {
      name: 'jsonl',
      config: {
        log_file: path.join(cwd, 'data', 'logs.jsonl'),
      },
    },
  };
}

async function withClient({ args = [], cwd, configPath }, run) {
  const effectiveArgs = [...args];
  if (cwd && !effectiveArgs.includes('--config')) {
    const resolvedConfigPath = configPath ?? path.join(cwd, 'server-config.json');
    if (!configPath) {
      await writeFile(resolvedConfigPath, JSON.stringify(buildDefaultConfig(cwd)), 'utf8');
    }
    effectiveArgs.push('--config', resolvedConfigPath);
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

async function runServerExpectStartupFailure({ args, cwd }) {
  const stderrChunks = [];
  const child = spawn(process.execPath, [SERVER_ENTRY, ...args], { cwd });
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString('utf8')));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Server did not exit while expecting startup failure.'));
    }, 3000);

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        reject(new Error('Expected non-zero exit code for startup failure.'));
        return;
      }
      resolve();
    });
  });

  return stderrChunks.join('');
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
        arguments: {},
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
  const configPath = path.join(cwd, 'server-config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      schema: {
        task_id: { type: 'string' },
        hours_spent: { type: 'number' },
      },
      sink: {
        name: 'jsonl',
        config: {
          log_file: path.join(cwd, 'data', 'logs.jsonl'),
        },
      },
    }),
    'utf8',
  );

  try {
    await withClient({ cwd, configPath }, async (client) => {
      const tools = await client.listTools();
      const logWork = tools.tools.find((tool) => tool.name === 'log_work');
      assert.ok(logWork);
      assert.match(logWork.description ?? '', /Schema source=custom/i);

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

test('server startup fails when --config points to a missing file', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-missing-config-'));
  try {
    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', path.join(cwd, 'does-not-exist.json')],
    });

    assert.match(stderr, /failed to read config file/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup fails when config file contains invalid JSON', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-invalid-config-'));
  const configPath = path.join(cwd, 'broken-config.json');
  try {
    await writeFile(configPath, '{ invalid json', 'utf8');

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /invalid json in config file/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup rejects legacy runtime flags with migration guidance', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-legacy-flags-'));
  try {
    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--log-file', path.join(cwd, 'logs.jsonl')],
    });

    assert.match(stderr, /no longer supported/i);
    assert.match(stderr, /use --config <path>/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup accepts webhook sink config but reports not implemented', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-webhook-not-impl-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        sink: {
          name: 'webhook',
          config: {
            url: 'https://example.com/ingest',
          },
        },
      }),
      'utf8',
    );

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /webhook/i);
    assert.match(stderr, /not implemented yet/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup accepts postgres sink config but reports not implemented', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-postgres-not-impl-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        sink: {
          name: 'postgres',
          config: {
            connection_string: 'postgres://localhost:5432/db',
            table: 'agent_logs',
          },
        },
      }),
      'utf8',
    );

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /postgres/i);
    assert.match(stderr, /not implemented yet/i);
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
