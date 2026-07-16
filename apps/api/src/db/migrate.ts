import { closePool } from "./client.js";
import { runSqlDirectory } from "./runSqlDirectory.js";

const migrations = new URL("../../../../database/migrations/", import.meta.url);

try {
  await runSqlDirectory(migrations, "schema_migration");
} finally {
  await closePool();
}
