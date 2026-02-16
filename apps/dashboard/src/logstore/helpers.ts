import { bucketStartIso, eventSearchText } from "./normalize.js";
import type { EventQuery, Facets, NormalizedEvent, TimeseriesPoint, TimeseriesQuery } from "./types.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function sanitizeLimit(rawLimit: number | undefined): number {
  if (!rawLimit || Number.isNaN(rawLimit)) {
    return DEFAULT_LIMIT;
  }

  const rounded = Math.floor(rawLimit);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > MAX_LIMIT) {
    return MAX_LIMIT;
  }
  return rounded;
}

export function applyEventQuery(events: NormalizedEvent[], query: EventQuery): NormalizedEvent[] {
  const limit = sanitizeLimit(query.limit);

  return events
    .filter((event) => matchesQuery(event, query))
    .sort((a, b) => Date.parse(b.eventTime) - Date.parse(a.eventTime))
    .slice(0, limit);
}

export function buildFacets(events: NormalizedEvent[]): Facets {
  const actorCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  for (const event of events) {
    if (event.actor) {
      actorCounts.set(event.actor, (actorCounts.get(event.actor) ?? 0) + 1);
    }
    if (event.status) {
      statusCounts.set(event.status, (statusCounts.get(event.status) ?? 0) + 1);
    }
  }

  return {
    actors: mapCounts(actorCounts),
    statuses: mapCounts(statusCounts),
  };
}

export function buildTimeseries(events: NormalizedEvent[], query: TimeseriesQuery): TimeseriesPoint[] {
  const filtered = events.filter((event) => matchesQuery(event, query));

  const buckets = new Map<string, number>();
  for (const event of filtered) {
    const bucketKey = bucketStartIso(event.eventTime, query.bucket);
    buckets.set(bucketKey, (buckets.get(bucketKey) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([bucketStart, count]) => ({ bucketStart, count }));
}

function mapCounts(input: Map<string, number>): Array<{ value: string; count: number }> {
  return Array.from(input.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function matchesQuery(
  event: NormalizedEvent,
  query: Pick<EventQuery, "from" | "to" | "actor" | "status" | "search">,
): boolean {
  const eventMillis = Date.parse(event.eventTime);

  if (query.from && eventMillis < query.from.getTime()) {
    return false;
  }

  if (query.to && eventMillis > query.to.getTime()) {
    return false;
  }

  if (query.actor && event.actor !== query.actor) {
    return false;
  }

  if (query.status && event.status !== query.status) {
    return false;
  }

  if (query.search) {
    const needle = query.search.toLowerCase();
    if (!eventSearchText(event).includes(needle)) {
      return false;
    }
  }

  return true;
}
