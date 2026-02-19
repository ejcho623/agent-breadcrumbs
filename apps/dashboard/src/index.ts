#!/usr/bin/env node

import { createServer } from "node:http";

import { parseDashboardCliArgs, resolveDashboardConfig } from "./config.js";
import { createLogStore } from "./logstore/index.js";
import { createDashboardRequestHandler } from "./request-handler.js";

const config = resolveConfigOrExit();
const logStore = createLogStore(config.logStore);
const requestHandler = createDashboardRequestHandler(logStore);

const server = createServer((req, res) => {
  void requestHandler(req, res);
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
