-- Aggregates survive cleanup; temporary identifiers only deduplicate the current day.
CREATE TABLE metrics (
  day TEXT NOT NULL,
  dimension TEXT NOT NULL,
  label TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dimension, label)
);
CREATE TABLE daily_salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL);
CREATE TABLE visitors (
  day TEXT NOT NULL,
  id TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (day, id)
);
CREATE INDEX visitors_last_seen ON visitors(last_seen);
CREATE TABLE page_visitors (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (day, path, id)
);
