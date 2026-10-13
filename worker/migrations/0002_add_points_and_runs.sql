-- What the game's leaderboard needs on top of the original table.
-- Rows that existed before this migration get points = 0 and incidents = 0.

ALTER TABLE scores ADD COLUMN points    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN incidents INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS scores_by_rank ON scores (points DESC, time_ms ASC);

-- One single-use ticket per round; rows older than an hour are swept when new tickets are issued.
CREATE TABLE IF NOT EXISTS runs (
  token      TEXT    PRIMARY KEY,
  created_at INTEGER NOT NULL
);
