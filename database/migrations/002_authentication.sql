CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'OPERATOR', 'FINANCE', 'AUDITOR');

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'OPERATOR',
  branch_id uuid REFERENCES branch(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  user_agent text,
  ip_address inet
);

CREATE TABLE auth_rate_limit (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0)
);

CREATE INDEX user_session_active_idx ON user_session (token_hash, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX user_session_user_idx ON user_session (user_id, created_at DESC);
CREATE INDEX app_user_branch_idx ON app_user (branch_id) WHERE active = true;
