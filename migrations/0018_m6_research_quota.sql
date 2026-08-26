ALTER TABLE research_runs ADD COLUMN quota_state TEXT NOT NULL DEFAULT 'available'
  CHECK (quota_state IN ('available', 'deferred_quota'));

ALTER TABLE research_runs ADD COLUMN quota_deferred_until TEXT;

ALTER TABLE research_runs ADD COLUMN checkpoint_json TEXT NOT NULL DEFAULT '{"nextStep":0,"completedSubquestionIds":[]}';

CREATE INDEX research_runs_quota_resume
ON research_runs(quota_state, quota_deferred_until, updated_at, id);
