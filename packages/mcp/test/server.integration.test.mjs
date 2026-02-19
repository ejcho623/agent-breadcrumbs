import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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

async function withWebhookServer(handler, run) {
  const requests = [];
  const server = createServer((req, res) => {
    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', async () => {
      let body = null;
      if (rawBody.length > 0) {
        body = JSON.parse(rawBody);
      }

      requests.push({
        method: req.method,
        headers: req.headers,
        body,
      });

      try {
        await handler({
          req,
          res,
          attempt: requests.length,
          request: requests[requests.length - 1],
        });
      } catch {
        res.statusCode = 500;
        res.end('handler_error');
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    await run(
      {
        url: `http://127.0.0.1:${address.port}/ingest`,
        requests,
      },
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

test('server injects config.user_name into persisted log_record', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-user-name-'));
  const configPath = path.join(cwd, 'server-config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      user_name: 'ejcho623',
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
      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            work_summary: 'server metadata injection test',
          },
        },
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.ok, true);
    });

    const logsPath = path.join(cwd, 'data', 'logs.jsonl');
    const data = await readFile(logsPath, 'utf8');
    const lines = data.trim().split('\n');
    assert.equal(lines.length, 1);

    const record = JSON.parse(lines[0]);
    assert.equal(record.log_record._agent_breadcrumbs_server.user_name, 'ejcho623');
    assert.equal(record.log_record._agent_breadcrumbs_server.source, 'config.user_name');
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

test('schema_profile applies built-in profile schema validation', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-schema-profile-'));
  const configPath = path.join(cwd, 'server-config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      schema_profile: 'agent_insights_v1',
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
      assert.match(logWork.description ?? '', /Schema source=profile \(agent_insights_v1\)/i);

      const invalid = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            duration_ms: '42',
          },
        },
      });

      assert.equal(invalid.isError, true);
      assert.match(invalid.content?.[0]?.text ?? '', /must be number/i);

      const valid = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            duration_ms: 42,
            effort_hours: '2',
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

test('server startup fails when config.user_name is not a string', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-invalid-user-name-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        user_name: 123,
      }),
      'utf8',
    );

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /config\.user_name must be a non-empty string/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup fails when schema_profile is unknown', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-unknown-schema-profile-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        schema_profile: 'nonexistent_profile_v1',
      }),
      'utf8',
    );

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /unknown config\.schema_profile/i);
    assert.match(stderr, /supported profiles/i);
    assert.match(stderr, /use config\.schema for a custom schema/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup fails when both schema and schema_profile are set', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-schema-and-profile-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        schema_profile: 'agent_insights_v1',
        schema: {
          task_id: { type: 'string' },
        },
      }),
      'utf8',
    );

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /cannot set both config\.schema and config\.schema_profile/i);
    assert.match(stderr, /choose one schema source/i);
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

test('webhook sink sends envelope and forwards headers', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-webhook-success-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await withWebhookServer(
      async ({ res }) => {
        res.statusCode = 204;
        res.end();
      },
      async ({ url, requests }) => {
        await writeFile(
          configPath,
          JSON.stringify({
            sink: {
              name: 'webhook',
              config: {
                url,
                headers: {
                  authorization: 'Bearer secret-token',
                  'x-source': 'integration-test',
                },
              },
            },
          }),
          'utf8',
        );

        await withClient({ cwd, configPath }, async (client) => {
          const result = await client.callTool({
            name: 'log_work',
            arguments: {
              log_record: {
                work_summary: 'webhook delivery',
              },
            },
          });

          assert.equal(result.isError, undefined);
          assert.equal(result.structuredContent.ok, true);
          assert.equal(typeof result.structuredContent.log_id, 'string');
        });

        assert.equal(requests.length, 1);
        const request = requests[0];
        assert.equal(request.method, 'POST');
        assert.equal(request.headers.authorization, 'Bearer secret-token');
        assert.equal(request.headers['x-source'], 'integration-test');
        assert.match(request.headers['content-type'] ?? '', /application\/json/i);

        assert.equal(typeof request.body.log_id, 'string');
        assert.equal(typeof request.body.server_timestamp, 'string');
        assert.equal(request.body.log_record.work_summary, 'webhook delivery');
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('webhook sink retries after timeout and eventually succeeds', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-webhook-retry-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await withWebhookServer(
      async ({ res, attempt }) => {
        if (attempt === 1) {
          await sleep(120);
        }
        res.statusCode = 204;
        res.end();
      },
      async ({ url, requests }) => {
        await writeFile(
          configPath,
          JSON.stringify({
            sink: {
              name: 'webhook',
              config: {
                url,
                timeout_ms: 25,
                retry: {
                  max_attempts: 1,
                  backoff_ms: 1,
                },
              },
            },
          }),
          'utf8',
        );

        await withClient({ cwd, configPath }, async (client) => {
          const result = await client.callTool({
            name: 'log_work',
            arguments: {
              log_record: {
                work_summary: 'timeout retry scenario',
              },
            },
          });

          assert.equal(result.isError, undefined);
          assert.equal(result.structuredContent.ok, true);
        });

        assert.equal(requests.length, 2);
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('webhook sink returns deterministic non-2xx error and does not retry 4xx', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-webhook-4xx-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await withWebhookServer(
      async ({ res }) => {
        res.statusCode = 400;
        res.end('bad request');
      },
      async ({ url, requests }) => {
        await writeFile(
          configPath,
          JSON.stringify({
            sink: {
              name: 'webhook',
              config: {
                url,
                retry: {
                  max_attempts: 3,
                  backoff_ms: 1,
                },
              },
            },
          }),
          'utf8',
        );

        await withClient({ cwd, configPath }, async (client) => {
          const result = await client.callTool({
            name: 'log_work',
            arguments: {
              log_record: {
                work_summary: 'expect non-2xx',
              },
            },
          });

          assert.equal(result.isError, true);
          assert.match(result.content?.[0]?.text ?? '', /webhook endpoint responded with status 400/i);
        });

        assert.equal(requests.length, 1);
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('server startup rejects invalid postgres table identifier', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-postgres-invalid-table-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        sink: {
          name: 'postgres',
          config: {
            connection_string: 'postgres://localhost:5432/db',
            table: 'public.agent_logs;drop_table',
          },
        },
      }),
      'utf8',
    );

    const stderr = await runServerExpectStartupFailure({
      cwd,
      args: ['--config', configPath],
    });

    assert.match(stderr, /config\.sink\.config\.table/i);
    assert.match(stderr, /valid table identifier/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('postgres sink returns deterministic transport error when database is unreachable', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-postgres-unreachable-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        sink: {
          name: 'postgres',
          config: {
            connection_string: 'postgres://127.0.0.1:1/missing',
            table: 'agent_logs',
            timeout_ms: 100,
            retry: {
              max_attempts: 0,
              backoff_ms: 1,
            },
          },
        },
      }),
      'utf8',
    );

    await withClient({ cwd, configPath }, async (client) => {
      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            work_summary: 'expect transport failure',
          },
        },
      });

      assert.equal(result.isError, true);
      assert.match(result.content?.[0]?.text ?? '', /postgres transport error|postgres timeout/i);
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
