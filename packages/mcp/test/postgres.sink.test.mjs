import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresSink } from '../dist/sinks/postgres.js';

function buildConfig(overrides = {}) {
  return {
    connection_string: 'postgres://localhost:5432/agent_breadcrumbs',
    table: 'agent_logs',
    timeout_ms: 250,
    retry: {
      max_attempts: 0,
      backoff_ms: 0,
    },
    ...overrides,
  };
}

function buildRecord() {
  return {
    log_id: '00000000-0000-0000-0000-000000000001',
    server_timestamp: new Date().toISOString(),
    log_record: {
      work_summary: 'postgres sink unit test',
    },
  };
}

test('postgres sink maps auth failures to deterministic message', async () => {
  let attempts = 0;
  const sink = createPostgresSink(buildConfig(), {
    insertRecord: async () => {
      attempts += 1;
      const error = new Error('password authentication failed');
      error.code = '28P01';
      throw error;
    },
  });

  await assert.rejects(() => sink.write(buildRecord()), /Postgres authentication failed/i);
  assert.equal(attempts, 1);
});

test('postgres sink retries timeout errors and then succeeds', async () => {
  let attempts = 0;
  const sink = createPostgresSink(
    buildConfig({
      retry: {
        max_attempts: 1,
        backoff_ms: 0,
      },
    }),
    {
      insertRecord: async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('statement timeout');
          error.code = '57014';
          throw error;
        }
      },
    },
  );

  await sink.write(buildRecord());
  assert.equal(attempts, 2);
});

test('postgres sink does not retry non-retryable query errors', async () => {
  let attempts = 0;
  const sink = createPostgresSink(
    buildConfig({
      retry: {
        max_attempts: 3,
        backoff_ms: 0,
      },
    }),
    {
      insertRecord: async () => {
        attempts += 1;
        const error = new Error('relation "agent_logs" does not exist');
        error.code = '42P01';
        throw error;
      },
    },
  );

  await assert.rejects(
    () => sink.write(buildRecord()),
    /Postgres query error \(42P01\): relation "agent_logs" does not exist/i,
  );
  assert.equal(attempts, 1);
});

test('postgres sink maps network failures to transport errors', async () => {
  const sink = createPostgresSink(buildConfig(), {
    insertRecord: async () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  });

  await assert.rejects(() => sink.write(buildRecord()), /Postgres transport error: connect ECONNREFUSED/i);
});
