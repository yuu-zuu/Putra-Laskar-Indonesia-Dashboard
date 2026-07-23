import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { numberField, objectBody, stringField } from "../lib/validation.js";

interface PendingCostRow {
  stock_layer_id: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  stock_unit_id: string;
  stock_unit_code: string;
  stock_unit_name: string;
  product_code: string;
  product_name: string;
  received_at: string;
  initial_qty: number;
  remaining_qty: number;
  unit_cost: number;
  unit_selling_price: number;
  cost_status: "PENDING" | "FINAL";
  source_type: string;
  source_id: string | null;
  allocated_qty: number;
  affected_reading_count: number;
}

interface CostRevisionRow {
  id: string;
  stock_layer_id: string;
  revision_no: number;
  before_unit_cost: number;
  after_unit_cost: number;
  before_cost_status: "PENDING" | "FINAL";
  after_cost_status: "PENDING" | "FINAL";
  allocated_qty: number;
  cogs_delta: number;
  reason: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

export function registerCostReconciliationRoutes(router: Router): void {
  router.add(
    "GET",
    "/api/v1/cost-reconciliation/layers",
    async ({ request, response, url }) => {
      const user = await requireUser(request, ["ADMIN", "FINANCE", "AUDITOR"]);
      const requestedBranchId = url.searchParams.get("branchId");
      const requestedStatus = url.searchParams.get("status");
      const branchId = scopedBranchId(user.role, user.branchId, requestedBranchId);
      const result = await pool.query<PendingCostRow>(
        `SELECT stock_layer_id,branch_id,branch_code,branch_name,stock_unit_id,stock_unit_code,
                stock_unit_name,product_code,product_name,received_at::text,initial_qty,
                remaining_qty,unit_cost,unit_selling_price,cost_status,source_type,source_id,
                allocated_qty,affected_reading_count
         FROM pending_stock_layer_cost_view
         WHERE ($1::uuid IS NULL OR branch_id=$1)
           AND ($2::text IS NULL OR cost_status=$2)
         ORDER BY branch_code,stock_unit_code,received_at,stock_layer_id`,
        [branchId, requestedStatus],
      );
      sendJson(response, 200, { items: result.rows.map(mapPendingCost) });
    },
  );

  router.add(
    "GET",
    "/api/v1/cost-reconciliation/layers/{id}/history",
    async ({ request, response, params }) => {
      const user = await requireUser(request, ["ADMIN", "FINANCE", "AUDITOR"]);
      const id = requiredId(params.id);
      await assertLayerScope(id, user.role, user.branchId);
      const result = await pool.query<CostRevisionRow>(
        `SELECT revision.id,revision.stock_layer_id,revision.revision_no,
                revision.before_unit_cost,revision.after_unit_cost,
                revision.before_cost_status,revision.after_cost_status,
                revision.allocated_qty,revision.cogs_delta,revision.reason,
                revision.actor_id,account.display_name AS actor_name,revision.created_at::text
         FROM stock_layer_cost_revision revision
         JOIN app_user account ON account.id=revision.actor_id
         WHERE revision.stock_layer_id=$1
         ORDER BY revision.revision_no DESC`,
        [id],
      );
      sendJson(response, 200, { items: result.rows.map(mapCostRevision) });
    },
  );

  router.add(
    "PATCH",
    "/api/v1/cost-reconciliation/layers/{id}",
    async ({ request, response, params }) => {
      assertTrustedOrigin(request);
      const user = await requireUser(request, ["ADMIN", "FINANCE", "AUDITOR"]);
      const id = requiredId(params.id);
      const body = objectBody(await readJson(request));
      const unitCost = numberField(body, "unitCost", {
        min: 0,
        max: 10_000_000_000,
        scale: 2,
      });
      const reason = stringField(body, "reason", { min: 5, max: 1000 }) as string;

      const item = await inTransaction(async (client) => {
        const currentResult = await client.query<{
          id: string;
          branch_id: string;
          unit_cost: number;
          unit_selling_price: number;
          cost_status: "PENDING" | "FINAL";
        }>(
          `SELECT layer.id,stock.branch_id,layer.unit_cost,layer.unit_selling_price,layer.cost_status
           FROM stock_layer layer
           JOIN stock_unit stock ON stock.id=layer.stock_unit_id
           WHERE layer.id=$1
           FOR UPDATE`,
          [id],
        );
        const current = currentResult.rows[0];
        if (current === undefined || !isBranchAllowed(user.role, user.branchId, current.branch_id)) {
          throw new AppError(404, "STOCK_LAYER_NOT_FOUND", "Layer stock tidak ditemukan.");
        }
        if (unitCost > Number(current.unit_selling_price)) {
          throw new AppError(
            422,
            "COST_EXCEEDS_SELLING_PRICE",
            "Harga pokok melebihi harga jual layer. Koreksi harga jual terlebih dahulu atau verifikasi sumber HPP.",
          );
        }

        const allocationResult = await client.query<{ allocated_qty: number; affected_readings: number }>(
          `SELECT COALESCE(SUM(quantity),0)::numeric AS allocated_qty,
                  COUNT(DISTINCT sales_meter_reading_id)::int AS affected_readings
           FROM fifo_allocation
           WHERE stock_layer_id=$1`,
          [id],
        );
        const allocatedQty = Number(allocationResult.rows[0]?.allocated_qty ?? 0);
        const affectedReadings = Number(allocationResult.rows[0]?.affected_readings ?? 0);
        const beforeUnitCost = Number(current.unit_cost);
        const cogsDelta = roundMoney((unitCost - beforeUnitCost) * allocatedQty);

        const revisionResult = await client.query<{ revision_no: number }>(
          `SELECT COALESCE(MAX(revision_no),0)::int+1 AS revision_no
           FROM stock_layer_cost_revision
           WHERE stock_layer_id=$1`,
          [id],
        );
        const revisionNo = revisionResult.rows[0]?.revision_no;
        if (revisionNo === undefined) throw new Error("Cost revision number tidak tersedia.");

        await client.query(
          `UPDATE stock_layer
           SET unit_cost=$2,cost_status='FINAL',cost_completed_at=now(),cost_completed_by=$3
           WHERE id=$1`,
          [id, unitCost, user.id],
        );
        await client.query("UPDATE fifo_allocation SET unit_cost=$2 WHERE stock_layer_id=$1", [
          id,
          unitCost,
        ]);

        const revision = await client.query<CostRevisionRow>(
          `INSERT INTO stock_layer_cost_revision
            (stock_layer_id,revision_no,before_unit_cost,after_unit_cost,before_cost_status,
             after_cost_status,allocated_qty,cogs_delta,reason,actor_id)
           VALUES($1,$2,$3,$4,$5,'FINAL',$6,$7,$8,$9)
           RETURNING id,stock_layer_id,revision_no,before_unit_cost,after_unit_cost,
                     before_cost_status,after_cost_status,allocated_qty,cogs_delta,reason,
                     actor_id,$10::text AS actor_name,created_at::text`,
          [
            id,
            revisionNo,
            beforeUnitCost,
            unitCost,
            current.cost_status,
            allocatedQty,
            cogsDelta,
            reason,
            user.id,
            user.displayName,
          ],
        );

        await writeAudit(
          {
            branchId: current.branch_id,
            actorId: user.id,
            action: "RECONCILE_COST",
            objectType: "stock_layer",
            objectId: id,
            reason,
            metadata: {
              revisionNo,
              beforeUnitCost,
              afterUnitCost: unitCost,
              beforeCostStatus: current.cost_status,
              afterCostStatus: "FINAL",
              allocatedQty,
              affectedReadings,
              cogsDelta,
            },
          },
          client,
        );

        const row = revision.rows[0];
        if (row === undefined) throw new Error("Cost revision insert tidak mengembalikan row.");
        return { ...mapCostRevision(row), affectedReadings };
      });

      sendJson(response, 200, item);
    },
  );
}

function scopedBranchId(
  role: string,
  assignedBranchId: string | null,
  requestedBranchId: string | null,
): string | null {
  if (role === "ADMIN") return requestedBranchId;
  if (assignedBranchId === null) {
    throw new AppError(403, "BRANCH_ASSIGNMENT_REQUIRED", "Akun harus memiliki assignment cabang.");
  }
  if (requestedBranchId !== null && requestedBranchId !== assignedBranchId) {
    throw new AppError(403, "BRANCH_SCOPE_DENIED", "Cabang berada di luar scope akun.");
  }
  return assignedBranchId;
}

function isBranchAllowed(role: string, assignedBranchId: string | null, branchId: string): boolean {
  return role === "ADMIN" || (assignedBranchId !== null && assignedBranchId === branchId);
}

async function assertLayerScope(
  id: string,
  role: string,
  assignedBranchId: string | null,
): Promise<void> {
  const result = await pool.query<{ branch_id: string }>(
    `SELECT stock.branch_id
     FROM stock_layer layer
     JOIN stock_unit stock ON stock.id=layer.stock_unit_id
     WHERE layer.id=$1`,
    [id],
  );
  const row = result.rows[0];
  if (row === undefined || !isBranchAllowed(role, assignedBranchId, row.branch_id)) {
    throw new AppError(404, "STOCK_LAYER_NOT_FOUND", "Layer stock tidak ditemukan.");
  }
}

function mapPendingCost(row: PendingCostRow) {
  return {
    id: row.stock_layer_id,
    branchId: row.branch_id,
    branchCode: row.branch_code,
    branchName: row.branch_name,
    stockUnitId: row.stock_unit_id,
    stockUnitCode: row.stock_unit_code,
    stockUnitName: row.stock_unit_name,
    productCode: row.product_code,
    productName: row.product_name,
    receivedAt: row.received_at,
    initialQty: Number(row.initial_qty),
    remainingQty: Number(row.remaining_qty),
    unitCost: Number(row.unit_cost),
    unitSellingPrice: Number(row.unit_selling_price),
    costStatus: row.cost_status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    allocatedQty: Number(row.allocated_qty),
    affectedReadingCount: Number(row.affected_reading_count),
  };
}

function mapCostRevision(row: CostRevisionRow) {
  return {
    id: row.id,
    stockLayerId: row.stock_layer_id,
    revisionNo: Number(row.revision_no),
    beforeUnitCost: Number(row.before_unit_cost),
    afterUnitCost: Number(row.after_unit_cost),
    beforeCostStatus: row.before_cost_status,
    afterCostStatus: row.after_cost_status,
    allocatedQty: Number(row.allocated_qty),
    cogsDelta: Number(row.cogs_delta),
    reason: row.reason,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

function requiredId(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new AppError(400, "STOCK_LAYER_ID_REQUIRED", "ID layer stock wajib diisi.");
  }
  return value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
