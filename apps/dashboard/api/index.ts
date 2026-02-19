import type { IncomingMessage, ServerResponse } from "node:http";

import { resolveDashboardConfig } from "../src/config.js";
import { createLogStore } from "../src/logstore/index.js";
import { createDashboardRequestHandler } from "../src/request-handler.js";

const config = resolveDashboardConfig({
  cli: {},
  env: process.env,
});
const logStore = createLogStore(config.logStore);
const requestHandler = createDashboardRequestHandler(logStore);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await requestHandler(req, res);
}
