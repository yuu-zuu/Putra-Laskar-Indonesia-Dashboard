ALTER TABLE stock_layer
  ADD COLUMN cost_status text NOT NULL DEFAULT 'FINAL'
    CHECK (cost_status IN ('PENDING', 'FINAL')),
  ADD COLUMN cost_completed_at timestamptz,
  ADD COLUMN cost_completed_by uuid REFERENCES app_user(id);

UPDATE stock_layer
SET cost_status = 'PENDING'
WHERE source_type IN ('HISTORICAL_IMPORT', 'HISTORICAL_FIFO_DEFICIT')
  AND unit_cost = 0;

CREATE OR REPLACE FUNCTION mark_historical_zero_cost_pending()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_type IN ('HISTORICAL_IMPORT', 'HISTORICAL_FIFO_DEFICIT')
     AND NEW.unit_cost = 0 THEN
    NEW.cost_status := 'PENDING';
    NEW.cost_completed_at := NULL;
    NEW.cost_completed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_layer_historical_cost_status_trigger
BEFORE INSERT ON stock_layer
FOR EACH ROW EXECUTE FUNCTION mark_historical_zero_cost_pending();

CREATE TABLE stock_layer_cost_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_layer_id uuid NOT NULL REFERENCES stock_layer(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  before_unit_cost numeric(18,2) NOT NULL CHECK (before_unit_cost >= 0),
  after_unit_cost numeric(18,2) NOT NULL CHECK (after_unit_cost >= 0),
  before_cost_status text NOT NULL CHECK (before_cost_status IN ('PENDING', 'FINAL')),
  after_cost_status text NOT NULL CHECK (after_cost_status IN ('PENDING', 'FINAL')),
  allocated_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK (allocated_qty >= 0),
  cogs_delta numeric(18,2) NOT NULL DEFAULT 0,
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  actor_id uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_layer_id, revision_no)
);

CREATE INDEX stock_layer_cost_revision_layer_idx
  ON stock_layer_cost_revision (stock_layer_id, revision_no DESC);

CREATE OR REPLACE FUNCTION reject_stock_layer_cost_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock_layer_cost_revision is immutable';
END;
$$;

CREATE TRIGGER stock_layer_cost_revision_immutable_update
BEFORE UPDATE ON stock_layer_cost_revision
FOR EACH ROW EXECUTE FUNCTION reject_stock_layer_cost_revision_mutation();

CREATE TRIGGER stock_layer_cost_revision_immutable_delete
BEFORE DELETE ON stock_layer_cost_revision
FOR EACH ROW EXECUTE FUNCTION reject_stock_layer_cost_revision_mutation();

CREATE TABLE historical_source_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_fingerprint text NOT NULL,
  row_key text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branch(id),
  stock_unit_id uuid NOT NULL REFERENCES stock_unit(id),
  meter_unit_id uuid REFERENCES meter_unit(id),
  business_date date NOT NULL,
  shift_code text NOT NULL DEFAULT 'DAILY',
  source_status text NOT NULL
    CHECK (source_status IN ('INCOMPLETE_SOURCE', 'FUTURE_TEMPLATE', 'READY', 'RESOLVED', 'IGNORED')),
  blocking_reasons text[] NOT NULL DEFAULT '{}',
  raw_data jsonb NOT NULL,
  source_formulas jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_file text NOT NULL,
  source_sheet text NOT NULL,
  source_row integer NOT NULL CHECK (source_row > 0),
  linked_meter_reading_id uuid REFERENCES sales_meter_reading(id),
  resolution_note text,
  resolved_by uuid REFERENCES app_user(id),
  resolved_at timestamptz,
  staged_by uuid NOT NULL REFERENCES app_user(id),
  staged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_fingerprint, row_key)
);

CREATE INDEX historical_source_row_status_date_idx
  ON historical_source_row (source_status, business_date, branch_id);

CREATE INDEX historical_source_row_source_idx
  ON historical_source_row (source_file, source_sheet, source_row);

CREATE VIEW pending_stock_layer_cost_view AS
SELECT
  layer.id AS stock_layer_id,
  branch.id AS branch_id,
  branch.code AS branch_code,
  branch.name AS branch_name,
  stock.id AS stock_unit_id,
  stock.code AS stock_unit_code,
  stock.name AS stock_unit_name,
  product.code AS product_code,
  product.name AS product_name,
  layer.received_at,
  layer.initial_qty,
  layer.remaining_qty,
  layer.unit_cost,
  layer.unit_selling_price,
  layer.cost_status,
  layer.source_type,
  layer.source_id,
  COALESCE(SUM(allocation.quantity), 0)::numeric(18,3) AS allocated_qty,
  COUNT(DISTINCT allocation.sales_meter_reading_id)::integer AS affected_reading_count
FROM stock_layer layer
JOIN stock_unit stock ON stock.id = layer.stock_unit_id
JOIN branch ON branch.id = stock.branch_id
JOIN product ON product.id = stock.product_id
LEFT JOIN fifo_allocation allocation ON allocation.stock_layer_id = layer.id
GROUP BY
  layer.id,
  branch.id,
  stock.id,
  product.id;
