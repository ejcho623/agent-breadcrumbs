import { Pool } from "pg";

import { applyEventQuery, buildFacets, buildTimeseries } from "./helpers.js";
import { normalizeEnvelope } from "./normalize.js";
import type {
  EventQuery,
  FacetQuery,
  Facets,
  LogStore,
  NormalizedEvent,
  TimeseriesPoint,
  TimeseriesQuery,
} from "./types.js";

const TABLE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

export interface PostgresLogStoreOptions {
  connectionString: string;
  table: string;
  scanLimit?: number;
}

export class PostgresLogStore implements LogStore {
  private readonly pool: Pool;
  private readonly table: string;
  private readonly scanLimit: number;

  constructor(options: PostgresLogStoreOptions) {
    this.table = validateTableIdentifier(options.table);
    this.scanLimit = options.scanLimit ?? 5000;
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  async listEvents(query: EventQuery): Promise<NormalizedEvent[]> {
    const events = await this.fetchEvents(query);
    return applyEventQuery(events, query);
  }

  async listFacets(query: FacetQuery): Promise<Facets> {
    const events = await this.fetchEvents(query);
    return buildFacets(events);
  }

  async timeseries(query: TimeseriesQuery): Promise<TimeseriesPoint[]> {
    const events = await this.fetchEvents(query);
    return buildTimeseries(events, query);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async fetchEvents(query: {
    from?: Date;
    to?: Date;
    actor?: string;
    tool?: string;
    user?: string;
    search?: string;
  }): Promise<NormalizedEvent[]> {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (query.from) {
      params.push(query.from.toISOString());
      whereClauses.push(`server_timestamp >= $${params.length}::timestamptz`);
    }

    if (query.to) {
      params.push(query.to.toISOString());
      whereClauses.push(`server_timestamp <= $${params.length}::timestamptz`);
    }

    if (query.actor) {
      params.push(query.actor);
      whereClauses.push(`COALESCE(log_record->>'model', log_record->>'agent_id', log_record->>'actor_id') = $${params.length}`);
    }

    if (query.tool) {
      params.push(query.tool);
      whereClauses.push(`log_record->>'tool' = $${params.length}`);
    }

    if (query.user) {
      params.push(query.user);
      whereClauses.push(`log_record->>'user_name' = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      whereClauses.push(`log_record::text ILIKE $${params.length}`);
    }

    params.push(this.scanLimit);
    const sql = [
      `SELECT log_id, server_timestamp, log_record FROM ${this.table}`,
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "",
      "ORDER BY server_timestamp DESC",
      `LIMIT $${params.length}::int`,
    ]
      .filter((part) => part !== "")
      .join(" ");

    const result = await this.pool.query(sql, params);

    const events: NormalizedEvent[] = [];
    for (const row of result.rows) {
      const normalized = normalizeEnvelope(row, "postgres");
      if (normalized) {
        events.push(normalized);
      }
    }

    return events;
  }
}

function validateTableIdentifier(rawTable: string): string {
  if (typeof rawTable !== "string" || rawTable.trim() === "") {
    throw new Error("Dashboard Postgres table must be a non-empty string");
  }

  if (!TABLE_IDENTIFIER_PATTERN.test(rawTable)) {
    throw new Error(
      `Dashboard Postgres table must match schema.table or table format using letters, numbers, and underscores. Received: ${rawTable}`,
    );
  }

  return rawTable;
}
