-- Security (07/11/2026), missing rate limiting: one counter per bucket, key
-- and window (src/lib/rate-limit.ts). The key is an account id, or the hash
-- of a network address (never the address itself). Rows older than a day are
-- dropped as the counters are used.
CREATE TABLE IF NOT EXISTS rate_counter (
  bucket text NOT NULL CHECK (bucket ~ '^[a-z:-]{3,40}$'),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 100),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_counter_window ON rate_counter (window_start);
