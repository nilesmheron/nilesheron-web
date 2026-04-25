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
