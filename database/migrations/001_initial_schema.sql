CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE posting_status AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'REVERSED');
CREATE TYPE reconciliation_status AS ENUM ('PENDING', 'MATCHED', 'EXPLAINED', 'ESCALATED', 'CLOSED');
CREATE TYPE adjustment_type AS ENUM ('GAIN', 'LOSS', 'NONE');
CREATE TYPE suggestion_status AS ENUM (
  'PENDING', 'APPROVED_AS_SUGGESTED', 'APPROVED_WITH_OVERRIDE', 'REJECTED', 'POSTED', 'CANCELLED'
);
CREATE TYPE inventory_movement_type AS ENUM (
  'OPENING', 'SUPPLY', 'SALE', 'SALES_RETURN', 'SUPPLIER_RETURN',
  'TRANSFER_IN', 'TRANSFER_OUT', 'GAIN', 'LOSS', 'REVERSAL'
);

CREATE TABLE branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'LITER',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE stock_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  product_id uuid NOT NULL REFERENCES product(id),
  code text NOT NULL,
  name text NOT NULL,
  capacity_qty numeric(18,3) NOT NULL CHECK (capacity_qty > 0),
  low_stock_threshold_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK (low_stock_threshold_qty >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);

CREATE TABLE meter_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);

CREATE TABLE meter_stock_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_unit_id uuid NOT NULL REFERENCES meter_unit(id),
  stock_unit_id uuid NOT NULL REFERENCES stock_unit(id),
  valid_from date NOT NULL,
  valid_to date,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE reporting_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (branch_id, code)
);

CREATE TABLE reporting_group_member (
  reporting_group_id uuid NOT NULL REFERENCES reporting_group(id),
  stock_unit_id uuid NOT NULL REFERENCES stock_unit(id),
  valid_from date NOT NULL,
  valid_to date,
  PRIMARY KEY (reporting_group_id, stock_unit_id, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE price_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  product_id uuid NOT NULL REFERENCES product(id),
  margin_rate numeric(9,6) NOT NULL DEFAULT 0,
  fixed_markup_per_liter numeric(18,2) NOT NULL DEFAULT 0,
  rounding_step numeric(18,2) NOT NULL DEFAULT 1 CHECK (rounding_step > 0),
  valid_from date NOT NULL,
  valid_to date,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE inventory_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  stock_unit_id uuid NOT NULL REFERENCES stock_unit(id),
  business_date date NOT NULL,
  movement_type inventory_movement_type NOT NULL,
  quantity_delta numeric(18,3) NOT NULL CHECK (quantity_delta <> 0),
  source_type text NOT NULL,
  source_id uuid,
  posting_status posting_status NOT NULL DEFAULT 'POSTED',
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (branch_id, idempotency_key)
);

CREATE TABLE stock_layer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_unit_id uuid NOT NULL REFERENCES stock_unit(id),
  received_at timestamptz NOT NULL,
  sequence_no integer NOT NULL,
  initial_qty numeric(18,3) NOT NULL CHECK (initial_qty > 0),
  remaining_qty numeric(18,3) NOT NULL CHECK (remaining_qty >= 0),
  unit_cost numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  unit_selling_price numeric(18,2) NOT NULL CHECK (unit_selling_price >= unit_cost),
  source_type text NOT NULL,
  source_id uuid,
  UNIQUE (stock_unit_id, received_at, sequence_no)
);

CREATE TABLE sales_meter_reading (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  meter_unit_id uuid NOT NULL REFERENCES meter_unit(id),
  business_date date NOT NULL,
  shift_code text NOT NULL DEFAULT 'DAILY',
  meter_start numeric(18,3) NOT NULL,
  meter_end numeric(18,3) NOT NULL,
  meter_reset_offset numeric(18,3) NOT NULL DEFAULT 0,
  meter_sales_qty numeric(18,3) GENERATED ALWAYS AS (meter_end - meter_start + meter_reset_offset) STORED,
  cash_deposit_amount numeric(18,2) NOT NULL DEFAULT 0,
  note text,
  reconciliation_status reconciliation_status NOT NULL DEFAULT 'PENDING',
  posting_status posting_status NOT NULL DEFAULT 'DRAFT',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  CHECK (meter_end >= meter_start OR meter_reset_offset > 0),
  CHECK (meter_end - meter_start + meter_reset_offset >= 0),
  UNIQUE (branch_id, idempotency_key),
  UNIQUE (meter_unit_id, business_date, shift_code)
);

CREATE TABLE fifo_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_meter_reading_id uuid NOT NULL REFERENCES sales_meter_reading(id),
  stock_layer_id uuid NOT NULL REFERENCES stock_layer(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  unit_selling_price numeric(18,2) NOT NULL CHECK (unit_selling_price >= unit_cost),
  UNIQUE (sales_meter_reading_id, stock_layer_id)
);

CREATE TABLE stock_opname (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_unit_id uuid NOT NULL REFERENCES stock_unit(id),
  business_date date NOT NULL,
  system_qty numeric(18,3) NOT NULL,
  physical_qty numeric(18,3) NOT NULL CHECK (physical_qty >= 0),
  variance_qty numeric(18,3) GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  evidence_object_key text,
  posting_status posting_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_unit_id, business_date)
);

CREATE TABLE adjustment_suggestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_opname_id uuid NOT NULL UNIQUE REFERENCES stock_opname(id),
  suggested_type adjustment_type NOT NULL,
  suggested_qty numeric(18,3) NOT NULL CHECK (suggested_qty >= 0),
  approved_type adjustment_type,
  approved_qty numeric(18,3),
  status suggestion_status NOT NULL DEFAULT 'PENDING',
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz
);

CREATE TABLE expense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  business_date date NOT NULL,
  category text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  note text,
  posting_status posting_status NOT NULL DEFAULT 'POSTED'
);

CREATE TABLE other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branch(id),
  business_date date NOT NULL,
  category text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  note text,
  posting_status posting_status NOT NULL DEFAULT 'POSTED'
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id uuid REFERENCES branch(id),
  actor_id uuid,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_movement_stock_date_idx ON inventory_movement (stock_unit_id, business_date);
CREATE INDEX sales_meter_reading_branch_date_idx ON sales_meter_reading (branch_id, business_date);
CREATE INDEX stock_layer_active_fifo_idx ON stock_layer (stock_unit_id, received_at, sequence_no) WHERE remaining_qty > 0;
CREATE INDEX audit_log_branch_time_idx ON audit_log (branch_id, occurred_at DESC);

CREATE VIEW daily_stock_view AS
WITH daily AS (
  SELECT
    branch_id,
    stock_unit_id,
    business_date,
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
      PARTITION BY stock_unit_id ORDER BY business_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS closing_qty
  FROM daily
)
SELECT
  branch_id,
  stock_unit_id,
  business_date,
  closing_qty - net_change_qty AS opening_qty,
  COALESCE(supply_qty, 0) AS supply_qty,
  COALESCE(sales_qty, 0) AS sales_qty,
  COALESCE(sales_return_qty, 0) AS sales_return_qty,
  COALESCE(transfer_in_qty, 0) AS transfer_in_qty,
  COALESCE(transfer_out_qty, 0) AS transfer_out_qty,
  COALESCE(gain_qty, 0) AS gain_qty,
  COALESCE(loss_qty, 0) AS loss_qty,
  closing_qty
FROM balanced;

CREATE VIEW meter_reconciliation_view AS
WITH allocated AS (
  SELECT
    sales_meter_reading_id,
    SUM(quantity) AS posted_sales_qty,
    SUM(quantity * unit_selling_price) AS expected_sales_amount
  FROM fifo_allocation
  GROUP BY sales_meter_reading_id
)
SELECT
  reading.id,
  reading.branch_id,
  reading.business_date,
  reading.meter_unit_id,
  meter.name AS meter_unit_name,
  assignment.stock_unit_id,
  stock.name AS stock_unit_name,
  reading.meter_start,
  reading.meter_end,
  reading.meter_reset_offset,
  reading.meter_sales_qty,
  COALESCE(allocated.posted_sales_qty, 0) AS posted_sales_qty,
  COALESCE(allocated.expected_sales_amount, 0) AS expected_sales_amount,
  reading.cash_deposit_amount,
  COALESCE(allocated.posted_sales_qty, 0) - reading.meter_sales_qty AS liter_variance,
  reading.cash_deposit_amount - COALESCE(allocated.expected_sales_amount, 0) AS cash_variance,
  reading.reconciliation_status,
  reading.note,
  reading.created_at
FROM sales_meter_reading reading
JOIN meter_unit meter ON meter.id = reading.meter_unit_id
JOIN meter_stock_assignment assignment
  ON assignment.meter_unit_id = reading.meter_unit_id
  AND assignment.valid_from <= reading.business_date
  AND (assignment.valid_to IS NULL OR assignment.valid_to >= reading.business_date)
JOIN stock_unit stock ON stock.id = assignment.stock_unit_id
LEFT JOIN allocated ON allocated.sales_meter_reading_id = reading.id;
