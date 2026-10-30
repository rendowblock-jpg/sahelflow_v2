-- Fixed-window counters for the phone-facing routes (see rate-limit.ts).
-- subject is a hash for IP addresses and pairing ids, the workspace:device pair
-- for devices. Rows older than 10 minutes are deleted by the worker itself.
CREATE TABLE IF NOT EXISTS connected_rate_limit (
  bucket TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  PRIMARY KEY(bucket, subject, window_start)
);

CREATE INDEX IF NOT EXISTS connected_rate_limit_window_idx
  ON connected_rate_limit(window_start);
