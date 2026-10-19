-- Technical foundation only. No identity or business schema in lot 00.
CREATE TABLE platform_metadata (
  key text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO platform_metadata (key, value) VALUES ('foundation', 'lot-00');
