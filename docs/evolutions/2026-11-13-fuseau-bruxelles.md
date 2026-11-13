# « Aujourd'hui » est le jour de Bruxelles

Relevé de la vérification générale du 13/11/2026, correction validée le jour même.

## Le problème

Environ 240 requêtes prenaient la date du serveur de base de données (`CURRENT_DATE`, `now()::date`), réglé en UTC. Entre minuit et 1 h (2 h en été) à Bruxelles, l'application se croyait encore la veille : un contact noté « aujourd'hui » était daté d'hier, une échéance du jour n'était pas encore échue, la semaine du calendrier commençait le lundi à 1 h. Quelques écrans prenaient aussi la date UTC du navigateur. C'était la cause des tests qui échouaient quand la CI tournait entre 23 h et minuit UTC.

## La correction

- Migration `0148_timezone_brussels.sql` : le fuseau par défaut de la base devient Europe/Brussels pour toute nouvelle session (y compris derrière le pooler de Neon). Si le rôle n'a pas le droit de modifier la base, la migration le signale sans échouer.
- `src/lib/env.ts` : chaque session de l'application règle aussi `SET TIME ZONE 'Europe/Brussels'` à la connexion, comme les délais de requête.
- `src/lib/today.ts` : `brusselsDay()` remplace `new Date().toISOString().slice(0, 10)` (jour UTC) dans le code serveur et les écrans ; un test refuse son retour.
- Les tests prennent le même « aujourd'hui » que l'application.

Les horodatages enregistrés ne changent pas : un `timestamptz` est un instant, seul son affichage en texte et sa date suivent le fuseau.

## Plus tard

Quand des clubs des Pays-Bas, de France, du Royaume-Uni ou des États-Unis arriveront, le fuseau deviendra une propriété du club (voir `architecture-multi-pays`) : Bruxelles reste le défaut.

## Tests

- `tests/timezone.test.ts` : le jour de Bruxelles autour de minuit, hiver et été ; la session réglée ; aucun jour UTC pris pour « aujourd'hui ».
- `tests/integration/timezone.integration.ts` : une nouvelle session est en Europe/Brussels, `CURRENT_DATE` est le jour de Bruxelles, une session de l'application l'est même sur une base restée en UTC, un instant reste un instant.
