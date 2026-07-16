ALTER TABLE app_user
  ADD COLUMN locale text NOT NULL DEFAULT 'id'
    CHECK (locale IN ('id', 'en', 'zh')),
  ADD COLUMN avatar_object_key text,
  ADD COLUMN avatar_content_type text
    CHECK (avatar_content_type IS NULL OR avatar_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN avatar_size_bytes integer
    CHECK (avatar_size_bytes IS NULL OR avatar_size_bytes BETWEEN 1 AND 512000),
  ADD COLUMN onboarding_completed_at timestamptz;

CREATE TABLE meter_reading_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id uuid NOT NULL REFERENCES sales_meter_reading(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  actor_id uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reading_id, revision_no)
);

CREATE TABLE reconciliation_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id uuid NOT NULL REFERENCES sales_meter_reading(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES reconciliation_comment(id),
  author_id uuid NOT NULL REFERENCES app_user(id),
  message text NOT NULL CHECK (char_length(message) BETWEEN 2 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX meter_reading_revision_reading_idx
  ON meter_reading_revision (reading_id, revision_no DESC);
CREATE INDEX reconciliation_comment_reading_idx
  ON reconciliation_comment (reading_id, created_at);
CREATE INDEX audit_log_actor_time_idx
  ON audit_log (actor_id, occurred_at DESC);
CREATE INDEX audit_log_object_time_idx
  ON audit_log (object_type, object_id, occurred_at DESC);

CREATE FUNCTION reject_immutable_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is an immutable history table', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_event_mutation();
CREATE TRIGGER meter_reading_revision_immutable
  BEFORE UPDATE OR DELETE ON meter_reading_revision
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_event_mutation();
CREATE TRIGGER reconciliation_comment_immutable
  BEFORE UPDATE OR DELETE ON reconciliation_comment
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_event_mutation();
