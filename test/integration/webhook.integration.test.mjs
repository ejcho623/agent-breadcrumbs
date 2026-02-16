import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist', 'index.js');

async function withClient({ cwd, configPath }, run) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--config', configPath],
    cwd,
  });

  const client = new Client({ name: 'webhook-integration-client', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

async function withScriptedWebhookServer(script, run) {
  const requests = [];
  const server = createServer((req, res) => {
    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      requests.push({
        headers: req.headers,
        body: rawBody.length > 0 ? JSON.parse(rawBody) : null,
      });

      const responsePlan = script[Math.min(requests.length - 1, script.length - 1)];
      res.statusCode = responsePlan.statusCode;
      res.end(responsePlan.body ?? '');
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

    await run({
      url: `http://127.0.0.1:${address.port}/ingest`,
      requests,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('webhook integration retries scripted 5xx responses and then succeeds', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-webhook-int-success-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await withScriptedWebhookServer(
      [
        { statusCode: 500, body: 'first failure' },
        { statusCode: 503, body: 'second failure' },
        { statusCode: 204, body: '' },
      ],
      async ({ url, requests }) => {
        await writeFile(
          configPath,
          JSON.stringify({
            sink: {
              name: 'webhook',
              config: {
                url,
                retry: {
                  max_attempts: 2,
                  backoff_ms: 1,
                },
              },
            },
          }),
          'utf8',
        );

        let returnedLogId;
        await withClient({ cwd, configPath }, async (client) => {
          const result = await client.callTool({
            name: 'log_work',
            arguments: {
              log_record: {
                work_summary: 'scripted retry success',
              },
            },
          });

          assert.equal(result.isError, undefined);
          assert.equal(result.structuredContent.ok, true);
          returnedLogId = result.structuredContent.log_id;
        });

        assert.equal(requests.length, 3);
        assert.equal(requests[0].body.log_id, returnedLogId);
        assert.equal(requests[1].body.log_id, returnedLogId);
        assert.equal(requests[2].body.log_id, returnedLogId);
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('webhook integration returns deterministic error after retries are exhausted', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ab-webhook-int-fail-'));
  const configPath = path.join(cwd, 'server-config.json');
  try {
    await withScriptedWebhookServer(
      [
        { statusCode: 503, body: 'still failing' },
      ],
      async ({ url, requests }) => {
        await writeFile(
          configPath,
          JSON.stringify({
            sink: {
              name: 'webhook',
              config: {
                url,
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
                work_summary: 'scripted retry failure',
              },
            },
          });

          assert.equal(result.isError, true);
          assert.match(result.content?.[0]?.text ?? '', /webhook endpoint responded with status 503/i);
        });

        assert.equal(requests.length, 2);
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
