import { emailField, passwordField } from "../auth/accountValidation.js";
import { hashPassword } from "../auth/password.js";
import { env } from "../config/env.js";
import { writeAudit } from "../lib/audit.js";
import { closePool } from "./client.js";
import { inTransaction } from "./transaction.js";

if (env.bootstrapAdminEmail === "" || env.bootstrapAdminPassword === "") {
  throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.");
}
const email = emailField({ email: env.bootstrapAdminEmail });
const password = passwordField({ password: env.bootstrapAdminPassword });
if (password.length < 12) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.");
}
if (env.bootstrapAdminName.length < 2 || env.bootstrapAdminName.length > 120) {
  throw new Error("BOOTSTRAP_ADMIN_NAME must contain 2-120 characters.");
}

try {
  const passwordHash = await hashPassword(password);
  const result = await inTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(704_310_001)");
    const existing = await client.query<{
      id: string;
      email: string;
      employee_id: string;
      role: string;
      active: boolean;
      deleted_at: string | null;
    }>(
      `SELECT id,email::text,employee_id,role::text,active,deleted_at::text
       FROM app_user WHERE email=$1 OR employee_id='ADMIN-001' FOR UPDATE`,
      [email],
    );
    const account = existing.rows[0];
    if (account !== undefined) {
      const isExpectedAdmin =
        existing.rowCount === 1 &&
        account.email.toLowerCase() === email &&
        account.employee_id === "ADMIN-001" &&
        account.role === "ADMIN" &&
        account.active &&
        account.deleted_at === null;
      if (!isExpectedAdmin) {
        throw new Error(
          "Bootstrap identity conflicts with an existing account; resolve it manually instead of elevating or overwriting data.",
        );
      }
      return { created: false, userId: account.id };
    }
    const inserted = await client.query<{ id: string; branch_id: string | null }>(
      `INSERT INTO app_user (employee_id,email,display_name,password_hash,role,branch_id)
       VALUES ('ADMIN-001',$1,$2,$3,'ADMIN',
         (SELECT id FROM branch WHERE active=true ORDER BY created_at LIMIT 1))
       RETURNING id,branch_id`,
      [email, env.bootstrapAdminName, passwordHash],
    );
    const created = inserted.rows[0];
    if (created === undefined) throw new Error("Admin bootstrap insert did not return a row.");
    await writeAudit(
      {
        branchId: created.branch_id,
        actorId: null,
        action: "BOOTSTRAP_ADMIN",
        objectType: "app_user",
        objectId: created.id,
        reason: "Initial administrator provisioned by trusted bootstrap command",
      },
      client,
    );
    return { created: true, userId: created.id };
  });
  console.info(
    JSON.stringify({
      level: "info",
      event: result.created ? "admin_bootstrapped" : "admin_bootstrap_skipped",
      userId: result.userId,
    }),
  );
} finally {
  await closePool();
}
