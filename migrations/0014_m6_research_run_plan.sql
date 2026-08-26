ALTER TABLE research_runs ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{"spaceIds":[],"collectionIds":[],"knowledgeItemIds":[]}';
ALTER TABLE research_runs ADD COLUMN completion_json TEXT NOT NULL DEFAULT '[]';
