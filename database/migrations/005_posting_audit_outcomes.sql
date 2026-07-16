ALTER TABLE audit_log
  ADD COLUMN outcome text NOT NULL DEFAULT 'SUCCEEDED'
    CHECK (outcome IN ('SUCCEEDED', 'FAILED', 'DENIED')),
  ADD COLUMN impact_scope text NOT NULL DEFAULT 'SHARED'
    CHECK (impact_scope IN ('SHARED', 'LOCAL')),
  ADD COLUMN request_id text;

ALTER TABLE inventory_movement
  ADD COLUMN reference text,
  ADD COLUMN reason text;

CREATE INDEX audit_log_outcome_time_idx
  ON audit_log (outcome, occurred_at DESC);

DROP VIEW IF EXISTS daily_stock_view;
CREATE VIEW daily_stock_view AS
WITH daily AS (
  SELECT
    branch_id,
    stock_unit_id,
    business_date,
    SUM(quantity_delta) FILTER (WHERE movement_type = 'OPENING') AS opening_input_qty,
    SUM(quantity_delta) FILTER (WHERE movement_type = 'SUPPLY') AS supply_qty,
    ABS(SUM(quantity_delta) FILTER (WHERE movement_type = 'SALE')) AS sales_qty,
    SUM(quantity_delta) FILTER (WHERE movement_type = 'SALES_RETURN') AS sales_return_qty,
    SUM(quantity_delta) FILTER (WHERE movement_type = 'TRANSFER_IN') AS transfer_in_qty,
    ABS(SUM(quantity_delta) FILTER (WHERE movement_type = 'TRANSFER_OUT')) AS transfer_out_qty,
    SUM(quantity_delta) FILTER (WHERE movement_type = 'GAIN') AS gain_qty,
    ABS(SUM(quantity_delta) FILTER (WHERE movement_type = 'LOSS')) AS loss_qty,
    SUM(quantity_delta) AS net_change_qty
  FROM inventory_movement
  WHERE posting_status = 'POSTED'
  GROUP BY branch_id, stock_unit_id, business_date
), balanced AS (
  SELECT
    daily.*,
    SUM(net_change_qty) OVER (
      PARTITION BY stock_unit_id
      ORDER BY business_date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS closing_qty
  FROM daily
)
SELECT
  branch_id,
  stock_unit_id,
  business_date,
  closing_qty - net_change_qty + COALESCE(opening_input_qty, 0) AS opening_qty,
  COALESCE(supply_qty, 0) AS supply_qty,
  COALESCE(sales_qty, 0) AS sales_qty,
  COALESCE(sales_return_qty, 0) AS sales_return_qty,
  COALESCE(transfer_in_qty, 0) AS transfer_in_qty,
  COALESCE(transfer_out_qty, 0) AS transfer_out_qty,
  COALESCE(gain_qty, 0) AS gain_qty,
  COALESCE(loss_qty, 0) AS loss_qty,
  closing_qty
FROM balanced;
