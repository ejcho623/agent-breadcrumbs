import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client as PgClient } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist', 'index.js');

const POSTGRES_TEST_URL = process.env.POSTGRES_TEST_URL ?? '';

async function withMcpClient({ cwd, configPath }, run) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--config', configPath],
    cwd,
  });

  const client = new Client({ name: 'postgres-integration-client', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildInvalidCredentialsUrl(connectionString) {
  const url = new URL(connectionString);
  url.username = `invalid_${url.username || 'user'}`;
  url.password = 'invalid_password';
  return url.toString();
}

test(
  'postgres integration inserts one row per successful log_work call',
  { skip: POSTGRES_TEST_URL.length === 0 },
  async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-pg-integration-'));
    const configPath = path.join(cwd, 'server-config.json');
    const tableName = `agent_logs_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const pg = new PgClient({ connectionString: POSTGRES_TEST_URL });
    let connected = false;

    try {
      await pg.connect();
      connected = true;
      await pg.query(
        `CREATE TABLE ${quoteIdent(tableName)} (
          log_id TEXT PRIMARY KEY,
          server_timestamp TIMESTAMPTZ NOT NULL,
          log_record JSONB NOT NULL
        )`,
      );

      await writeFile(
        configPath,
        JSON.stringify({
          sink: {
            name: 'postgres',
            config: {
              connection_string: POSTGRES_TEST_URL,
              table: tableName,
              timeout_ms: 2000,
              retry: {
                max_attempts: 1,
                backoff_ms: 5,
              },
            },
          },
        }),
        'utf8',
      );

      let returnedLogId;
      await withMcpClient({ cwd, configPath }, async (client) => {
        const result = await client.callTool({
          name: 'log_work',
          arguments: {
            log_record: {
              agent_id: 'integration-agent',
              work_summary: 'postgres integration success',
            },
          },
        });

        assert.equal(result.isError, undefined);
        assert.equal(result.structuredContent.ok, true);
        returnedLogId = result.structuredContent.log_id;
      });

      const rows = await pg.query(
        `SELECT log_id, server_timestamp, log_record FROM ${quoteIdent(tableName)} WHERE log_id = $1`,
        [returnedLogId],
      );
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].log_id, returnedLogId);
      assert.equal(typeof rows.rows[0].server_timestamp?.toISOString?.(), 'string');
      assert.equal(rows.rows[0].log_record.agent_id, 'integration-agent');
      assert.equal(rows.rows[0].log_record.work_summary, 'postgres integration success');
    } finally {
      if (connected) {
        await pg.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`).catch(() => {});
      }
      await pg.end().catch(() => {});
      await rm(cwd, { recursive: true, force: true });
    }
  },
);

test('postgres integration returns deterministic error for unreachable database', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-pg-unreachable-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        sink: {
          name: 'postgres',
          config: {
            connection_string: 'postgres://127.0.0.1:1/postgres',
            table: 'agent_logs',
            timeout_ms: 100,
            retry: {
              max_attempts: 1,
              backoff_ms: 1,
            },
          },
        },
      }),
      'utf8',
    );

    await withMcpClient({ cwd, configPath }, async (client) => {
      const result = await client.callTool({
        name: 'log_work',
        arguments: {
          log_record: {
            work_summary: 'postgres unreachable integration',
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

test(
  'postgres integration returns timeout error when insert exceeds configured timeout',
  { skip: POSTGRES_TEST_URL.length === 0 },
  async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-pg-timeout-'));
    const configPath = path.join(cwd, 'server-config.json');
    const tableName = `agent_logs_timeout_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const functionName = `agent_logs_sleep_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const triggerName = `agent_logs_trigger_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const pg = new PgClient({ connectionString: POSTGRES_TEST_URL });
    let connected = false;

    try {
      await pg.connect();
      connected = true;

      await pg.query(
        `CREATE TABLE ${quoteIdent(tableName)} (
          log_id TEXT PRIMARY KEY,
          server_timestamp TIMESTAMPTZ NOT NULL,
          log_record JSONB NOT NULL
        )`,
      );
      await pg.query(
        `CREATE FUNCTION ${quoteIdent(functionName)}() RETURNS trigger AS $$
         BEGIN
           PERFORM pg_sleep(0.05);
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
      );
      await pg.query(
        `CREATE TRIGGER ${quoteIdent(triggerName)}
         BEFORE INSERT ON ${quoteIdent(tableName)}
         FOR EACH ROW
         EXECUTE FUNCTION ${quoteIdent(functionName)}()`,
      );

      await writeFile(
        configPath,
        JSON.stringify({
          sink: {
            name: 'postgres',
            config: {
              connection_string: POSTGRES_TEST_URL,
              table: tableName,
              timeout_ms: 10,
              retry: {
                max_attempts: 0,
                backoff_ms: 1,
              },
            },
          },
        }),
        'utf8',
      );

      await withMcpClient({ cwd, configPath }, async (client) => {
        const result = await client.callTool({
          name: 'log_work',
          arguments: {
            log_record: {
              work_summary: 'postgres timeout integration',
            },
          },
        });

        assert.equal(result.isError, true);
        assert.match(result.content?.[0]?.text ?? '', /Postgres timeout after 10ms/i);
      });
    } finally {
      if (connected) {
        await pg.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`).catch(() => {});
        await pg.query(`DROP FUNCTION IF EXISTS ${quoteIdent(functionName)}()`).catch(() => {});
      }
      await pg.end().catch(() => {});
      await rm(cwd, { recursive: true, force: true });
    }
  },
);

test(
  'postgres integration returns deterministic authentication error for bad credentials',
  { skip: POSTGRES_TEST_URL.length === 0 },
  async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-pg-auth-fail-'));
    const configPath = path.join(cwd, 'server-config.json');
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          sink: {
            name: 'postgres',
            config: {
              connection_string: buildInvalidCredentialsUrl(POSTGRES_TEST_URL),
              table: 'agent_logs',
              timeout_ms: 1000,
              retry: {
                max_attempts: 0,
                backoff_ms: 1,
              },
            },
          },
        }),
        'utf8',
      );

      await withMcpClient({ cwd, configPath }, async (client) => {
        const result = await client.callTool({
          name: 'log_work',
          arguments: {
            log_record: {
              work_summary: 'postgres auth integration failure',
            },
          },
        });

        assert.equal(result.isError, true);
        assert.match(result.content?.[0]?.text ?? '', /Postgres authentication failed/i);
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
