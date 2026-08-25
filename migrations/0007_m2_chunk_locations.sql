-- M2 location metadata is additive and intentionally optional for legacy rows.
ALTER TABLE chunks ADD COLUMN location_json TEXT NOT NULL DEFAULT '{}';
