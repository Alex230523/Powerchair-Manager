# Sécurité : audit d'injection SQL

Audit du 06/11/2026 : une valeur tapée par quelqu'un peut-elle se retrouver dans le texte d'une requête et la détourner ?

## Résultat

**Aucune injection exploitable.** Toutes les valeurs venues d'une requête (commandes, formulaires, recherches, adresses, outils MCP et assistant) arrivent à PostgreSQL comme paramètres (`$1`, `$2`…) du pilote `pg`, jamais dans le texte SQL.

## Ce qui a été examiné

- **Les ~300 interpolations** `${…}` dans des requêtes (114 expressions distinctes) : fragments SQL constants (`eventSelect`, `presidentRole`…), noms de tables ou de colonnes tirés d'une liste figée ou du catalogue de la base (`information_schema`, entouré de guillemets par `ident()`), choix entre deux littéraux (`lock ? "FOR UPDATE" : ""`), constantes numériques (`PAGE_SIZE + 1`, `horizonDays`).
- **Les 66 requêtes passées par variable** ou construites par concaténation : toutes des fragments constants complétés par des littéraux.
- **Le SQL dynamique côté base** : les quatre `EXECUTE` des migrations passent par `format('%I', '%L')`.
- **Les chemins JSON**, les `SET`, les intervalles, la recherche plein texte : aucun ne prend de saisie.
- **Les recherches `LIKE`/`ILIKE`** : toutes paramétrées.

## Durcissements

- **Signature des procès-verbaux d'assemblée** : le nom de la colonne (`signed_president_…` ou `signed_secretary_…`) était construit à partir du rôle de la commande. Le schéma Zod ne laissait passer que deux valeurs, donc rien n'était injectable, mais la sûreté dépendait d'un autre fichier. La requête vient maintenant d'une table de correspondance figée.
- **Jokers des recherches** : dans la recherche des organisations et des tickets de la console et dans celle du registre des classifications, un `%` ou un `_` tapé gardait son sens de joker (« 50% » trouvait tout). `escapeLike()` (`src/lib/sql.ts`) les échappe, comme le faisaient déjà le grand livre, le guide et les contacts.

## Garde-fou automatique

`tests/sql-safety.test.ts` lit tout le code à chaque exécution des tests et échoue si :
- une interpolation dans une requête touche une valeur de la requête (`cmd`, `command`, `input`, `body`, `q`, `search`, `params`…), sauf un choix entre deux littéraux ;
- une requête est concaténée avec une telle valeur ;
- une migration fait un `EXECUTE` sans `format()` ;
- une recherche `ILIKE '%'||$n||'%'` ne passe pas sa valeur par `escapeLike()`.

Vérifié en plantant une requête vulnérable : les deux formes sont attrapées.

## Vérification

- `tests/integration/secu-sqli.integration.ts` : neuf charges classiques (`' OR '1'='1`, `'; DROP TABLE …`, `pg_sleep`, `%`, `_`, `$1`…) envoyées comme nom de club, message de support et recherche (console, support, registre, grand livre) : stockées et cherchées comme du texte, aucune ligne ne bouge, aucune attente anormale.
- `tests/sql-safety.test.ts`.
