-- 06/11/2026 (console, step 7): the tokens the assistant of the console
-- uses, per operator and per day. The conversation itself stays in the
-- browser; nothing of it is kept here.
CREATE TABLE IF NOT EXISTS operator_assistant_usage (
  operator_id text NOT NULL REFERENCES "user"(id),
  day date NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  PRIMARY KEY (operator_id, day)
);
