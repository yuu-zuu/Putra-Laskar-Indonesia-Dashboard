ALTER TABLE app_user ADD COLUMN employee_id text;
UPDATE app_user SET employee_id = 'EMP-' || upper(substr(replace(id::text, '-', ''), 1, 8));
ALTER TABLE app_user ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE app_user ADD CONSTRAINT app_user_employee_id_unique UNIQUE (employee_id);
ALTER TABLE app_user ADD CONSTRAINT app_user_employee_id_format
  CHECK (employee_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$');

CREATE TYPE broadcast_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TABLE system_broadcast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branch(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 3 AND 1000),
  severity broadcast_severity NOT NULL DEFAULT 'INFO',
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX system_broadcast_active_idx ON system_broadcast (branch_id, starts_at DESC)
  WHERE active = true;
