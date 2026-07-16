import { closePool } from "./client.js";
import { runSqlDirectory } from "./runSqlDirectory.js";
import { env } from "../config/env.js";

const seeds = new URL("../../../../database/seeds/", import.meta.url);

if (env.nodeEnv === "production" || !env.allowLocalSeed) {
  throw new Error(
    "Local workbook seed is disabled. Use NODE_ENV=development and ALLOW_LOCAL_SEED=true.",
  );
}

try {
  await runSqlDirectory(seeds, "schema_seed");
} finally {
  await closePool();
}
