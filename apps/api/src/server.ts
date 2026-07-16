import { createServer } from "node:http";
import { env } from "./config/env.js";
import { closePool } from "./db/client.js";
import { handleRequest } from "./app.js";

const server = createServer(handleRequest);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;

server.listen(env.apiPort, env.apiHost, () => {
  console.info(
    JSON.stringify({
      level: "info",
      event: "server_started",
      address: `http://${env.apiHost}:${env.apiPort}`,
    }),
  );
});

async function shutdown(signal: string): Promise<void> {
  if (!server.listening) return;
  console.info(JSON.stringify({ level: "info", event: "shutdown", signal }));
  server.closeIdleConnections();
  await Promise.race([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        server.closeAllConnections();
        resolve();
      }, 10_000);
      timer.unref();
    }),
  ]);
  await closePool();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      event: "uncaught_exception",
      error: { name: error.name, message: error.message, stack: error.stack },
    }),
  );
  process.exitCode = 1;
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      event: "unhandled_rejection",
      error:
        reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason),
    }),
  );
  process.exitCode = 1;
  void shutdown("unhandledRejection");
});
