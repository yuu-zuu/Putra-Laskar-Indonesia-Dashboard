CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE stock_unit
  ADD CONSTRAINT stock_unit_id_branch_unique UNIQUE (id, branch_id);
ALTER TABLE meter_unit
  ADD CONSTRAINT meter_unit_id_branch_unique UNIQUE (id, branch_id);
ALTER TABLE inventory_movement
  ADD CONSTRAINT inventory_movement_stock_branch_fk
  FOREIGN KEY (stock_unit_id, branch_id) REFERENCES stock_unit (id, branch_id);
ALTER TABLE sales_meter_reading
  ADD CONSTRAINT sales_meter_reading_meter_branch_fk
  FOREIGN KEY (meter_unit_id, branch_id) REFERENCES meter_unit (id, branch_id);

ALTER TABLE reconciliation_comment
  ADD CONSTRAINT reconciliation_comment_id_reading_unique UNIQUE (id, reading_id);
ALTER TABLE reconciliation_comment
  ADD CONSTRAINT reconciliation_comment_parent_same_reading_fk
  FOREIGN KEY (parent_id, reading_id)
  REFERENCES reconciliation_comment (id, reading_id);

ALTER TABLE meter_stock_assignment
  ADD CONSTRAINT meter_stock_assignment_no_overlap
  EXCLUDE USING gist (
    meter_unit_id WITH =,
    daterange(valid_from, COALESCE(valid_to + 1, 'infinity'::date), '[)') WITH &&
  );

ALTER TABLE price_rule
  ADD CONSTRAINT price_rule_no_overlap
  EXCLUDE USING gist (
    branch_id WITH =,
    product_id WITH =,
    daterange(valid_from, COALESCE(valid_to + 1, 'infinity'::date), '[)') WITH &&
  );

CREATE INDEX auth_rate_limit_window_idx ON auth_rate_limit (window_started_at);
CREATE INDEX user_session_expiry_idx ON user_session (expires_at);
CREATE INDEX inventory_movement_branch_date_posted_idx
  ON inventory_movement (branch_id, business_date) WHERE posting_status='POSTED';
CREATE INDEX audit_log_request_id_idx ON audit_log (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX audit_log_search_trgm_idx ON audit_log USING gin (
  (object_id || ' ' || COALESCE(reason, '') || ' ' || metadata::text) gin_trgm_ops
);
