import { createHash } from "node:crypto";
import { pool } from "../db/client.js";
import { AppError } from "../lib/errors.js";

export async function consumeAuthRateLimit(
  scope: "login" | "register" | "change-password",
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const bucket = createHash("sha256").update(`${scope}:${identity.toLowerCase()}`).digest("hex");
  const result = await pool.query<{ attempt_count: number }>(
    `WITH expired AS (
       DELETE FROM auth_rate_limit WHERE window_started_at < now() - interval '24 hours'
     ) INSERT INTO auth_rate_limit (bucket_key, window_started_at, attempt_count)
     VALUES ($1, now(), 1)
     ON CONFLICT (bucket_key) DO UPDATE SET
       attempt_count = CASE
         WHEN auth_rate_limit.window_started_at < now() - make_interval(secs => $2)
           THEN 1 ELSE auth_rate_limit.attempt_count + 1 END,
       window_started_at = CASE
         WHEN auth_rate_limit.window_started_at < now() - make_interval(secs => $2)
           THEN now() ELSE auth_rate_limit.window_started_at END
     RETURNING attempt_count`,
    [bucket, windowSeconds],
  );
  if ((result.rows[0]?.attempt_count ?? 1) > limit) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Terlalu banyak percobaan. Coba kembali beberapa saat lagi.",
    );
  }
}
