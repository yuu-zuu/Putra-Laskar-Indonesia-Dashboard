import {
  calculateMeterQuantity,
  type ReconciliationComment,
  type ReconciliationRevision,
  type UserRole,
} from "@spbu/contracts";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { numberField, objectBody, stringField } from "../lib/validation.js";
import {
  allocateMeterSale,
  assignedStockUnit,
  restoreAllocations,
} from "../services/inventoryPostingService.js";

export function registerReconciliationRoutes(router: Router): void {
  router.add(
    "GET",
    "/api/v1/reconciliations/{id}/history",
    async ({ request, response, params }) => {
      const id = requiredId(params.id);
      const user = await requireUser(request);
      await assertReadingScope(id, user.role, user.branchId);
      const result = await pool.query<RevisionRow>(
        `SELECT revision.id,revision.reading_id,revision.revision_no,
      revision.before_data,revision.after_data,revision.reason,revision.actor_id,account.display_name AS actor_name,
      revision.created_at::text FROM meter_reading_revision revision JOIN app_user account ON account.id=revision.actor_id
      WHERE revision.reading_id=$1 ORDER BY revision.revision_no DESC`,
        [id],
      );
      sendJson(response, 200, { items: result.rows.map(mapRevision) });
    },
  );

  router.add(
    "PATCH",
    "/api/v1/reconciliations/{id}/correction",
    async ({ request, response, params }) => {
      const id = requiredId(params.id);
      assertTrustedOrigin(request);
      const user = await requireUser(request, ["ADMIN", "MANAGER", "FINANCE"]);
      const body = objectBody(await readJson(request));
      const input = {
        meterStart: numberField(body, "meterStart", {
          min: 0,
          max: 1_000_000_000_000,
          scale: 3,
        }),
        meterEnd: numberField(body, "meterEnd", {
          min: 0,
          max: 1_000_000_000_000,
          scale: 3,
        }),
        meterResetOffset: numberField(body, "meterResetOffset", {
          min: 0,
          max: 1_000_000_000,
          scale: 3,
        }),
        cashDepositAmount: numberField(body, "cashDepositAmount", {
          min: 0,
          max: 10_000_000_000_000,
          scale: 2,
        }),
        note: stringField(body, "note", { nullable: true, max: 2000 }),
        reason: stringField(body, "reason", { min: 5, max: 1000 }) as string,
      };
      if (calculateMeterQuantity(input.meterStart, input.meterEnd, input.meterResetOffset) < 0)
        throw new AppError(
          422,
          "NEGATIVE_METER_QUANTITY",
          "Koreksi menghasilkan kuantitas meter negatif.",
        );
      const corrected = await inTransaction(async (client) => {
        const current = await client.query<ReadingRow>(
          `SELECT id,branch_id,meter_unit_id,business_date::text,meter_sales_qty,meter_start,meter_end,meter_reset_offset,
        cash_deposit_amount,note,reconciliation_status FROM sales_meter_reading WHERE id=$1
        AND ($2::boolean OR branch_id=$3) FOR UPDATE`,
          [id, user.role === "ADMIN", user.branchId],
        );
        const before = current.rows[0];
        if (before === undefined)
          throw new AppError(404, "RECONCILIATION_NOT_FOUND", "Rekonsiliasi tidak ditemukan.");
        const price = await client.query<{ unit_selling_price: number; posted_qty: number }>(
          `SELECT COALESCE(MAX(unit_selling_price),0) AS unit_selling_price,
           COALESCE(SUM(quantity),0) AS posted_qty FROM fifo_allocation WHERE sales_meter_reading_id=$1`,
          [before.id],
        );
        const unitSellingPrice = Number(price.rows[0]?.unit_selling_price ?? 0);
        const previousPostedQuantity = Number(price.rows[0]?.posted_qty ?? 0);
        const nextRevision = await client.query<{ revision_no: number }>(
          `SELECT COALESCE(MAX(revision_no),0)::int+1 AS revision_no
        FROM meter_reading_revision WHERE reading_id=$1`,
          [before.id],
        );
        const revisionNo = nextRevision.rows[0]?.revision_no;
        if (revisionNo === undefined) {
          throw new Error("Reconciliation revision query returned no number.");
        }
        const updated = await client.query<ReadingRow>(
          `UPDATE sales_meter_reading SET meter_start=$2,meter_end=$3,
        meter_reset_offset=$4,cash_deposit_amount=$5,note=$6,reconciliation_status='PENDING'
        WHERE id=$1 RETURNING id,branch_id,meter_start,meter_end,meter_reset_offset,cash_deposit_amount,note,reconciliation_status`,
          [
            before.id,
            input.meterStart,
            input.meterEnd,
            input.meterResetOffset,
            input.cashDepositAmount,
            input.note,
          ],
        );
        const after = updated.rows[0];
        if (after === undefined) {
          throw new Error("Reconciliation update did not return a row.");
        }
        const correctedQuantity = calculateMeterQuantity(
          input.meterStart,
          input.meterEnd,
          input.meterResetOffset,
        );
        const stockUnitId = await assignedStockUnit(
          client,
          before.branch_id,
          before.meter_unit_id,
          before.business_date,
        );
        await assertCorrectedBalance(
          client,
          stockUnitId,
          before.business_date,
          previousPostedQuantity - correctedQuantity,
        );
        await restoreAllocations(client, before.id);
        if (correctedQuantity > 0) {
          if (unitSellingPrice <= 0) {
            throw new AppError(
              422,
              "SELLING_PRICE_MISSING",
              "Harga jual transaksi lama tidak tersedia untuk alokasi ulang FIFO.",
            );
          }
          await allocateMeterSale(
            client,
            before.id,
            stockUnitId,
            correctedQuantity,
            unitSellingPrice,
            before.business_date,
          );
        }
        const movement = await client.query<{ id: string }>(
          `SELECT id FROM inventory_movement WHERE source_type='METER_READING' AND source_id=$1 FOR UPDATE`,
          [before.id],
        );
        let movementId = movement.rows[0]?.id;
        if (movementId === undefined) {
          const legacy = await client.query<{ id: string }>(
            `SELECT id FROM inventory_movement WHERE source_id IS NULL AND stock_unit_id=$1
             AND business_date=$2::date AND movement_type='SALE' AND ABS(quantity_delta)=$3
             ORDER BY created_at LIMIT 1 FOR UPDATE`,
            [stockUnitId, before.business_date, previousPostedQuantity],
          );
          movementId = legacy.rows[0]?.id;
          if (movementId !== undefined) {
            await client.query(
              "UPDATE inventory_movement SET source_type='METER_READING',source_id=$2 WHERE id=$1",
              [movementId, before.id],
            );
          }
        }
        if (movementId === undefined && correctedQuantity > 0) {
          const createdMovement = await client.query<{ id: string }>(
            `INSERT INTO inventory_movement
             (branch_id,stock_unit_id,business_date,movement_type,quantity_delta,source_type,source_id,posted_by,
              idempotency_key,reference,reason)
             VALUES($1,$2,$3,'SALE',$4,'METER_READING',$5,$6,$7,$8,$9) RETURNING id`,
            [
              before.branch_id,
              stockUnitId,
              before.business_date,
              -correctedQuantity,
              before.id,
              user.id,
              `correction:${before.id}`,
              `COR-${before.id}`,
              input.reason,
            ],
          );
          movementId = createdMovement.rows[0]?.id;
          if (movementId === undefined) {
            throw new Error("Corrected inventory movement insert returned no id.");
          }
        } else if (movementId !== undefined) {
          await client.query(
            `UPDATE inventory_movement SET quantity_delta=$2,
             posting_status=CASE WHEN $3::numeric=0 THEN 'REVERSED'::posting_status ELSE 'POSTED'::posting_status END,
             reason=$4,posted_at=now(),posted_by=$5 WHERE id=$1`,
            [
              movementId,
              correctedQuantity === 0 ? -Number(before.meter_sales_qty) : -correctedQuantity,
              correctedQuantity,
              input.reason,
              user.id,
            ],
          );
        }
        const beforeData = snapshot(before),
          afterData = snapshot(after);
        const revision = await client.query<RevisionRow>(
          `INSERT INTO meter_reading_revision(reading_id,revision_no,before_data,after_data,reason,actor_id)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6) RETURNING id,reading_id,revision_no,before_data,after_data,reason,actor_id,
        $7::text AS actor_name,created_at::text`,
          [
            before.id,
            revisionNo,
            JSON.stringify(beforeData),
            JSON.stringify(afterData),
            input.reason,
            user.id,
            user.displayName,
          ],
        );
        await writeAudit(
          {
            branchId: before.branch_id,
            actorId: user.id,
            action: "CORRECT",
            objectType: "sales_meter_reading",
            objectId: before.id,
            reason: input.reason,
            metadata: {
              revisionNo,
              before: beforeData,
              after: afterData,
            },
          },
          client,
        );
        const revisionRow = revision.rows[0];
        if (revisionRow === undefined) {
          throw new Error("Reconciliation revision insert returned no row.");
        }
        return mapRevision(revisionRow);
      });
      sendJson(response, 200, corrected);
    },
  );

  router.add(
    "GET",
    "/api/v1/reconciliations/{id}/comments",
    async ({ request, response, params }) => {
      const id = requiredId(params.id);
      const user = await requireUser(request);
      await assertReadingScope(id, user.role, user.branchId);
      const result = await pool.query<CommentRow>(
        `SELECT comment.id,comment.reading_id,comment.parent_id,comment.author_id,
      account.display_name AS author_name,account.role AS author_role,comment.message,comment.created_at::text
      FROM reconciliation_comment comment JOIN app_user account ON account.id=comment.author_id
      WHERE comment.reading_id=$1 ORDER BY comment.created_at,comment.id`,
        [id],
      );
      sendJson(response, 200, { items: result.rows.map(mapComment) });
    },
  );

  router.add(
    "POST",
    "/api/v1/reconciliations/{id}/comments",
    async ({ request, response, params }) => {
      const id = requiredId(params.id);
      assertTrustedOrigin(request);
      const user = await requireUser(request);
      await assertReadingScope(id, user.role, user.branchId);
      const body = objectBody(await readJson(request));
      const message = stringField(body, "message", {
        min: 2,
        max: 4000,
      }) as string;
      const parentId = stringField(body, "parentId", {
        nullable: true,
        max: 80,
      });
      const row = await inTransaction(async (client) => {
        const result = await client.query<CommentRow>(
          `WITH inserted AS (
             INSERT INTO reconciliation_comment(reading_id,parent_id,author_id,message)
             SELECT $1,$2,$3,$4 WHERE $2::uuid IS NULL OR EXISTS(
               SELECT 1 FROM reconciliation_comment WHERE id=$2 AND reading_id=$1
             ) RETURNING *
           ) SELECT inserted.id,inserted.reading_id,inserted.parent_id,inserted.author_id,
             $5::text AS author_name,$6::user_role AS author_role,
             inserted.message,inserted.created_at::text FROM inserted`,
          [id, parentId, user.id, message, user.displayName, user.role],
        );
        const comment = result.rows[0];
        if (comment === undefined) {
          throw new AppError(
            422,
            "INVALID_COMMENT_PARENT",
            "Balasan induk bukan bagian dari transaksi ini.",
          );
        }
        const branch = await readingBranch(id, client);
        await writeAudit(
          {
            branchId: branch,
            actorId: user.id,
            action: "COMMENT",
            objectType: "sales_meter_reading",
            objectId: id,
            metadata: { commentId: comment.id, parentId },
          },
          client,
        );
        return comment;
      });
      sendJson(response, 201, mapComment(row));
    },
  );
}

interface ReadingRow {
  id: string;
  branch_id: string;
  meter_unit_id: string;
  business_date: string;
  meter_sales_qty: number;
  meter_start: number;
  meter_end: number;
  meter_reset_offset: number;
  cash_deposit_amount: number;
  note: string | null;
  reconciliation_status: string;
}
interface RevisionRow {
  id: string;
  reading_id: string;
  revision_no: number;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  reason: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
}
interface CommentRow {
  id: string;
  reading_id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  author_role: UserRole;
  message: string;
  created_at: string;
}
function snapshot(row: ReadingRow) {
  return {
    meterStart: Number(row.meter_start),
    meterEnd: Number(row.meter_end),
    meterResetOffset: Number(row.meter_reset_offset),
    cashDepositAmount: Number(row.cash_deposit_amount),
    note: row.note,
    reconciliationStatus: row.reconciliation_status,
  };
}
function mapRevision(row: RevisionRow): ReconciliationRevision {
  return {
    id: row.id,
    readingId: row.reading_id,
    revisionNo: row.revision_no,
    before: row.before_data,
    after: row.after_data,
    reason: row.reason,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}
function mapComment(row: CommentRow): ReconciliationComment {
  return {
    id: row.id,
    readingId: row.reading_id,
    parentId: row.parent_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    message: row.message,
    createdAt: row.created_at,
  };
}
async function readingBranch(id: string, client: import("pg").PoolClient): Promise<string> {
  const result = await client.query<{ branch_id: string }>(
    "SELECT branch_id FROM sales_meter_reading WHERE id=$1",
    [id],
  );
  if (result.rows[0] === undefined)
    throw new AppError(404, "RECONCILIATION_NOT_FOUND", "Rekonsiliasi tidak ditemukan.");
  return result.rows[0].branch_id;
}
async function assertReadingScope(
  id: string,
  role: UserRole,
  branchId: string | null,
): Promise<void> {
  const result = await pool.query(
    "SELECT id FROM sales_meter_reading WHERE id=$1 AND ($2::boolean OR branch_id=$3)",
    [id, role === "ADMIN", branchId],
  );
  if (result.rows[0] === undefined)
    throw new AppError(404, "RECONCILIATION_NOT_FOUND", "Rekonsiliasi tidak ditemukan.");
}
function requiredId(id: string | undefined): string {
  if (id === undefined)
    throw new AppError(400, "RECONCILIATION_ID_REQUIRED", "ID rekonsiliasi wajib diisi.");
  return id;
}

async function assertCorrectedBalance(
  client: import("pg").PoolClient,
  stockUnitId: string,
  businessDate: string,
  delta: number,
): Promise<void> {
  const result = await client.query<{
    minimum_qty: number;
    maximum_qty: number;
    capacity_qty: number;
  }>(
    `WITH dates AS (
       SELECT DISTINCT business_date FROM inventory_movement
       WHERE stock_unit_id=$1 AND business_date >= $2::date AND posting_status='POSTED'
       UNION SELECT $2::date
     ), balances AS (
       SELECT COALESCE((SELECT SUM(quantity_delta) FROM inventory_movement movement
         WHERE movement.stock_unit_id=$1 AND movement.business_date<=dates.business_date
           AND movement.posting_status='POSTED'),0) AS quantity FROM dates
     ) SELECT MIN(quantity) AS minimum_qty,MAX(quantity) AS maximum_qty,
       (SELECT capacity_qty FROM stock_unit WHERE id=$1) AS capacity_qty FROM balances`,
    [stockUnitId, businessDate],
  );
  const row = result.rows[0];
  if (row === undefined) return;
  if (Number(row.minimum_qty) + delta < 0)
    throw new AppError(422, "NEGATIVE_STOCK", "Koreksi akan membuat histori saldo stock negatif.");
  if (Number(row.maximum_qty) + delta > Number(row.capacity_qty))
    throw new AppError(
      422,
      "STOCK_CAPACITY_EXCEEDED",
      "Koreksi akan membuat histori stock melebihi kapasitas.",
    );
}
