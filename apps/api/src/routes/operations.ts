import type { BroadcastSeverity, ReconciliationStatus, SystemBroadcast } from "@spbu/contracts";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { queryParam, readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { enumField, objectBody, stringField } from "../lib/validation.js";

const statuses = ["PENDING", "MATCHED", "EXPLAINED", "ESCALATED", "CLOSED"] as const;
const severities = ["INFO", "WARNING", "CRITICAL"] as const;

export function registerOperationRoutes(router: Router): void {
  router.add("PATCH", "/api/v1/reconciliations/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER", "FINANCE", "AUDITOR"]);
    const body = objectBody(await readJson(request));
    const status = enumField<ReconciliationStatus>(body, "status", statuses);
    const note = stringField(body, "note", { nullable: true, max: 2_000 });
    if (
      (status === "EXPLAINED" || status === "ESCALATED" || status === "CLOSED") &&
      note === null
    ) {
      throw new AppError(
        422,
        "RECONCILIATION_NOTE_REQUIRED",
        "Catatan wajib untuk status yang dipilih.",
        { note: "Jelaskan keputusan rekonsiliasi." },
      );
    }
    const row = await inTransaction(async (client) => {
      const result = await client.query<ReconciliationMutationRow>(
        `WITH previous AS MATERIALIZED (
           SELECT id,branch_id,reconciliation_status,note FROM sales_meter_reading
           WHERE id=$1 AND ($4::boolean OR branch_id=$5)
         ), updated AS (
           UPDATE sales_meter_reading reading SET reconciliation_status=$2,note=$3
           FROM previous WHERE reading.id=previous.id
           RETURNING reading.id,reading.branch_id,
             previous.reconciliation_status AS previous_status,previous.note AS previous_note
         ) SELECT * FROM updated`,
        [params.id, status, note, user.role === "ADMIN", user.branchId],
      );
      const updated = result.rows[0];
      if (updated === undefined) {
        throw new AppError(404, "RECONCILIATION_NOT_FOUND", "Rekonsiliasi tidak ditemukan.");
      }
      await writeAudit(
        {
          branchId: updated.branch_id,
          actorId: user.id,
          action: "RECONCILE",
          objectType: "sales_meter_reading",
          objectId: updated.id,
          reason: note,
          metadata: {
            before: { status: updated.previous_status, note: updated.previous_note },
            after: { status, note },
          },
        },
        client,
      );
      return updated;
    });
    sendJson(response, 200, { id: row.id, status, note });
  });

  router.add("GET", "/api/v1/broadcasts", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId", false) ?? user.branchId;
    if (user.role !== "ADMIN" && branchId !== user.branchId) {
      throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
    }
    const result = await pool.query<BroadcastRow>(
      `SELECT broadcast.id,broadcast.branch_id,broadcast.title,broadcast.message,broadcast.severity,
        broadcast.active,broadcast.starts_at::text,broadcast.ends_at::text,broadcast.created_at::text,
        account.display_name AS created_by_name
       FROM system_broadcast broadcast JOIN app_user account ON account.id=broadcast.created_by
       WHERE broadcast.active=true AND broadcast.starts_at<=now()
         AND (broadcast.ends_at IS NULL OR broadcast.ends_at>now())
         AND (broadcast.branch_id IS NULL OR broadcast.branch_id=$1)
       ORDER BY broadcast.created_at DESC,broadcast.id DESC`,
      [branchId],
    );
    sendJson(response, 200, { items: result.rows.map(mapBroadcast) });
  });

  router.add("POST", "/api/v1/broadcasts", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const body = objectBody(await readJson(request));
    const branchId = body.branchId === null ? null : stringField(body, "branchId", { max: 80 });
    if (user.role !== "ADMIN" && branchId !== user.branchId) {
      throw new AppError(403, "BRANCH_FORBIDDEN", "Manager hanya dapat mengirim ke cabangnya.");
    }
    const severity = enumField<BroadcastSeverity>(body, "severity", severities);
    const endsAt = body.endsAt === null ? null : stringField(body, "endsAt", { max: 40 });
    if (endsAt !== null && Number.isNaN(Date.parse(endsAt))) {
      throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
        endsAt: "Gunakan tanggal ISO.",
      });
    }
    const title = stringField(body, "title", { min: 3, max: 120 });
    const message = stringField(body, "message", { min: 3, max: 1000 });
    const created = await inTransaction(async (client) => {
      const result = await client.query<BroadcastRow>(
        `WITH created AS (
           INSERT INTO system_broadcast(branch_id,title,message,severity,ends_at,created_by)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING *
         ) SELECT created.id,created.branch_id,created.title,created.message,created.severity,
           created.active,created.starts_at::text,created.ends_at::text,created.created_at::text,
           $7::text AS created_by_name FROM created`,
        [branchId, title, message, severity, endsAt, user.id, user.displayName],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("Broadcast insert did not return a row.");
      const broadcast = mapBroadcast(row);
      await writeAudit(
        {
          branchId,
          actorId: user.id,
          action: "CREATE",
          objectType: "system_broadcast",
          objectId: broadcast.id,
          metadata: { after: broadcast },
        },
        client,
      );
      return broadcast;
    });
    sendJson(response, 201, created);
  });

  router.add("PATCH", "/api/v1/broadcasts/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const deactivated = await inTransaction(async (client) => {
      const result = await client.query<{ id: string; branch_id: string | null }>(
        `UPDATE system_broadcast SET active=false
         WHERE id=$1 AND ($2::boolean OR branch_id=$3) RETURNING id,branch_id`,
        [params.id, user.role === "ADMIN", user.branchId],
      );
      const row = result.rows[0];
      if (row === undefined) {
        throw new AppError(404, "BROADCAST_NOT_FOUND", "Pengumuman tidak ditemukan.");
      }
      await writeAudit(
        {
          branchId: row.branch_id,
          actorId: user.id,
          action: "DEACTIVATE",
          objectType: "system_broadcast",
          objectId: row.id,
        },
        client,
      );
      return row;
    });
    sendJson(response, 200, { id: deactivated.id, active: false });
  });
}

interface ReconciliationMutationRow {
  id: string;
  branch_id: string;
  previous_status: ReconciliationStatus;
  previous_note: string | null;
}
interface BroadcastRow {
  id: string;
  branch_id: string | null;
  title: string;
  message: string;
  severity: BroadcastSeverity;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  created_by_name: string;
}
function mapBroadcast(row: BroadcastRow): SystemBroadcast {
  return {
    id: row.id,
    branchId: row.branch_id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    active: row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  };
}
