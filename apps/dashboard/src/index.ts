import { createServer } from "node:http";
import type { ServerResponse } from "node:http";

import { parseDashboardCliArgs, resolveDashboardConfig } from "./config.js";
import { renderDashboardHtml } from "./html.js";
import { createLogStore } from "./logstore/index.js";

const config = resolveConfigOrExit();
const logStore = createLogStore(config.logStore);

const server = createServer(async (req, res) => {
  if (!req.url) {
    respondJson(res, 400, { error: "Missing URL" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderDashboardHtml());
      return;
    }

    if (url.pathname === "/api/events") {
      const baseQuery = parseCommonQuery(url.searchParams);
      const items = await logStore.listEvents({
        ...baseQuery,
        limit: parseLimit(url.searchParams.get("limit")),
      });
      respondJson(res, 200, { items });
      return;
    }

    if (url.pathname === "/api/facets") {
      const query = parseCommonQuery(url.searchParams);
      const facets = await logStore.listFacets(query);
      respondJson(res, 200, facets);
      return;
    }

    if (url.pathname === "/api/timeseries") {
      const query = parseCommonQuery(url.searchParams);
      const bucket = parseBucket(url.searchParams.get("bucket"));
      const items = await logStore.timeseries({ ...query, bucket });
      respondJson(res, 200, { items });
      return;
    }

    if (url.pathname === "/healthz") {
      respondJson(res, 200, { ok: true });
      return;
    }

    respondJson(res, 404, { error: "Not found" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.startsWith("Invalid query") ? 400 : 500;
    respondJson(res, statusCode, { error: message });
  }
});

server.listen(config.port, config.host, () => {
  // Intentional console logs for local run visibility.
  console.log(
    `[dashboard] listening on http://${config.host}:${config.port} using ${config.logStore.kind} log store`,
  );
});

const shutdown = async () => {
  await logStore.close();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

function parseCommonQuery(searchParams: URLSearchParams): {
  from?: Date;
  to?: Date;
  actor?: string;
  status?: string;
  search?: string;
} {
  return {
    from: parseOptionalDate(searchParams.get("from"), "from"),
    to: parseOptionalDate(searchParams.get("to"), "to"),
    actor: parseOptionalString(searchParams.get("actor")),
    status: parseOptionalString(searchParams.get("status")),
    search: parseOptionalString(searchParams.get("search")),
  };
}

function parseOptionalDate(rawValue: string | null, fieldName: string): Date | undefined {
  if (!rawValue || rawValue.trim() === "") {
    return undefined;
  }

  const millis = Date.parse(rawValue);
  if (Number.isNaN(millis)) {
    throw new Error(`Invalid query: ${fieldName} must be an ISO datetime.`);
  }

  return new Date(millis);
}

function parseOptionalString(rawValue: string | null): string | undefined {
  if (!rawValue || rawValue.trim() === "") {
    return undefined;
  }
  return rawValue.trim();
}

function parseLimit(rawValue: string | null): number | undefined {
  if (!rawValue || rawValue.trim() === "") {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    throw new Error("Invalid query: limit must be an integer.");
  }

  return parsed;
}

function parseBucket(rawValue: string | null): "hour" | "day" {
  if (!rawValue || rawValue.trim() === "") {
    return "day";
  }

  if (rawValue === "hour" || rawValue === "day") {
    return rawValue;
  }

  throw new Error("Invalid query: bucket must be hour or day.");
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function resolveConfigOrExit() {
  try {
    const cli = parseDashboardCliArgs(process.argv.slice(2));
    return resolveDashboardConfig({ cli, env: process.env });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`[dashboard] ${message}`);
    process.exit(1);
  }
}
