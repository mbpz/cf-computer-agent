CREATE TABLE research_runs (
  id TEXT PRIMARY KEY,
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX research_runs_owner_page
ON research_runs(owner_member_id, updated_at DESC, id DESC);

CREATE TABLE research_reports (
  id TEXT PRIMARY KEY,
  research_run_id TEXT NOT NULL REFERENCES research_runs(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  title TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  source_snapshots_json TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(research_run_id, version)
);

CREATE INDEX research_reports_run_page
ON research_reports(research_run_id, version DESC, id DESC);
