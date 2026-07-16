import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { env } from "../config/env.js";

const { Pool, types } = pg;

// Quantities and money use bounded NUMERIC columns and are returned as numbers to the UI.
// Keep INT8 on pg's safe string default: identifiers/counters can eventually exceed
// Number.MAX_SAFE_INTEGER and must never be rounded silently.
types.setTypeParser(1700, (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new RangeError("PostgreSQL returned a non-finite NUMERIC");
  return parsed;
});

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.databasePoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
  query_timeout: env.databaseQueryTimeoutMs,
  statement_timeout: env.databaseStatementTimeoutMs,
  idle_in_transaction_session_timeout: env.databaseStatementTimeoutMs,
  application_name: "spbu-ops-api",
  allowExitOnIdle: !env.isProduction,
});

// Vercel Fluid Compute suspends instances between invocations. Registering the pool lets
// the runtime release idle clients safely instead of leaking a connection per warm instance.
if (process.env.VERCEL === "1") attachDatabasePool(pool);

pool.on("error", (error) => {
  console.error(
    JSON.stringify({ level: "error", event: "postgres_pool_error", message: error.message }),
  );
});

export async function closePool(): Promise<void> {
  await pool.end();
}
