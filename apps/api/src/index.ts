import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { registerBuiltinNodes } from "./nodes/registry";
import { attachSockets } from "./sockets";

registerBuiltinNodes();

const app = createApp();
const server = http.createServer(app);
attachSockets(server);

server.listen(env.port, () => {
  logger.info(`FlowForge API listening on http://localhost:${env.port}`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
