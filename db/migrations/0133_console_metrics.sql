-- 06/11/2026 (console, series A): the figures of the platform kept day by
-- day, the operators' daily alert and its log, and the monthly report
-- archived as a PDF.
CREATE TABLE IF NOT EXISTS platform_metric_daily (
  day date NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 2 AND 60),
  value bigint NOT NULL,
  PRIMARY KEY (day, key)
);
CREATE INDEX IF NOT EXISTS platform_metric_key ON platform_metric_daily(key, day DESC);
CREATE TABLE IF NOT EXISTS platform_alert_pref (
  operator_id text PRIMARY KEY REFERENCES "user"(id),
  email boolean NOT NULL DEFAULT true,
  -- The local hour (Europe/Brussels) from which the day's alert may leave.
  hour integer NOT NULL DEFAULT 7 CHECK (hour BETWEEN 0 AND 23),
  rules text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_alert_log (
  operator_id text NOT NULL REFERENCES "user"(id),
  day date NOT NULL,
  items jsonb NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, day)
);
CREATE TABLE IF NOT EXISTS platform_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb NOT NULL,
  pdf bytea NOT NULL
);
