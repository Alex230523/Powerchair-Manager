-- The club's palette and background tint (prompt 2.9). Night blue and the light tint stay the default.
ALTER TABLE organization
  ADD COLUMN theme_palette text NOT NULL DEFAULT 'night' CHECK(theme_palette IN ('night','bordeaux','aubergine','brown')),
  ADD COLUMN theme_tint text NOT NULL DEFAULT 'light' CHECK(theme_tint IN ('neutral','light','strong'));
