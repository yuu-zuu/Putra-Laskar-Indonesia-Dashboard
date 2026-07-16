import type { PoolClient } from "pg";

/** Serialize only requests that share the same logical idempotency key. */
export async function lockIdempotencyKey(
  client: PoolClient,
  scope: string,
  idempotencyKey: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${scope}:${idempotencyKey}`,
  ]);
}
