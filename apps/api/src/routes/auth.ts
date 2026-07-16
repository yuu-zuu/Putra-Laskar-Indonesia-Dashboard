import type {
  AppLocale,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UserRole,
} from "@spbu/contracts";
import { env } from "../config/env.js";
import { pool } from "../db/client.js";
import type { Router } from "../http/router.js";
import { readJson } from "../http/request.js";
import { sendEmpty, sendJson } from "../http/response.js";
import { AppError } from "../lib/errors.js";
import { objectBody, stringField } from "../lib/validation.js";
import { createUuid } from "../lib/uuid.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { consumeAuthRateLimit } from "../auth/rateLimit.js";
import {
  registrationCode,
  registrationCodeExpiresAt,
  verifyRegistrationCode,
} from "../auth/registrationCode.js";
import {
  assertTrustedOrigin,
  clearSession,
  clientIp,
  createSessionRecord,
  currentUser,
  requireUser,
  revokeCurrentSession,
  setSessionCookie,
} from "../auth/session.js";
import { writeAudit } from "../lib/audit.js";
import { deleteUserObjects } from "../services/userObjectCleanupService.js";
import { emailField, employeeIdField, passwordField } from "../auth/accountValidation.js";
import { inTransaction } from "../db/transaction.js";

// A valid placeholder hash keeps unknown-account login timing close to a real password check.
const invalidLoginHash =
  "scrypt$16384$8$1$1kwbx0WHSlnHclT1ZqR4Cg$ofZb4wroZb9TNqwBwN8mR5g4W1ljZGu-PjWy_w27_x6w9KP4zMQBO5zqb2r4yurcTwEpRB3oO-jXisUEFYjBlw";

export function registerAuthRoutes(router: Router): void {
  router.add("POST", "/api/v1/auth/register", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const input = parseRegister(await readJson(request));
    await consumeAuthRateLimit(
      "register",
      `${clientIp(request) ?? "unknown"}:${input.email}`,
      8,
      60 * 60,
    );
    if (!verifyRegistrationCode(input.registrationCode, env.registrationCodeSecret)) {
      throw new AppError(
        422,
        "INVALID_REGISTRATION_CODE",
        "Kode registrasi tidak valid atau sudah berganti.",
        {
          registrationCode: "Minta kode enam digit aktif dari administrator.",
        },
      );
    }
    const passwordHash = await hashPassword(input.password);
    let created;
    try {
      created = await inTransaction(async (client) => {
        const result = await client.query<UserRow>(
          `INSERT INTO app_user (employee_id,email,display_name,password_hash,branch_id)
           VALUES ($1,$2,$3,$4,(SELECT id FROM branch WHERE active=true ORDER BY created_at LIMIT 1))
           RETURNING id,employee_id,email::text,display_name,role,branch_id,
             locale,avatar_object_key,onboarding_completed_at::text`,
          [input.employeeId, input.email, input.displayName, passwordHash],
        );
        const row = requiredRow(result.rows[0]);
        await writeAudit(
          {
            branchId: row.branch_id,
            actorId: row.id,
            action: "REGISTER",
            objectType: "app_user",
            objectId: row.id,
            metadata: { employeeId: row.employee_id, role: row.role },
          },
          client,
        );
        return { row, session: await createSessionRecord(row.id, request, client) };
      });
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new AppError(
          409,
          "EMAIL_ALREADY_REGISTERED",
          "Email atau ID karyawan sudah terdaftar.",
        );
      }
      throw error;
    }
    setSessionCookie(response, created.session);
    sendJson(response, 201, { user: mapUser(created.row) });
  });

  router.add("POST", "/api/v1/auth/login", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const input = parseLogin(await readJson(request));
    await consumeAuthRateLimit(
      "login",
      `${clientIp(request) ?? "unknown"}:${input.identifier.toLowerCase()}`,
      10,
      15 * 60,
    );
    const result = await pool.query<UserRow & { password_hash: string }>(
      `SELECT id, employee_id, email::text, display_name, role, branch_id, password_hash,
         locale, avatar_object_key, onboarding_completed_at::text
       FROM app_user
       WHERE (email = $1 OR employee_id = upper($1))
         AND active = true AND deleted_at IS NULL`,
      [input.identifier],
    );
    const row = result.rows[0];
    const passwordMatches = await verifyPassword(
      input.password,
      row?.password_hash ?? invalidLoginHash,
    );
    if (row === undefined || !passwordMatches) {
      if (row !== undefined) await recordDeniedLogin(row, request);
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Email/ID karyawan atau password tidak cocok.",
      );
    }
    const session = await inTransaction(async (client) => {
      await writeAudit(
        {
          branchId: row.branch_id,
          actorId: row.id,
          action: "LOGIN",
          objectType: "user_session",
          objectId: row.id,
          metadata: {
            ip: clientIp(request),
            userAgent: request.headers["user-agent"]?.slice(0, 200) ?? null,
          },
        },
        client,
      );
      return createSessionRecord(row.id, request, client);
    });
    setSessionCookie(response, session);
    sendJson(response, 200, { user: mapUser(row) });
  });

  router.add("POST", "/api/v1/auth/logout", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await currentUser(request);
    await inTransaction(async (client) => {
      if (user !== null) {
        await writeAudit(
          {
            branchId: user.branchId,
            actorId: user.id,
            action: "LOGOUT",
            objectType: "user_session",
            objectId: user.id,
          },
          client,
        );
      }
      await revokeCurrentSession(request, client);
    });
    clearSession(response);
    sendEmpty(response);
  });

  router.add("PATCH", "/api/v1/auth/password", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    await consumeAuthRateLimit("change-password", user.id, 5, 15 * 60);
    const input = parseChangePassword(await readJson(request));
    const current = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM app_user WHERE id=$1 AND active=true AND deleted_at IS NULL",
      [user.id],
    );
    const currentHash = current.rows[0]?.password_hash ?? "";
    if (!(await verifyPassword(input.currentPassword, currentHash))) {
      throw new AppError(401, "PASSWORD_CONFIRMATION_FAILED", "Password saat ini tidak cocok.", {
        currentPassword: "Password saat ini tidak cocok.",
      });
    }
    if (await verifyPassword(input.newPassword, currentHash)) {
      throw new AppError(
        422,
        "PASSWORD_UNCHANGED",
        "Password baru harus berbeda dari password saat ini.",
        { newPassword: "Gunakan password baru yang berbeda." },
      );
    }
    const passwordHash = await hashPassword(input.newPassword);
    const session = await inTransaction(async (client) => {
      const changed = await client.query(
        `UPDATE app_user SET password_hash=$2,updated_at=now()
         WHERE id=$1 AND password_hash=$3 RETURNING id`,
        [user.id, passwordHash, currentHash],
      );
      if (changed.rows[0] === undefined) {
        throw new AppError(
          409,
          "PASSWORD_CHANGED_RETRY",
          "Password berubah bersamaan. Masukkan kembali password saat ini.",
        );
      }
      await client.query(
        "UPDATE user_session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [user.id],
      );
      await writeAudit(
        {
          branchId: user.branchId,
          actorId: user.id,
          action: "CHANGE_PASSWORD",
          objectType: "app_user",
          objectId: user.id,
          reason: "Password changed by account owner",
        },
        client,
      );
      return createSessionRecord(user.id, request, client);
    });
    setSessionCookie(response, session);
    sendEmpty(response);
  });

  router.add("GET", "/api/v1/auth/me", async ({ request, response }) => {
    const user = await currentUser(request);
    if (user === null) throw new AppError(401, "AUTH_REQUIRED", "Belum ada sesi aktif.");
    sendJson(response, 200, { user });
  });

  router.add("GET", "/api/v1/auth/registration-code", async ({ request, response }) => {
    await requireUser(request, ["ADMIN"]);
    sendJson(response, 200, {
      code: registrationCode(env.registrationCodeSecret),
      expiresAt: registrationCodeExpiresAt(),
      digits: 6,
    });
  });

  router.add("DELETE", "/api/v1/auth/account", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const body = objectBody(await readJson(request));
    const password = passwordField(body);
    const passwordResult = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM app_user WHERE id = $1 AND active = true",
      [user.id],
    );
    if (!(await verifyPassword(password, passwordResult.rows[0]?.password_hash ?? ""))) {
      throw new AppError(401, "PASSWORD_CONFIRMATION_FAILED", "Password konfirmasi tidak cocok.");
    }
    const deletedPasswordHash = await hashPassword(createUuid());
    await inTransaction(async (client) => {
      if (user.role === "ADMIN") {
        await client.query("SELECT pg_advisory_xact_lock(704_310_001)");
        const admins = await client.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM app_user WHERE role = 'ADMIN' AND active = true AND deleted_at IS NULL",
        );
        if ((admins.rows[0]?.count ?? 0) <= 1) {
          throw new AppError(
            409,
            "LAST_ADMIN_REQUIRED",
            "Admin terakhir tidak dapat dihapus. Buat admin pengganti terlebih dahulu.",
          );
        }
      }
      const deletedObjectCount = await deleteUserObjects(user.id);
      await client.query(
        `UPDATE app_user SET
           employee_id = 'DELETED-' || upper(substr(replace(id::text, '-', ''), 1, 24)),
           email = $2, display_name = 'Deleted account', password_hash = $3,
           avatar_object_key = NULL, avatar_content_type = NULL, avatar_size_bytes = NULL,
           active = false, deleted_at = now(), updated_at = now()
         WHERE id = $1`,
        [user.id, `deleted+${createUuid()}@invalid.local`, deletedPasswordHash],
      );
      await client.query("UPDATE user_session SET revoked_at = now() WHERE user_id = $1", [
        user.id,
      ]);
      await writeAudit(
        {
          branchId: user.branchId,
          actorId: user.id,
          action: "DELETE_ACCOUNT",
          objectType: "app_user",
          objectId: user.id,
          reason: "User requested account deletion",
          metadata: { deletedObjectCount },
        },
        client,
      );
    });
    clearSession(response);
    sendEmpty(response);
  });
}

async function recordDeniedLogin(
  user: UserRow,
  request: Parameters<typeof clientIp>[0],
): Promise<void> {
  try {
    await writeAudit({
      branchId: user.branch_id,
      actorId: user.id,
      action: "LOGIN",
      objectType: "user_session",
      objectId: user.id,
      reason: "Credential verification failed",
      outcome: "DENIED",
      metadata: {
        ip: clientIp(request),
        userAgent: request.headers["user-agent"]?.slice(0, 200) ?? null,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "denied_login_audit_failed",
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

interface UserRow {
  id: string;
  employee_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  branch_id: string | null;
  locale: AppLocale;
  avatar_object_key: string | null;
  onboarding_completed_at: string | null;
}

function parseRegister(value: unknown): RegisterInput {
  const body = objectBody(value);
  return {
    employeeId: employeeIdField(body),
    email: emailField(body),
    displayName: stringField(body, "displayName", { min: 2, max: 120 }) as string,
    password: passwordField(body),
    registrationCode: stringField(body, "registrationCode", { min: 4, max: 8 }) as string,
  };
}

function parseLogin(value: unknown): LoginInput {
  const body = objectBody(value);
  const identifier = stringField(body, "identifier", { min: 3, max: 254 }) as string;
  if (identifier.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
        identifier: "Format email tidak valid.",
      });
    }
  } else if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(identifier)) {
    throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
      identifier: "Masukkan email atau ID karyawan yang valid.",
    });
  }
  return { identifier: identifier.trim(), password: passwordField(body) };
}

function parseChangePassword(value: unknown): ChangePasswordInput {
  const body = objectBody(value);
  return {
    currentPassword: passwordField(body, "currentPassword"),
    newPassword: passwordField(body, "newPassword"),
  };
}

function requiredRow(row: UserRow | undefined): UserRow {
  if (row === undefined) throw new Error("User insert did not return a row.");
  return row;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    employeeId: row.employee_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    branchId: row.branch_id,
    locale: row.locale,
    avatarObjectKey: row.avatar_object_key,
    onboardingCompletedAt: row.onboarding_completed_at,
  };
}

function databaseCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}
