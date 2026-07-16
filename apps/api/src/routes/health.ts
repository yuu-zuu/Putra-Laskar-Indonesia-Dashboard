import type { Router } from "../http/router.js";
import { sendJson } from "../http/response.js";
import { pool } from "../db/client.js";
import { env } from "../config/env.js";

export function registerHealthRoutes(router: Router): void {
  const describe = ({ response }: { response: Parameters<typeof sendJson>[0] }) => {
    sendJson(response, 200, {
      service: "Putra Laskar Indonesia Dashboard API",
      version: "v1",
      release: env.release,
      status: "online",
      health: "/api/health",
      readiness: "/api/ready",
      apiBase: "/api/v1",
      message: "Buka aplikasi web pada port 5173; port 8787 menyediakan API JSON.",
    });
  };
  const liveness = ({ response }: { response: Parameters<typeof sendJson>[0] }) => {
    sendJson(response, 200, { status: "ok", service: "spbu-ops-api", release: env.release });
  };
  const readiness = async ({ response }: { response: Parameters<typeof sendJson>[0] }) => {
    const database = await pool.query<{ now: string }>("SELECT now()::text AS now");
    sendJson(response, 200, {
      status: "ready",
      service: "spbu-ops-api",
      release: env.release,
      databaseTime: database.rows[0]?.now,
    });
  };
  router.add("GET", "/", describe);
  router.add("GET", "/api/v1", describe);
  router.add("GET", "/health", liveness);
  router.add("GET", "/api/health", liveness);
  router.add("GET", "/ready", readiness);
  router.add("GET", "/api/ready", readiness);
}
