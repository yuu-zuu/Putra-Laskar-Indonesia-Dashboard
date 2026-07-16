import { closePool, pool } from "./client.js";

const requiredRelations = [
  "app_user",
  "audit_log",
  "inventory_movement",
  "meter_reconciliation_view",
  "meter_reading_revision",
  "schema_migration",
  "stock_layer",
  "system_broadcast",
  "user_session",
] as const;
const requiredConstraints = [
  "inventory_movement_stock_branch_fk",
  "meter_unit_id_branch_unique",
  "meter_stock_assignment_no_overlap",
  "price_rule_no_overlap",
  "reconciliation_comment_id_reading_unique",
  "reconciliation_comment_parent_same_reading_fk",
  "sales_meter_reading_meter_branch_fk",
  "stock_unit_id_branch_unique",
] as const;

try {
  const relations = await pool.query<{ name: string }>(
    `SELECT relname AS name FROM pg_class
     WHERE relname=ANY($1::text[]) AND relkind IN ('r','v')`,
    [requiredRelations],
  );
  const constraints = await pool.query<{ name: string }>(
    "SELECT conname AS name FROM pg_constraint WHERE conname=ANY($1::text[])",
    [requiredConstraints],
  );
  const actualRelations = new Set(relations.rows.map((row) => row.name));
  const actualConstraints = new Set(constraints.rows.map((row) => row.name));
  const missing = [
    ...requiredRelations.filter((name) => !actualRelations.has(name)),
    ...requiredConstraints.filter((name) => !actualConstraints.has(name)),
  ];
  if (missing.length > 0) throw new Error(`Schema verification failed: ${missing.join(", ")}`);
  console.info(
    JSON.stringify({
      level: "info",
      event: "schema_verified",
      relations: requiredRelations.length,
      constraints: requiredConstraints.length,
    }),
  );
} finally {
  await closePool();
}
