import type {
  CreateManagedAccountInput,
  ManagedAccount,
  ResetManagedAccountPasswordInput,
  UpdateManagedAccountInput,
  UserRole,
} from "@spbu/contracts";
import { emailField, employeeIdField, passwordField } from "../auth/accountValidation.js";
import { hashPassword } from "../auth/password.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { readJson } from "../http/request.js";
import { sendEmpty, sendJson } from "../http/response.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { deleteUserObjects } from "../services/userObjectCleanupService.js";
import { enumField, objectBody, stringField, uuidField } from "../lib/validation.js";
import { createUuid } from "../lib/uuid.js";
import { updateAccountAssignmentSql } from "../repositories/accountAssignment.js";

const roles = ["ADMIN", "MANAGER", "OPERATOR", "FINANCE", "AUDITOR"] as const;

export function registerAccountRoutes(router: Router): void {
  router.add("GET", "/api/v1/admin/accounts", async ({ request, response }) => {
    await requireUser(request, ["ADMIN"]);
    const result = await pool.query<AccountRow>(
      `SELECT account.id,account.employee_id,account.email::text,account.display_name,
        account.role,account.branch_id,branch.name AS branch_name,account.created_at::text
       FROM app_user account
       LEFT JOIN branch ON branch.id=account.branch_id
       WHERE account.active=true AND account.deleted_at IS NULL
       ORDER BY account.display_name,account.employee_id`,
    );
    sendJson(response, 200, { items: result.rows.map(mapAccount) });
  });

  router.add("POST", "/api/v1/admin/accounts", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const actor = await requireUser(request, ["ADMIN"]);
    const input = parseCreateAccount(await readJson(request));
    if (input.branchId !== null) await assertActiveBranch(input.branchId);
    const passwordHash = await hashPassword(input.password);
    try {
      const created = await inTransaction(async (client) => {
        const result = await client.query<AccountRow>(
          `WITH created AS (
             INSERT INTO app_user(employee_id,email,display_name,password_hash,role,branch_id)
             VALUES($1,$2,$3,$4,$5,$6)
             RETURNING id,employee_id,email,display_name,role,branch_id,created_at
           )
           SELECT created.id,created.employee_id,created.email::text,created.display_name,
             created.role,created.branch_id,branch.name AS branch_name,created.created_at::text
           FROM created LEFT JOIN branch ON branch.id=created.branch_id`,
          [
            input.employeeId,
            input.email,
            input.displayName,
            passwordHash,
            input.role,
            input.branchId,
          ],
        );
        const account = mapAccount(requiredRow(result.rows[0]));
        await writeAudit(
          {
            branchId: account.branchId,
            actorId: actor.id,
            action: "CREATE",
            objectType: "app_user",
            objectId: account.id,
            reason: "Account created by administrator",
            metadata: {
              employeeId: account.employeeId,
              email: account.email,
              role: account.role,
              branchId: account.branchId,
            },
          },
          client,
        );
        return account;
      });
      sendJson(response, 201, created);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new AppError(
          409,
          "ACCOUNT_IDENTIFIER_EXISTS",
          "Email atau ID karyawan sudah digunakan.",
        );
      }
      throw error;
    }
  });

  router.add("PATCH", "/api/v1/admin/accounts/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const actor = await requireUser(request, ["ADMIN"]);
    const input = parseUpdateAccount(await readJson(request));
    if (input.branchId !== null) await assertActiveBranch(input.branchId);
    const updated = await inTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(704_310_001)");
      const targetResult = await client.query<AccountRow>(
        `SELECT account.id,account.employee_id,account.email::text,account.display_name,
          account.role,account.branch_id,branch.name AS branch_name,account.created_at::text
         FROM app_user account LEFT JOIN branch ON branch.id=account.branch_id
         WHERE account.id=$1 AND account.active=true AND account.deleted_at IS NULL FOR UPDATE OF account`,
        [params.id],
      );
      const target = targetResult.rows[0];
      if (target === undefined) {
        throw new AppError(404, "ACCOUNT_NOT_FOUND", "Akun tidak ditemukan.");
      }
      if (target.id === actor.id && input.role !== target.role) {
        throw new AppError(
          409,
          "CANNOT_CHANGE_OWN_ROLE",
          "Role akun aktif harus diubah oleh administrator lain.",
        );
      }
      if (target.role === "ADMIN" && input.role !== "ADMIN") {
        const admins = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM app_user
           WHERE role='ADMIN' AND active=true AND deleted_at IS NULL`,
        );
        if ((admins.rows[0]?.count ?? 0) <= 1) {
          throw new AppError(409, "LAST_ADMIN_REQUIRED", "Admin terakhir tidak dapat diturunkan.");
        }
      }
      const updatedResult = await client.query<AccountRow>(updateAccountAssignmentSql, [
        target.id,
        input.role,
        input.branchId,
      ]);
      const updated = mapAccount(requiredRow(updatedResult.rows[0]));
      await writeAudit(
        {
          branchId: updated.branchId,
          actorId: actor.id,
          action: "UPDATE_ACCOUNT_ASSIGNMENT",
          objectType: "app_user",
          objectId: target.id,
          reason: input.reason,
          metadata: {
            before: { role: target.role, branchId: target.branch_id },
            after: { role: updated.role, branchId: updated.branchId },
          },
        },
        client,
      );
      return updated;
    });
    sendJson(response, 200, updated);
  });

  router.add(
    "PATCH",
    "/api/v1/admin/accounts/{id}/password",
    async ({ request, response, params }) => {
      assertTrustedOrigin(request);
      const actor = await requireUser(request, ["ADMIN"]);
      if (params.id === actor.id) {
        throw new AppError(
          409,
          "USE_SELF_PASSWORD_CHANGE",
          "Gunakan Pengaturan untuk mengganti password akun aktif.",
        );
      }
      const input = parseResetPassword(await readJson(request));
      const passwordHash = await hashPassword(input.password);
      await inTransaction(async (client) => {
        const targetResult = await client.query<{
          id: string;
          employee_id: string;
          branch_id: string | null;
        }>(
          `SELECT id,employee_id,branch_id FROM app_user
           WHERE id=$1 AND active=true AND deleted_at IS NULL FOR UPDATE`,
          [params.id],
        );
        const target = targetResult.rows[0];
        if (target === undefined) {
          throw new AppError(404, "ACCOUNT_NOT_FOUND", "Akun tidak ditemukan.");
        }
        await client.query("UPDATE app_user SET password_hash=$2,updated_at=now() WHERE id=$1", [
          target.id,
          passwordHash,
        ]);
        await client.query(
          "UPDATE user_session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [target.id],
        );
        await writeAudit(
          {
            branchId: target.branch_id,
            actorId: actor.id,
            action: "RESET_ACCOUNT_PASSWORD",
            objectType: "app_user",
            objectId: target.id,
            reason: input.reason,
            metadata: { employeeId: target.employee_id, sessionsRevoked: true },
          },
          client,
        );
      });
      sendEmpty(response);
    },
  );

  router.add("DELETE", "/api/v1/admin/accounts/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const actor = await requireUser(request, ["ADMIN"]);
    if (params.id === actor.id) {
      throw new AppError(
        409,
        "CANNOT_DELETE_CURRENT_ACCOUNT",
        "Akun aktif tidak dapat dihapus dari menu kelola akun.",
      );
    }
    const deletedPasswordHash = await hashPassword(createUuid());
    await inTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(704_310_001)");
      const targetResult = await client.query<{
        id: string;
        employee_id: string;
        email: string;
        display_name: string;
        role: UserRole;
        branch_id: string | null;
      }>(
        `SELECT id,employee_id,email::text,display_name,role,branch_id
         FROM app_user WHERE id=$1 AND active=true AND deleted_at IS NULL FOR UPDATE`,
        [params.id],
      );
      const target = targetResult.rows[0];
      if (target === undefined) {
        throw new AppError(404, "ACCOUNT_NOT_FOUND", "Akun tidak ditemukan.");
      }
      if (target.role === "ADMIN") {
        const admins = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM app_user
           WHERE role='ADMIN' AND active=true AND deleted_at IS NULL`,
        );
        if ((admins.rows[0]?.count ?? 0) <= 1) {
          throw new AppError(409, "LAST_ADMIN_REQUIRED", "Admin terakhir tidak dapat dihapus.");
        }
      }
      const deletedObjectCount = await deleteUserObjects(target.id);
      await client.query(
        `UPDATE app_user SET
           employee_id='DELETED-' || upper(substr(replace(id::text,'-',''),1,24)),
           email=$2,display_name='Deleted account',password_hash=$3,
           avatar_object_key=NULL,avatar_content_type=NULL,avatar_size_bytes=NULL,
           active=false,deleted_at=now(),updated_at=now()
         WHERE id=$1`,
        [params.id, `deleted+${createUuid()}@invalid.local`, deletedPasswordHash],
      );
      await client.query("UPDATE user_session SET revoked_at=now() WHERE user_id=$1", [params.id]);
      await writeAudit(
        {
          branchId: target.branch_id,
          actorId: actor.id,
          action: "DELETE_ACCOUNT",
          objectType: "app_user",
          objectId: target.id,
          reason: "Account deleted by administrator",
          metadata: {
            employeeId: target.employee_id,
            displayName: target.display_name,
            role: target.role,
            deletedObjectCount,
          },
        },
        client,
      );
    });
    sendEmpty(response);
  });
}

interface AccountRow {
  id: string;
  employee_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  branch_id: string | null;
  branch_name: string | null;
  created_at: string;
}

function parseCreateAccount(value: unknown): CreateManagedAccountInput {
  const body = objectBody(value);
  const branchId = uuidField(body, "branchId", { nullable: true });
  return {
    employeeId: employeeIdField(body),
    email: emailField(body),
    displayName: stringField(body, "displayName", { min: 2, max: 120 }) as string,
    password: passwordField(body),
    role: enumField<UserRole>(body, "role", roles),
    branchId,
  };
}

function parseUpdateAccount(value: unknown): UpdateManagedAccountInput {
  const body = objectBody(value);
  const branchId = uuidField(body, "branchId", { nullable: true });
  return {
    role: enumField<UserRole>(body, "role", roles),
    branchId,
    reason: stringField(body, "reason", { min: 5, max: 500 }) as string,
  };
}

function parseResetPassword(value: unknown): ResetManagedAccountPasswordInput {
  const body = objectBody(value);
  return {
    password: passwordField(body),
    reason: stringField(body, "reason", { min: 5, max: 500 }) as string,
  };
}

async function assertActiveBranch(branchId: string): Promise<void> {
  const result = await pool.query("SELECT id FROM branch WHERE id=$1 AND active=true", [branchId]);
  if (result.rows[0] === undefined) {
    throw new AppError(422, "BRANCH_NOT_FOUND", "Cabang tidak ditemukan atau tidak aktif.");
  }
}

function mapAccount(row: AccountRow): ManagedAccount {
  return {
    id: row.id,
    employeeId: row.employee_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    branchId: row.branch_id,
    branchName: row.branch_name,
    createdAt: row.created_at,
  };
}

function requiredRow(row: AccountRow | undefined): AccountRow {
  if (row === undefined) throw new Error("Account insert did not return a row.");
  return row;
}

function databaseCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}
