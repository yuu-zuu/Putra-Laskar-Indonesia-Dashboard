import { hashPassword, verifyPassword } from "../auth/password.js";
import { createUuid } from "../lib/uuid.js";
import { updateAccountAssignmentSql } from "../repositories/accountAssignment.js";
import { closePool, pool } from "./client.js";

const password = "AssignmentInvariant2026";
const branchId = createUuid();
const accountId = createUuid();
const suffix = accountId.replaceAll("-", "").slice(0, 16).toUpperCase();
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const passwordHash = await hashPassword(password);
  await client.query("INSERT INTO branch(id,code,name) VALUES($1,$2,$3)", [
    branchId,
    `CI-${suffix}`,
    "Assignment regression branch",
  ]);
  await client.query(
    `INSERT INTO app_user(id,employee_id,email,display_name,password_hash,role,branch_id)
     VALUES($1,$2,$3,$4,$5,'OPERATOR',NULL)`,
    [
      accountId,
      `CI-${suffix}`,
      `${accountId}@example.invalid`,
      "Assignment regression",
      passwordHash,
    ],
  );

  const assignment = await client.query<{ role: string; branch_id: string | null }>(
    updateAccountAssignmentSql,
    [accountId, "MANAGER", branchId],
  );
  const credentials = await client.query<{ password_hash: string }>(
    "SELECT password_hash FROM app_user WHERE id=$1",
    [accountId],
  );
  const updatedHash = credentials.rows[0]?.password_hash;
  if (
    assignment.rows[0]?.role !== "MANAGER" ||
    assignment.rows[0]?.branch_id !== branchId ||
    updatedHash !== passwordHash ||
    !(await verifyPassword(password, updatedHash ?? ""))
  ) {
    throw new Error("Account assignment changed credentials or failed to persist role/branch.");
  }
  console.info("Account assignment credential invariant passed.");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await closePool();
}
