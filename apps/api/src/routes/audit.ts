import type { AuditLogItem, AuditLogPage, UserRole } from "@spbu/contracts";
import { requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import type { Router } from "../http/router.js";
import { queryParam } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { AppError } from "../lib/errors.js";

export function registerAuditRoutes(router: Router): void {
  router.add("GET", "/api/v1/audit-logs", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const requestedBranch = queryParam(url, "branchId", false);
    const actorId = queryParam(url, "actorId", false);
    const branchId =
      actorId !== null ? null : user.role === "ADMIN" ? requestedBranch : user.branchId;
    if (
      actorId === null &&
      user.role !== "ADMIN" &&
      requestedBranch !== null &&
      requestedBranch !== user.branchId
    ) {
      throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
    }
    const objectType = queryParam(url, "objectType", false);
    const action = queryParam(url, "action", false);
    const outcome = queryParam(url, "outcome", false);
    const search = queryParam(url, "search", false);
    const cursor = decodeCursor(queryParam(url, "cursor", false));
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(rawLimit) ? Math.min(100, Math.max(10, rawLimit)) : 50;
    const result = await pool.query<AuditRow>(
      `SELECT log.id::text, log.branch_id, log.action, log.object_type, log.object_id,
         log.reason, log.metadata, log.occurred_at::text, log.actor_id,
         log.outcome,log.request_id,
         account.employee_id AS actor_employee_id,
         COALESCE(account.display_name, log.metadata->>'actor_name', 'System') AS actor_name,
         account.role AS actor_role
       FROM audit_log log
       LEFT JOIN app_user account ON account.id=log.actor_id
       WHERE ($1::uuid IS NULL OR log.branch_id=$1)
         AND ($2::uuid IS NULL OR log.actor_id=$2)
         AND ($3::text IS NULL OR log.object_type=$3)
         AND ($4::text IS NULL OR log.action=$4)
         AND ($5::text IS NULL OR log.outcome=$5)
         AND ($6::text IS NULL OR
           (log.object_id || ' ' || COALESCE(log.reason,'') || ' ' || log.metadata::text)
             ILIKE '%'||$6||'%')
         AND ($7::timestamptz IS NULL OR (log.occurred_at,log.id) < ($7::timestamptz,$8::bigint))
       ORDER BY log.occurred_at DESC, log.id DESC LIMIT $9`,
      [
        branchId,
        actorId,
        objectType,
        action,
        outcome,
        search,
        cursor?.occurredAt ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    const page: AuditLogPage = {
      items: rows.map(mapAudit),
      nextCursor:
        hasMore && last !== undefined
          ? Buffer.from(JSON.stringify({ occurredAt: last.occurred_at, id: last.id })).toString(
              "base64url",
            )
          : null,
    };
    sendJson(response, 200, page);
  });
}

interface AuditRow {
  id: string;
  branch_id: string | null;
  action: string;
  object_type: string;
  object_id: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  actor_id: string | null;
  actor_employee_id: string | null;
  actor_name: string;
  actor_role: UserRole | null;
  outcome: "SUCCEEDED" | "FAILED" | "DENIED";
  request_id: string | null;
}
function mapAudit(row: AuditRow): AuditLogItem {
  return {
    id: row.id,
    branchId: row.branch_id,
    action: row.action,
    objectType: row.object_type,
    objectId: row.object_id,
    reason: row.reason,
    metadata: row.metadata,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorEmployeeId: row.actor_employee_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    outcome: row.outcome,
    requestId: row.request_id,
  };
}
function decodeCursor(value: string | null): { occurredAt: string; id: string } | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("occurredAt" in parsed) ||
      !("id" in parsed) ||
      typeof parsed.occurredAt !== "string" ||
      typeof parsed.id !== "string"
    )
      throw new Error();
    return parsed as { occurredAt: string; id: string };
  } catch {
    throw new AppError(422, "INVALID_CURSOR", "Cursor audit tidak valid.");
  }
}
