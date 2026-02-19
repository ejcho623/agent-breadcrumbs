import { readFile } from "node:fs/promises";

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

export interface JsonlLogStoreOptions {
  filePath: string;
}

export class JsonlLogStore implements LogStore {
  private readonly filePath: string;

  constructor(options: JsonlLogStoreOptions) {
    this.filePath = options.filePath;
  }

  async listEvents(query: EventQuery): Promise<NormalizedEvent[]> {
    const events = await this.loadEvents();
    return applyEventQuery(events, query);
  }

  async listFacets(query: FacetQuery): Promise<Facets> {
    const events = await this.loadEvents(query);
    return buildFacets(events);
  }

  async timeseries(query: TimeseriesQuery): Promise<TimeseriesPoint[]> {
    const events = await this.loadEvents(query);
    return buildTimeseries(events, query);
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }

  private async loadEvents(query?: { from?: Date; to?: Date; actor?: string; user?: string; search?: string }): Promise<NormalizedEvent[]> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    const events: NormalizedEvent[] = [];

    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const normalized = normalizeEnvelope(parsed as Record<string, unknown>, "jsonl");
      if (!normalized) {
        continue;
      }

      if (query?.from && Date.parse(normalized.eventTime) < query.from.getTime()) {
        continue;
      }

      if (query?.to && Date.parse(normalized.eventTime) > query.to.getTime()) {
        continue;
      }

      if (query?.actor && normalized.actor !== query.actor) {
        continue;
      }

      if (query?.user && normalized.userName !== query.user) {
        continue;
      }

      if (query?.search) {
        const haystack = `${normalized.summary ?? ""} ${JSON.stringify(normalized.payload)}`.toLowerCase();
        if (!haystack.includes(query.search.toLowerCase())) {
          continue;
        }
      }

      events.push(normalized);
    }

    events.sort((a, b) => Date.parse(b.eventTime) - Date.parse(a.eventTime));
    return events;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
