import { pool } from "../db/client.js";
import type { Router } from "../http/router.js";
import { queryParam, readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { requireUser } from "../auth/session.js";
import { AppError } from "../lib/errors.js";
import { assertTrustedOrigin } from "../auth/session.js";
import { objectBody, stringField } from "../lib/validation.js";
import { writeAudit } from "../lib/audit.js";

export function registerReportRoutes(router: Router): void {
  router.add("GET", "/api/v1/reports/daily-stock", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const startDate = queryParam(url, "startDate") as string;
    const endDate = queryParam(url, "endDate") as string;
    const result = await pool.query(
      `SELECT daily.*, unit.code AS stock_unit_code, unit.name AS stock_unit_name,
        product.name AS product_name
       FROM daily_stock_view daily
       JOIN stock_unit unit ON unit.id = daily.stock_unit_id
       JOIN product ON product.id = unit.product_id
       WHERE daily.branch_id = $1 AND daily.business_date BETWEEN $2::date AND $3::date
       ORDER BY daily.business_date, unit.name`,
      [branchId, startDate, endDate],
    );
    sendJson(response, 200, { items: result.rows });
  });

  router.add("GET", "/api/v1/reports/meter-reconciliation", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const startDate = queryParam(url, "startDate") as string;
    const endDate = queryParam(url, "endDate") as string;
    const result = await pool.query(
      `SELECT * FROM meter_reconciliation_view
       WHERE branch_id = $1 AND business_date BETWEEN $2::date AND $3::date
       ORDER BY business_date, meter_unit_name`,
      [branchId, startDate, endDate],
    );
    sendJson(response, 200, { items: result.rows });
  });

  router.add("GET", "/api/v1/reports/operational-package", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const startDate = queryParam(url, "startDate") as string;
    const endDate = queryParam(url, "endDate") as string;

    const branchResult = await pool.query<{
      id: string;
      code: string;
      name: string;
      timezone: string;
    }>(
      `SELECT id, code, name, timezone
       FROM branch
       WHERE id = $1`,
      [branchId],
    );
    const branch = branchResult.rows[0];
    if (branch === undefined) {
      throw new AppError(404, "BRANCH_NOT_FOUND", "Cabang tidak ditemukan.");
    }

    const [
      dailyStock,
      meterReconciliations,
      movements,
      stockOpnames,
      stockLayers,
      fifoAllocations,
      cashEntries,
      auditLogs,
      stagedSourceRows,
    ] = await Promise.all([
      pool.query(
        `WITH dates AS (
           SELECT generate_series($2::date, $3::date, interval '1 day')::date AS business_date
         ), units AS (
           SELECT
             unit.id AS stock_unit_id,
             unit.code AS stock_unit_code,
             unit.name AS stock_unit_name,
             product.code AS product_code,
             product.name AS product_name
           FROM stock_unit unit
           JOIN product ON product.id = unit.product_id
           WHERE unit.branch_id = $1
         ), prior AS (
           SELECT stock_unit_id, COALESCE(SUM(quantity_delta), 0) AS prior_qty
           FROM inventory_movement
           WHERE branch_id = $1
             AND posting_status = 'POSTED'
             AND business_date < $2::date
           GROUP BY stock_unit_id
         ), daily AS (
           SELECT
             stock_unit_id,
             business_date,
             COALESCE(SUM(quantity_delta) FILTER (WHERE movement_type = 'OPENING'), 0) AS opening_input_qty,
             COALESCE(SUM(quantity_delta) FILTER (WHERE movement_type = 'SUPPLY'), 0) AS supply_qty,
             COALESCE(ABS(SUM(quantity_delta) FILTER (WHERE movement_type = 'SALE')), 0) AS sales_qty,
             COALESCE(SUM(quantity_delta) FILTER (WHERE movement_type = 'SALES_RETURN'), 0) AS sales_return_qty,
             COALESCE(SUM(quantity_delta) FILTER (WHERE movement_type = 'TRANSFER_IN'), 0) AS transfer_in_qty,
             COALESCE(ABS(SUM(quantity_delta) FILTER (WHERE movement_type = 'TRANSFER_OUT')), 0) AS transfer_out_qty,
             COALESCE(SUM(quantity_delta) FILTER (WHERE movement_type = 'GAIN'), 0) AS gain_qty,
             COALESCE(ABS(SUM(quantity_delta) FILTER (WHERE movement_type = 'LOSS')), 0) AS loss_qty,
             COALESCE(SUM(quantity_delta), 0) AS net_change_qty
           FROM inventory_movement
           WHERE branch_id = $1
             AND posting_status = 'POSTED'
             AND business_date BETWEEN $2::date AND $3::date
           GROUP BY stock_unit_id, business_date
         ), calendar AS (
           SELECT
             dates.business_date,
             units.*,
             COALESCE(prior.prior_qty, 0) AS prior_qty,
             COALESCE(daily.opening_input_qty, 0) AS opening_input_qty,
             COALESCE(daily.supply_qty, 0) AS supply_qty,
             COALESCE(daily.sales_qty, 0) AS sales_qty,
             COALESCE(daily.sales_return_qty, 0) AS sales_return_qty,
             COALESCE(daily.transfer_in_qty, 0) AS transfer_in_qty,
             COALESCE(daily.transfer_out_qty, 0) AS transfer_out_qty,
             COALESCE(daily.gain_qty, 0) AS gain_qty,
             COALESCE(daily.loss_qty, 0) AS loss_qty,
             COALESCE(daily.net_change_qty, 0) AS net_change_qty
           FROM units
           CROSS JOIN dates
           LEFT JOIN prior ON prior.stock_unit_id = units.stock_unit_id
           LEFT JOIN daily
             ON daily.stock_unit_id = units.stock_unit_id
            AND daily.business_date = dates.business_date
         ), balanced AS (
           SELECT
             calendar.*,
             prior_qty + SUM(net_change_qty) OVER (
               PARTITION BY stock_unit_id
               ORDER BY business_date
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS closing_qty
           FROM calendar
         )
         SELECT
           to_char(business_date, 'YYYY-MM-DD') AS "businessDate",
           stock_unit_id AS "stockUnitId",
           stock_unit_code AS "stockUnitCode",
           stock_unit_name AS "stockUnitName",
           product_code AS "productCode",
           product_name AS "productName",
           (closing_qty - net_change_qty + opening_input_qty)::double precision AS "openingQty",
           supply_qty::double precision AS "supplyQty",
           sales_qty::double precision AS "salesQty",
           sales_return_qty::double precision AS "salesReturnQty",
           transfer_in_qty::double precision AS "transferInQty",
           transfer_out_qty::double precision AS "transferOutQty",
           gain_qty::double precision AS "gainQty",
           loss_qty::double precision AS "lossQty",
           closing_qty::double precision AS "closingQty"
         FROM balanced
         ORDER BY stock_unit_name, business_date`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           reconciliation.id,
           to_char(reconciliation.business_date, 'YYYY-MM-DD') AS "businessDate",
           reconciliation.stock_unit_id AS "stockUnitId",
           stock.code AS "stockUnitCode",
           reconciliation.stock_unit_name AS "stockUnitName",
           reconciliation.meter_unit_id AS "meterUnitId",
           meter.code AS "meterUnitCode",
           reconciliation.meter_unit_name AS "meterUnitName",
           reconciliation.meter_start::double precision AS "meterStart",
           reconciliation.meter_end::double precision AS "meterEnd",
           reconciliation.meter_reset_offset::double precision AS "meterResetOffset",
           reconciliation.meter_sales_qty::double precision AS "meterSalesQty",
           reconciliation.posted_sales_qty::double precision AS "postedSalesQty",
           reconciliation.expected_sales_amount::double precision AS "expectedSalesAmount",
           reconciliation.cash_deposit_amount::double precision AS "cashDepositAmount",
           reconciliation.liter_variance::double precision AS "literVariance",
           reconciliation.cash_variance::double precision AS "cashVariance",
           reconciliation.reconciliation_status::text AS "reconciliationStatus",
           reading.posting_status::text AS "postingStatus",
           reconciliation.note,
           reconciliation.created_at AS "createdAt",
           reading.posted_at AS "postedAt"
         FROM meter_reconciliation_view reconciliation
         JOIN sales_meter_reading reading ON reading.id = reconciliation.id
         JOIN meter_unit meter ON meter.id = reconciliation.meter_unit_id
         JOIN stock_unit stock ON stock.id = reconciliation.stock_unit_id
         WHERE reconciliation.branch_id = $1
           AND reconciliation.business_date BETWEEN $2::date AND $3::date
         ORDER BY reconciliation.business_date, reconciliation.stock_unit_name, reconciliation.meter_unit_name`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           movement.id,
           to_char(movement.business_date, 'YYYY-MM-DD') AS "businessDate",
           unit.code AS "stockUnitCode",
           unit.name AS "stockUnitName",
           product.code AS "productCode",
           product.name AS "productName",
           movement.movement_type::text AS "movementType",
           movement.quantity_delta::double precision AS "quantityDelta",
           movement.source_type AS "sourceType",
           movement.source_id AS "sourceId",
           movement.reference,
           movement.reason,
           movement.posting_status::text AS "postingStatus",
           actor.display_name AS "postedByName",
           movement.posted_at AS "postedAt",
           movement.created_at AS "createdAt"
         FROM inventory_movement movement
         JOIN stock_unit unit ON unit.id = movement.stock_unit_id
         JOIN product ON product.id = unit.product_id
         LEFT JOIN app_user actor ON actor.id = movement.posted_by
         WHERE movement.branch_id = $1
           AND movement.business_date BETWEEN $2::date AND $3::date
         ORDER BY movement.business_date, unit.name, movement.posted_at, movement.id`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           opname.id,
           to_char(opname.business_date, 'YYYY-MM-DD') AS "businessDate",
           opname.stock_unit_id AS "stockUnitId",
           unit.code AS "stockUnitCode",
           unit.name AS "stockUnitName",
           product.code AS "productCode",
           product.name AS "productName",
           opname.system_qty::double precision AS "systemQty",
           opname.physical_qty::double precision AS "physicalQty",
           opname.variance_qty::double precision AS "varianceQty",
           opname.evidence_object_key AS "evidenceObjectKey",
           opname.posting_status::text AS "postingStatus",
           suggestion.suggested_type::text AS "suggestedType",
           suggestion.suggested_qty::double precision AS "suggestedQty",
           suggestion.approved_type::text AS "approvedType",
           suggestion.approved_qty::double precision AS "approvedQty",
           suggestion.status::text AS "suggestionStatus",
           suggestion.decision_reason AS "decisionReason",
           decider.display_name AS "decidedByName",
           suggestion.decided_at AS "decidedAt",
           opname.created_at AS "createdAt"
         FROM stock_opname opname
         JOIN stock_unit unit ON unit.id = opname.stock_unit_id
         JOIN product ON product.id = unit.product_id
         LEFT JOIN adjustment_suggestion suggestion ON suggestion.stock_opname_id = opname.id
         LEFT JOIN app_user decider ON decider.id = suggestion.decided_by
         WHERE unit.branch_id = $1
           AND opname.business_date BETWEEN $2::date AND $3::date
         ORDER BY opname.business_date, unit.name`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           layer.id,
           unit.code AS "stockUnitCode",
           unit.name AS "stockUnitName",
           product.code AS "productCode",
           product.name AS "productName",
           layer.received_at AS "receivedAt",
           layer.sequence_no AS "sequenceNo",
           layer.initial_qty::double precision AS "initialQty",
           layer.remaining_qty::double precision AS "remainingQty",
           COALESCE(SUM(allocation.quantity), 0)::double precision AS "allocatedQty",
           layer.unit_cost::double precision AS "unitCost",
           layer.unit_selling_price::double precision AS "unitSellingPrice",
           layer.cost_status AS "costStatus",
           layer.source_type AS "sourceType",
           layer.source_id AS "sourceId"
         FROM stock_layer layer
         JOIN stock_unit unit ON unit.id = layer.stock_unit_id
         JOIN product ON product.id = unit.product_id
         LEFT JOIN fifo_allocation allocation ON allocation.stock_layer_id = layer.id
         WHERE unit.branch_id = $1
           AND layer.received_at < ($2::date + interval '1 day')
         GROUP BY layer.id, unit.id, product.id
         ORDER BY unit.name, layer.received_at, layer.sequence_no`,
        [branchId, endDate],
      ),
      pool.query(
        `SELECT
           allocation.id,
           reading.id AS "readingId",
           to_char(reading.business_date, 'YYYY-MM-DD') AS "businessDate",
           meter.code AS "meterUnitCode",
           meter.name AS "meterUnitName",
           unit.code AS "stockUnitCode",
           unit.name AS "stockUnitName",
           product.code AS "productCode",
           product.name AS "productName",
           layer.id AS "layerId",
           layer.received_at AS "layerReceivedAt",
           allocation.quantity::double precision AS quantity,
           allocation.unit_cost::double precision AS "unitCost",
           allocation.unit_selling_price::double precision AS "unitSellingPrice",
           (allocation.quantity * allocation.unit_cost)::double precision AS "cogsAmount",
           (allocation.quantity * allocation.unit_selling_price)::double precision AS "revenueAmount",
           (allocation.quantity * (allocation.unit_selling_price - allocation.unit_cost))::double precision AS "grossProfitAmount",
           layer.cost_status AS "costStatus",
           layer.source_type AS "layerSourceType",
           layer.source_id AS "layerSourceId"
         FROM fifo_allocation allocation
         JOIN sales_meter_reading reading ON reading.id = allocation.sales_meter_reading_id
         JOIN meter_unit meter ON meter.id = reading.meter_unit_id
         JOIN stock_layer layer ON layer.id = allocation.stock_layer_id
         JOIN stock_unit unit ON unit.id = layer.stock_unit_id
         JOIN product ON product.id = unit.product_id
         WHERE reading.branch_id = $1
           AND reading.business_date BETWEEN $2::date AND $3::date
         ORDER BY reading.business_date, unit.name, layer.received_at, layer.sequence_no`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           'EXPENSE'::text AS "entryType",
           to_char(business_date, 'YYYY-MM-DD') AS "businessDate",
           category,
           amount::double precision AS amount,
           note,
           posting_status::text AS "postingStatus"
         FROM expense
         WHERE branch_id = $1 AND business_date BETWEEN $2::date AND $3::date
         UNION ALL
         SELECT
           'OTHER_INCOME'::text AS "entryType",
           to_char(business_date, 'YYYY-MM-DD') AS "businessDate",
           category,
           amount::double precision AS amount,
           note,
           posting_status::text AS "postingStatus"
         FROM other_income
         WHERE branch_id = $1 AND business_date BETWEEN $2::date AND $3::date
         ORDER BY "businessDate", "entryType", category`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           audit.id::integer AS id,
           audit.occurred_at AS "occurredAt",
           actor.display_name AS "actorName",
           audit.action,
           audit.object_type AS "objectType",
           audit.object_id AS "objectId",
           audit.reason,
           audit.outcome,
           audit.impact_scope AS "impactScope",
           audit.request_id AS "requestId",
           audit.metadata
         FROM audit_log audit
         JOIN branch ON branch.id = audit.branch_id
         LEFT JOIN app_user actor ON actor.id = audit.actor_id
         WHERE audit.branch_id = $1
           AND (audit.occurred_at AT TIME ZONE branch.timezone)::date BETWEEN $2::date AND $3::date
         ORDER BY audit.occurred_at, audit.id`,
        [branchId, startDate, endDate],
      ),
      pool.query(
        `SELECT
           source.id,
           to_char(source.business_date, 'YYYY-MM-DD') AS "businessDate",
           unit.code AS "stockUnitCode",
           unit.name AS "stockUnitName",
           meter.code AS "meterUnitCode",
           meter.name AS "meterUnitName",
           source.source_status AS "sourceStatus",
           source.blocking_reasons AS "blockingReasons",
           source.source_file AS "sourceFile",
           source.source_sheet AS "sourceSheet",
           source.source_row AS "sourceRow",
           source.raw_data AS "rawData",
           source.resolution_note AS "resolutionNote",
           source.staged_at AS "stagedAt"
         FROM historical_source_row source
         JOIN stock_unit unit ON unit.id = source.stock_unit_id
         LEFT JOIN meter_unit meter ON meter.id = source.meter_unit_id
         WHERE source.branch_id = $1
           AND source.business_date BETWEEN $2::date AND $3::date
         ORDER BY source.business_date, unit.name, source.source_row`,
        [branchId, startDate, endDate],
      ),
    ]);

    sendJson(response, 200, {
      branch,
      period: { startDate, endDate },
      dailyStock: dailyStock.rows,
      meterReconciliations: meterReconciliations.rows,
      movements: movements.rows,
      stockOpnames: stockOpnames.rows,
      stockLayers: stockLayers.rows,
      fifoAllocations: fifoAllocations.rows,
      cashEntries: cashEntries.rows,
      auditLogs: auditLogs.rows,
      stagedSourceRows: stagedSourceRows.rows,
    });
  });

  router.add("POST", "/api/v1/reports/export-events", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const body = objectBody(await readJson(request));
    const branchId = stringField(body, "branchId", { max: 80 }) as string;
    assertBranch(user.role, user.branchId, branchId);
    const format = stringField(body, "format", { min: 3, max: 8 }) as string;
    const startDate = stringField(body, "startDate", { max: 10 }) as string;
    const endDate = stringField(body, "endDate", { max: 10 }) as string;
    await writeAudit({
      branchId,
      actorId: user.id,
      action: "EXPORT",
      objectType: "operational_report",
      objectId: `${startDate}:${endDate}`,
      metadata: { format, startDate, endDate },
    });
    sendJson(response, 201, { recorded: true });
  });
}

function assertBranch(role: string, assignedBranchId: string | null, targetBranchId: string): void {
  if (role !== "ADMIN" && assignedBranchId !== targetBranchId) {
    throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
  }
}
