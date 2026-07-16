import type {
  ActivityItem,
  Branch,
  ReconciliationRow,
  StockUnitSnapshot,
  TrendPoint,
} from "@spbu/contracts";
import { pool } from "../db/client.js";

export interface FinancialMetrics {
  salesAmount: number;
  grossProfitAmount: number;
  pendingApprovalCount: number;
}

export class DashboardRepository {
  async branch(branchId: string): Promise<Branch | null> {
    const result = await pool.query<{
      id: string;
      code: string;
      name: string;
      timezone: string;
      active: boolean;
    }>("SELECT id, code, name, timezone, active FROM branch WHERE id = $1 AND active = true", [
      branchId,
    ]);
    return result.rows[0] ?? null;
  }

  async stockUnits(branchId: string, businessDate: string): Promise<StockUnitSnapshot[]> {
    const result = await pool.query<{
      id: string;
      code: string;
      name: string;
      product_name: string;
      opening_qty: number;
      supply_qty: number;
      sales_qty: number;
      sales_return_qty: number;
      transfer_in_qty: number;
      transfer_out_qty: number;
      gain_qty: number;
      loss_qty: number;
      closing_qty: number;
      capacity_qty: number;
      low_stock_threshold_qty: number;
      updated_at: string;
    }>(
      `
        SELECT
          unit.id,
          unit.code,
          unit.name,
          product.name AS product_name,
          COALESCE(daily.opening_qty, previous.closing_qty, 0) AS opening_qty,
          COALESCE(daily.supply_qty, 0) AS supply_qty,
          COALESCE(daily.sales_qty, 0) AS sales_qty,
          COALESCE(daily.sales_return_qty, 0) AS sales_return_qty,
          COALESCE(daily.transfer_in_qty, 0) AS transfer_in_qty,
          COALESCE(daily.transfer_out_qty, 0) AS transfer_out_qty,
          COALESCE(daily.gain_qty, 0) AS gain_qty,
          COALESCE(daily.loss_qty, 0) AS loss_qty,
          COALESCE(daily.closing_qty, previous.closing_qty, 0) AS closing_qty,
          unit.capacity_qty,
          unit.low_stock_threshold_qty,
          COALESCE(latest.posted_at, unit.created_at)::text AS updated_at
        FROM stock_unit unit
        JOIN product ON product.id = unit.product_id
        LEFT JOIN daily_stock_view daily
          ON daily.stock_unit_id = unit.id AND daily.business_date = $2::date
        LEFT JOIN LATERAL (
          SELECT closing_qty
          FROM daily_stock_view previous_day
          WHERE previous_day.stock_unit_id = unit.id
            AND previous_day.business_date < $2::date
          ORDER BY previous_day.business_date DESC
          LIMIT 1
        ) previous ON true
        LEFT JOIN LATERAL (
          SELECT posted_at
          FROM inventory_movement movement
          WHERE movement.stock_unit_id = unit.id AND movement.business_date <= $2::date
          ORDER BY posted_at DESC
          LIMIT 1
        ) latest ON true
        WHERE unit.branch_id = $1 AND unit.active = true
        ORDER BY unit.name
      `,
      [branchId, businessDate],
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      productName: row.product_name,
      openingQty: row.opening_qty,
      supplyQty: row.supply_qty,
      salesQty: row.sales_qty,
      returnQty: row.sales_return_qty,
      transferInQty: row.transfer_in_qty,
      transferOutQty: row.transfer_out_qty,
      gainQty: row.gain_qty,
      lossQty: row.loss_qty,
      closingQty: row.closing_qty,
      capacityQty: row.capacity_qty,
      lowStockThresholdQty: row.low_stock_threshold_qty,
      updatedAt: row.updated_at,
    }));
  }

  async reconciliations(branchId: string, businessDate: string): Promise<ReconciliationRow[]> {
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
      reconciliation_status: ReconciliationRow["status"];
      note: string | null;
    }>(
      `
        SELECT id, business_date::text, meter_unit_name, stock_unit_name,
          meter_start, meter_end, meter_reset_offset, meter_sales_qty,
          posted_sales_qty, expected_sales_amount, cash_deposit_amount,
          liter_variance, cash_variance, reconciliation_status, note
        FROM meter_reconciliation_view
        WHERE branch_id = $1 AND business_date = $2::date
        ORDER BY meter_unit_name
      `,
      [branchId, businessDate],
    );
    return result.rows.map((row) => ({
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
    }));
  }

  async trend(branchId: string, businessDate: string, days: number): Promise<TrendPoint[]> {
    const result = await pool.query<{
      business_date: string;
      stock_qty: number;
      sales_qty: number;
      cash_amount: number;
    }>(
      `
        WITH days AS (
          SELECT generate_series($2::date - ($3::int - 1),$2::date,'1 day')::date AS business_date
        ), bounds AS (
          SELECT MIN(business_date) AS first_date,MAX(business_date) AS last_date FROM days
        ), opening AS (
          SELECT COALESCE(SUM(movement.quantity_delta),0) AS quantity
          FROM inventory_movement movement,bounds
          WHERE movement.branch_id=$1 AND movement.business_date<bounds.first_date
            AND movement.posting_status='POSTED'
        ), movement_daily AS (
          SELECT movement.business_date,SUM(movement.quantity_delta) AS net_quantity,
            ABS(SUM(movement.quantity_delta)
              FILTER (WHERE movement.movement_type='SALE')) AS sales_qty
          FROM inventory_movement movement,bounds
          WHERE movement.branch_id=$1
            AND movement.business_date BETWEEN bounds.first_date AND bounds.last_date
            AND movement.posting_status='POSTED'
          GROUP BY movement.business_date
        ), cash_daily AS (
          SELECT reading.business_date,SUM(reading.cash_deposit_amount) AS cash_amount
          FROM sales_meter_reading reading,bounds
          WHERE reading.branch_id=$1
            AND reading.business_date BETWEEN bounds.first_date AND bounds.last_date
            AND reading.posting_status='POSTED'
          GROUP BY reading.business_date
        )
        SELECT days.business_date::text,
          opening.quantity + SUM(COALESCE(movement_daily.net_quantity,0)) OVER (
            ORDER BY days.business_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS stock_qty,
          COALESCE(movement_daily.sales_qty,0) AS sales_qty,
          COALESCE(cash_daily.cash_amount,0) AS cash_amount
        FROM days CROSS JOIN opening
        LEFT JOIN movement_daily USING (business_date)
        LEFT JOIN cash_daily USING (business_date)
        ORDER BY days.business_date
      `,
      [branchId, businessDate, days],
    );
    return result.rows.map((row) => ({
      label: row.business_date,
      stockQty: row.stock_qty,
      salesQty: row.sales_qty,
      cashAmount: row.cash_amount,
    }));
  }

  async financialMetrics(branchId: string, businessDate: string): Promise<FinancialMetrics> {
    const result = await pool.query<{
      sales_amount: number;
      gross_profit_amount: number;
      pending_approval_count: number;
    }>(
      `
        SELECT
          COALESCE((
            SELECT SUM(allocation.quantity * allocation.unit_selling_price)
            FROM fifo_allocation allocation
            JOIN sales_meter_reading reading ON reading.id = allocation.sales_meter_reading_id
            WHERE reading.branch_id = $1 AND reading.business_date = $2::date
              AND reading.posting_status='POSTED'
          ), 0) AS sales_amount,
          COALESCE((
            SELECT SUM(allocation.quantity * (allocation.unit_selling_price - allocation.unit_cost))
            FROM fifo_allocation allocation
            JOIN sales_meter_reading reading ON reading.id = allocation.sales_meter_reading_id
            WHERE reading.branch_id = $1 AND reading.business_date = $2::date
              AND reading.posting_status='POSTED'
          ), 0) AS gross_profit_amount,
          COALESCE((
            SELECT COUNT(*)::int
            FROM adjustment_suggestion suggestion
            JOIN stock_opname opname ON opname.id = suggestion.stock_opname_id
            JOIN stock_unit unit ON unit.id = opname.stock_unit_id
            WHERE unit.branch_id = $1 AND suggestion.status = 'PENDING'
          ), 0) AS pending_approval_count
      `,
      [branchId, businessDate],
    );
    const row = result.rows[0];
    return {
      salesAmount: row?.sales_amount ?? 0,
      grossProfitAmount: row?.gross_profit_amount ?? 0,
      pendingApprovalCount: row?.pending_approval_count ?? 0,
    };
  }

  async activities(branchId: string): Promise<ActivityItem[]> {
    const result = await pool.query<{
      id: string;
      action: string;
      object_type: string;
      object_id: string;
      occurred_at: string;
      actor_name: string;
      label: string | null;
    }>(
      `
        SELECT log.id::text,log.action,log.object_type,log.object_id,log.occurred_at::text,
          COALESCE(account.display_name,log.metadata->>'actor_name','System') AS actor_name,
          log.metadata->>'label' AS label
        FROM audit_log log
        LEFT JOIN app_user account ON account.id=log.actor_id
        WHERE log.branch_id=$1
        ORDER BY log.occurred_at DESC
        LIMIT 8
      `,
      [branchId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      kind: activityKind(row.action, row.object_type),
      title: row.label ?? `${row.action} ${row.object_type}`,
      detail: `Object ${row.object_id}`,
      occurredAt: row.occurred_at,
      actorName: row.actor_name,
    }));
  }
}

function activityKind(action: string, objectType: string): ActivityItem["kind"] {
  if (action === "EXPORT") return "EXPORT";
  if (objectType.includes("meter") || objectType.includes("sale")) return "SALE";
  if (objectType.includes("adjustment") || objectType.includes("opname")) return "ADJUSTMENT";
  if (objectType.includes("supply") || objectType.includes("inventory")) return "SUPPLY";
  return "SYSTEM";
}
