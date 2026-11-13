-- 13/11/2026: « aujourd'hui » est le jour de Bruxelles.
-- CURRENT_DATE, now()::date et les dates des horodatages suivent le fuseau de
-- la session. Il était en UTC : entre minuit et 1 h (2 h en été) à Bruxelles,
-- l'application se croyait encore la veille. Le fuseau par défaut de la base
-- devient Europe/Brussels pour toute nouvelle session (le pooler compris).
-- Les horodatages stockés ne changent pas (timestamptz est un instant).
-- Un rôle sans droit sur la base (rare) garde l'ancien fuseau : la session le
-- règle aussi à la connexion (src/lib/env.ts).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Europe/Brussels');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'timezone: database default unchanged (no privilege), sessions set it themselves';
END
$$;
-- Cette session-ci aussi, pour la suite des migrations.
SET timezone TO 'Europe/Brussels';
