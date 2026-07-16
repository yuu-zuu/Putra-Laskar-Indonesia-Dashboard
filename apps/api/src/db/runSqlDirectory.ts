import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { pool } from "./client.js";

export async function runSqlDirectory(
  directory: URL,
  trackingTable: "schema_migration" | "schema_seed",
): Promise<void> {
  const client = await pool.connect();
  const lockId = trackingTable === "schema_migration" ? 704_320_001 : 704_320_002;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [lockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${trackingTable} (
        file_name text PRIMARY KEY,
        file_checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE ${trackingTable} ADD COLUMN IF NOT EXISTS file_checksum text`);

    const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
    for (const fileName of files) {
      if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(fileName)) {
        throw new Error(`SQL file ${fileName} does not follow NNN_snake_case.sql naming.`);
      }
      const sql = await readFile(new URL(fileName, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ file_checksum: string | null }>(
        `SELECT file_checksum FROM ${trackingTable} WHERE file_name = $1`,
        [fileName],
      );
      const recorded = applied.rows[0];
      if (recorded !== undefined) {
        if (recorded.file_checksum === null) {
          await client.query(
            `UPDATE ${trackingTable} SET file_checksum=$2 WHERE file_name=$1 AND file_checksum IS NULL`,
            [fileName, checksum],
          );
          continue;
        }
        if (recorded.file_checksum !== checksum) {
          throw new Error(`Previously applied SQL file ${fileName} has been modified.`);
        }
        continue;
      }
      await applyFile(client, trackingTable, fileName, checksum, sql);
      console.info(JSON.stringify({ level: "info", event: "sql_applied", fileName }));
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
    client.release();
  }
}

async function applyFile(
  client: PoolClient,
  trackingTable: string,
  fileName: string,
  checksum: string,
  sql: string,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(`INSERT INTO ${trackingTable} (file_name,file_checksum) VALUES ($1,$2)`, [
      fileName,
      checksum,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
