-- The scores table as it was first created by hand in the Cloudflare dashboard.
-- It already exists on the live database, so this is a no-op there.
-- Apply migrations with: npm run migrate   (from the worker/ folder)

CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT    NOT NULL,
  time_ms     INTEGER NOT NULL,
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);
