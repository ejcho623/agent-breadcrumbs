export type LogStoreKind = "postgres" | "jsonl";

export interface NormalizedEvent {
  id: string;
  serverTimestamp: string;
  eventTime: string;
  actor: string | null;
  summary: string | null;
  status: string | null;
  payload: Record<string, unknown>;
  source: LogStoreKind | "other";
}

export interface EventQuery {
  from?: Date;
  to?: Date;
  actor?: string;
  status?: string;
  search?: string;
  limit?: number;
}

export interface FacetQuery {
  from?: Date;
  to?: Date;
  search?: string;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface Facets {
  actors: FacetCount[];
  statuses: FacetCount[];
}

export interface TimeseriesQuery {
  from?: Date;
  to?: Date;
  actor?: string;
  status?: string;
  search?: string;
  bucket: "hour" | "day";
}

export interface TimeseriesPoint {
  bucketStart: string;
  count: number;
}

export interface LogStore {
  listEvents(query: EventQuery): Promise<NormalizedEvent[]>;
  listFacets(query: FacetQuery): Promise<Facets>;
  timeseries(query: TimeseriesQuery): Promise<TimeseriesPoint[]>;
  close(): Promise<void>;
}
