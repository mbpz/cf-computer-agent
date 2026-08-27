ALTER TABLE site_visit_events ADD COLUMN ip_display TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE site_visit_events ADD COLUMN country TEXT;
ALTER TABLE site_visit_events ADD COLUMN region TEXT;
ALTER TABLE site_visit_events ADD COLUMN city TEXT;
ALTER TABLE site_visit_events ADD COLUMN colo TEXT;
ALTER TABLE site_visit_events ADD COLUMN user_agent TEXT;

CREATE INDEX site_visit_region_day
ON site_visit_events(country, region, day, created_at DESC);

CREATE INDEX site_visit_member_time
ON site_visit_events(member_id, created_at DESC);
