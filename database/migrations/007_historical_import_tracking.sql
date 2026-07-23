CREATE TABLE historical_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  import_name text NOT NULL,
  source_files jsonb NOT NULL,
  start_date date NOT NULL,
  through_date date NOT NULL,
  actor_id uuid NOT NULL REFERENCES app_user(id),
  row_count integer NOT NULL CHECK (row_count >= 0),
  movement_count integer NOT NULL CHECK (movement_count >= 0),
  meter_reading_count integer NOT NULL CHECK (meter_reading_count >= 0),
  stock_opname_count integer NOT NULL CHECK (stock_opname_count >= 0),
  cost_mode text NOT NULL CHECK (cost_mode IN ('SCHEDULED', 'UNCOSTED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CHECK (through_date >= start_date)
);

CREATE TABLE historical_import_item (
  batch_id uuid NOT NULL REFERENCES historical_import_batch(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('ROW', 'MOVEMENT', 'METER_READING', 'STOCK_OPNAME', 'STOCK_LAYER')),
  object_id text,
  source_file text NOT NULL,
  source_sheet text NOT NULL,
  source_row integer NOT NULL CHECK (source_row > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, item_key)
);

CREATE INDEX historical_import_batch_applied_idx
  ON historical_import_batch (applied_at DESC);

CREATE INDEX historical_import_item_source_idx
  ON historical_import_item (source_file, source_sheet, source_row);
