import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppLocale, AuthUser, UserRole } from "@spbu/contracts";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { pool } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { assertAllowedClient } from "./clientAccess.js";

export interface PendingSession {
  token: string;
  maxAgeSeconds: number;
}

export async function createSessionRecord(
  userId: string,
  request: IncomingMessage,
  executor: PoolClient | typeof pool = pool,
): Promise<PendingSession> {
  const token = randomBytes(32).toString("base64url");
  const maxAgeSeconds = env.sessionTtlHours * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1_000);
  await executor.query(
    `DELETE FROM user_session WHERE user_id=$1
     AND (expires_at<=now() OR revoked_at IS NOT NULL)`,
    [userId],
  );
  await executor.query(
    `INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash(token),
      expiresAt,
      request.headers["user-agent"]?.slice(0, 500) ?? null,
      clientIp(request),
    ],
  );
  await executor.query(
    `WITH ranked AS (
       SELECT id,row_number() OVER (ORDER BY created_at DESC) AS position
       FROM user_session WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()
     ) UPDATE user_session SET revoked_at=now()
       WHERE id IN (SELECT id FROM ranked WHERE position>10)`,
    [userId],
  );
  return { token, maxAgeSeconds };
}

export function setSessionCookie(response: ServerResponse, session: PendingSession): void {
  response.setHeader("set-cookie", serializeSessionCookie(session.token, session.maxAgeSeconds));
}

export async function currentUser(request: IncomingMessage): Promise<AuthUser | null> {
  const token = sessionToken(request);
  if (token === null) return null;
  const result = await pool.query<{
    id: string;
    employee_id: string;
    email: string;
    display_name: string;
    role: UserRole;
    branch_id: string | null;
    locale: AppLocale;
    avatar_object_key: string | null;
    onboarding_completed_at: string | null;
  }>(
    `WITH touched AS (
       UPDATE user_session SET last_seen_at=now()
       WHERE token_hash=$1
         AND revoked_at IS NULL
         AND expires_at > now()
         AND last_seen_at < now() - make_interval(mins => $2)
     )
     SELECT account.id,account.employee_id,account.email::text,account.display_name,
       account.role,account.branch_id,account.locale,account.avatar_object_key,
       account.onboarding_completed_at::text
     FROM user_session session
     JOIN app_user account ON account.id=session.user_id
     WHERE session.token_hash=$1
       AND session.revoked_at IS NULL
       AND session.expires_at > now()
       AND account.active = true
       AND account.deleted_at IS NULL`,
    [tokenHash(token), env.sessionTouchIntervalMinutes],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
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

export async function requireUser(
  request: IncomingMessage,
  allowedRoles?: readonly UserRole[],
): Promise<AuthUser> {
  const user = await currentUser(request);
  if (user === null) throw new AppError(401, "AUTH_REQUIRED", "Silakan masuk terlebih dahulu.");
  if (allowedRoles !== undefined && !allowedRoles.includes(user.role)) {
    throw new AppError(403, "ROLE_FORBIDDEN", "Role akun tidak diizinkan untuk tindakan ini.");
  }
  return user;
}

export async function revokeCurrentSession(
  request: IncomingMessage,
  executor: PoolClient | typeof pool = pool,
): Promise<void> {
  const token = sessionToken(request);
  if (token === null) return;
  await executor.query("UPDATE user_session SET revoked_at = now() WHERE token_hash = $1", [
    tokenHash(token),
  ]);
}

export function clearSession(response: ServerResponse): void {
  response.setHeader("set-cookie", serializeSessionCookie("", 0));
}

export function assertTrustedOrigin(request: IncomingMessage): void {
  assertAllowedClient(request);
}

export function clientIp(request: IncomingMessage): string | null {
  const forwarded = env.trustProxy
    ? request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    : undefined;
  const candidate = forwarded ?? request.socket.remoteAddress ?? null;
  return candidate !== null && /^[0-9a-fA-F:.]{3,45}$/.test(candidate) ? candidate : null;
}

function sessionToken(request: IncomingMessage): string | null {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === env.sessionCookieName) {
      try {
        const value = decodeURIComponent(rawValue.join("="));
        return /^[A-Za-z0-9_-]{40,128}$/.test(value) ? value : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${env.sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
    `Max-Age=${maxAgeSeconds}`,
    ...(env.sessionCookieSecure ? ["Secure"] : []),
  ].join("; ");
}
