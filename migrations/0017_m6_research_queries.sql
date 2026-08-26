CREATE TABLE research_queries (
  id TEXT PRIMARY KEY,
  research_run_id TEXT NOT NULL REFERENCES research_runs(id),
  subquestion_id TEXT NOT NULL,
  query TEXT NOT NULL,
  result_ids_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX research_queries_run_page
ON research_queries(research_run_id, created_at ASC, id ASC);
