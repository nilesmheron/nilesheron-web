-- Verse and Hook intake tables
-- Run against Supabase project xszhfxzfybubdlivbfxp via SQL editor

CREATE TABLE vh_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  extraction_goal TEXT NOT NULL CHECK (extraction_goal IN ('discovery', 'intake', 'feedback')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vh_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES vh_clients(id),
  respondent_name TEXT NOT NULL,
  respondent_title TEXT NOT NULL,
  respondent_email TEXT NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vh_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES vh_clients(id),
  triggered_by_response_id UUID REFERENCES vh_responses(id),
  scores JSONB,
  narrative TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX vh_responses_client_id_idx ON vh_responses(client_id);
CREATE INDEX vh_analysis_client_id_created_idx ON vh_analysis(client_id, created_at DESC);
CREATE INDEX vh_analysis_triggered_by_response_id_idx ON vh_analysis(triggered_by_response_id);

-- Disable RLS — auth is enforced at the API route layer
ALTER TABLE vh_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE vh_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE vh_analysis DISABLE ROW LEVEL SECURITY;

-- Goal configurations (interview prompts and scoring dimensions, editable from admin)
CREATE TABLE IF NOT EXISTS vh_goal_configs (
  goal_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  intake_system_prompt TEXT NOT NULL,
  opener_message TEXT NOT NULL,
  analysis_system_prompt TEXT NOT NULL,
  scoring_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vh_goal_configs DISABLE ROW LEVEL SECURITY;

-- ====== Multi-user auth (added 2026-05-05) ======
-- Applied via Supabase MCP apply_migration. vh_events already existed in the DB
-- (created earlier, UUID PK instead of BIGSERIAL); that table was skipped here.

-- 1. Users
CREATE TABLE vh_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,30}$'),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  disabled_at TIMESTAMPTZ
);
ALTER TABLE vh_users DISABLE ROW LEVEL SECURITY;

-- 2. Ownership column on vh_clients (NULL = pre-auth legacy; admin/superadmin only)
ALTER TABLE vh_clients ADD COLUMN created_by UUID REFERENCES vh_users(id);
CREATE INDEX vh_clients_created_by_idx ON vh_clients(created_by);

-- 3. Per-session sharing
CREATE TABLE vh_session_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES vh_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES vh_users(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('view','edit')),
  granted_by UUID REFERENCES vh_users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, user_id)
);
CREATE INDEX vh_session_shares_user_idx ON vh_session_shares(user_id);
CREATE INDEX vh_session_shares_client_idx ON vh_session_shares(client_id);
ALTER TABLE vh_session_shares DISABLE ROW LEVEL SECURITY;

-- 4. vh_events — already existed; reproduced here for documentation (not re-run)
-- CREATE TABLE vh_events (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   event_name TEXT NOT NULL,
--   token TEXT,
--   client_id UUID REFERENCES vh_clients(id),
--   meta JSONB,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );
-- CREATE INDEX vh_events_client_id_created_idx ON vh_events(client_id, created_at DESC);
-- ALTER TABLE vh_events DISABLE ROW LEVEL SECURITY;

-- 5. Drop the hardcoded extraction_goal CHECK; vh-session.js regex is the new gate
ALTER TABLE vh_clients DROP CONSTRAINT IF EXISTS vh_clients_extraction_goal_check;
