import { calculateMeterQuantity, type CreateMeterReadingInput } from "@spbu/contracts";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import { lockIdempotencyKey } from "../db/idempotency.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { queryParam, readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { AppError, databaseCode } from "../lib/errors.js";
import { dateField, numberField, objectBody, stringField } from "../lib/validation.js";
import { writeAudit } from "../lib/audit.js";
import { allocateMeterSale, assignedStockUnit } from "../services/inventoryPostingService.js";

export function registerMeterReadingRoutes(router: Router): void {
  router.add("GET", "/api/v1/sales/meter-readings", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const showAll = queryParam(url, "all", false) === "true";
    const date = queryParam(url, "date", !showAll);
    const result = await pool.query<{
      id: string;
      business_date: string;
      meter_unit_name: string;
      stock_unit_name: string;
      meter_start: number;
      meter_end: number;
      meter_reset_offset: number;
      meter_sales_qty: number;
      posted_sales_qty: number;
      expected_sales_amount: number;
      cash_deposit_amount: number;
      liter_variance: number;
      cash_variance: number;
      reconciliation_status: "PENDING" | "MATCHED" | "EXPLAINED" | "ESCALATED" | "CLOSED";
      note: string | null;
    }>(
      `SELECT * FROM meter_reconciliation_view
       WHERE branch_id = $1
         ${showAll ? "" : "AND business_date = $2::date"}
       ORDER BY business_date DESC, meter_unit_name`,
      showAll ? [branchId] : [branchId, date],
    );
    sendJson(response, 200, {
      items: result.rows.map((row) => ({
        id: row.id,
        businessDate: row.business_date,
        meterUnitName: row.meter_unit_name,
        stockUnitName: row.stock_unit_name,
        meterStart: row.meter_start,
        meterEnd: row.meter_end,
        resetOffset: row.meter_reset_offset,
        meterSalesQty: row.meter_sales_qty,
        postedSalesQty: row.posted_sales_qty,
        expectedSalesAmount: row.expected_sales_amount,
        cashDepositAmount: row.cash_deposit_amount,
        literVariance: row.liter_variance,
        cashVariance: row.cash_variance,
        status: row.reconciliation_status,
        note: row.note,
      })),
    });
  });

  router.add("POST", "/api/v1/sales/meter-readings", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER", "OPERATOR"]);
    const input = parseMeterReading(await readJson(request));
    assertBranch(user.role, user.branchId, input.branchId);
    const meterQuantity = calculateMeterQuantity(
      input.meterStart,
      input.meterEnd,
      input.meterResetOffset,
    );
    if (meterQuantity < 0) {
      throw new AppError(422, "NEGATIVE_METER_QUANTITY", "Kuantitas meter tidak boleh negatif.");
    }

    try {
      const result = await inTransaction(async (client) => {
        await lockIdempotencyKey(client, `meter-reading:${input.branchId}`, input.idempotencyKey);
        const replay = await client.query<MeterReadingMutationRow>(
          `SELECT id,business_date,meter_sales_qty,posting_status,created_at
           FROM sales_meter_reading WHERE branch_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [input.branchId, input.idempotencyKey],
        );
        const replayed = replay.rows[0];
        if (replayed !== undefined) return { status: 200, reading: replayed } as const;

        const continuity = await client.query<{ meter_end: number }>(
          `SELECT meter_end FROM sales_meter_reading
           WHERE meter_unit_id=$1 AND business_date < $2::date AND posting_status='POSTED'
           ORDER BY business_date DESC,created_at DESC LIMIT 1`,
          [input.meterUnitId, input.businessDate],
        );
        const previousEnd = continuity.rows[0]?.meter_end;
        if (
          previousEnd !== undefined &&
          previousEnd !== input.meterStart &&
          input.meterResetOffset === 0
        ) {
          throw new AppError(
            422,
            "METER_CONTINUITY_ERROR",
            "Meter awal tidak sama dengan meter akhir sebelumnya. Isi reset offset dan catatan bila meter di-reset/diganti.",
            { meterStart: `Nilai sebelumnya ${previousEnd}.` },
          );
        }
        const stockUnitId = await assignedStockUnit(
          client,
          input.branchId,
          input.meterUnitId,
          input.businessDate,
        );
        const inserted = await client.query<MeterReadingMutationRow>(
          `INSERT INTO sales_meter_reading (
             branch_id,meter_unit_id,business_date,meter_start,meter_end,meter_reset_offset,
             cash_deposit_amount,note,idempotency_key,posting_status,posted_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'POSTED',now())
           RETURNING id,business_date,meter_sales_qty,posting_status,created_at`,
          [
            input.branchId,
            input.meterUnitId,
            input.businessDate,
            input.meterStart,
            input.meterEnd,
            input.meterResetOffset,
            input.cashDepositAmount,
            input.note,
            input.idempotencyKey,
          ],
        );
        const created = inserted.rows[0];
        if (created === undefined) throw new Error("Meter reading insert did not return a row.");
        if (meterQuantity > 0) {
          await allocateMeterSale(
            client,
            created.id,
            stockUnitId,
            meterQuantity,
            input.unitSellingPrice,
            input.businessDate,
          );
          await client.query(
            `INSERT INTO inventory_movement
             (branch_id,stock_unit_id,business_date,movement_type,quantity_delta,source_type,source_id,
              posted_by,idempotency_key,reference,reason)
             VALUES($1,$2,$3,'SALE',$4,'METER_READING',$5,$6,$7,$8,$9)`,
            [
              input.branchId,
              stockUnitId,
              input.businessDate,
              -meterQuantity,
              created.id,
              user.id,
              `meter:${input.idempotencyKey}`,
              input.idempotencyKey,
              input.note,
            ],
          );
        }
        await client.query(
          `UPDATE sales_meter_reading SET reconciliation_status=
           CASE WHEN ABS(cash_deposit_amount-$2::numeric)<=0.5
             THEN 'MATCHED'::reconciliation_status ELSE 'PENDING'::reconciliation_status END
           WHERE id=$1`,
          [created.id, meterQuantity * input.unitSellingPrice],
        );
        await writeAudit(
          {
            branchId: input.branchId,
            actorId: user.id,
            action: "POST",
            objectType: "sales_meter_reading",
            objectId: created.id,
            metadata: {
              meterUnitId: input.meterUnitId,
              stockUnitId,
              businessDate: input.businessDate,
              meterStart: input.meterStart,
              meterEnd: input.meterEnd,
              meterResetOffset: input.meterResetOffset,
              unitSellingPrice: input.unitSellingPrice,
              cashDepositAmount: input.cashDepositAmount,
              meterSalesQty: created.meter_sales_qty,
            },
          },
          client,
        );
        return { status: 201, reading: created } as const;
      });
      sendJson(response, result.status, result.reading);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new AppError(
          409,
          "METER_READING_EXISTS",
          "Bacaan meter untuk tanggal dan shift ini sudah ada. Buka rekonsiliasi untuk meninjau data tersimpan.",
        );
      }
      throw error;
    }
  });
}

interface MeterReadingMutationRow {
  id: string;
  business_date: string;
  meter_sales_qty: number;
  posting_status: string;
  created_at: string;
}

function assertBranch(role: string, assignedBranchId: string | null, targetBranchId: string): void {
  if (role !== "ADMIN" && assignedBranchId !== targetBranchId) {
    throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
  }
}

function parseMeterReading(value: unknown): CreateMeterReadingInput {
  const body = objectBody(value);
  return {
    branchId: stringField(body, "branchId", { max: 80 }) as string,
    meterUnitId: stringField(body, "meterUnitId", { max: 80 }) as string,
    businessDate: dateField(body, "businessDate"),
    meterStart: numberField(body, "meterStart", { min: 0, max: 1_000_000_000_000, scale: 3 }),
    meterEnd: numberField(body, "meterEnd", { min: 0, max: 1_000_000_000_000, scale: 3 }),
    meterResetOffset: numberField(body, "meterResetOffset", {
      min: 0,
      max: 1_000_000_000,
      scale: 3,
    }),
    unitSellingPrice: numberField(body, "unitSellingPrice", {
      min: 0.01,
      max: 10_000_000_000_000,
      scale: 2,
    }),
    cashDepositAmount: numberField(body, "cashDepositAmount", {
      min: 0,
      max: 10_000_000_000_000,
      scale: 2,
    }),
    note: stringField(body, "note", { nullable: true, max: 2_000 }),
    idempotencyKey: stringField(body, "idempotencyKey", { min: 8, max: 120 }) as string,
  };
}
