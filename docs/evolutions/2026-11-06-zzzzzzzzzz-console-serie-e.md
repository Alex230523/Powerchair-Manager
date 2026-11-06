# Console, série E : connecteur MCP de chaque club, console des pays

Dernière des neuf améliorations demandées le 06/11/2026 pour la console (points 8 et 9 du plan : niveau 3 des connecteurs, multi-pays).

## Le connecteur MCP d'un club (niveau 3)

- Page **Club › Page publique › API**, carte **Connecteur pour votre assistant (MCP)** : la présidence crée une clé `pfmorg_<préfixe>_<secret>` (montrée une fois, dix actives au plus) avec des portées **en lecture seule** : `club:read` (vue du club, équipes, matchs, tournois), `calendar:read` (le calendrier, sans les participants), `dues:read` (les cotisations membre par membre, nommément ; décochée par défaut, la carte le dit). Révocation à tout moment ; journal du club `mcp.key.created` / `mcp.key.revoked`.
- Serveur `POST /api/mcp/org` (Streamable HTTP, sans état, JSON ; GET 405) : jeton Bearer seulement, jamais le cookie. La clé agit **pour l'organisation**, pas à travers la session de la présidence ; elle meurt avec le mandat (`KEY_ORPHANED`), avec la suspension (`ORG_SUSPENDED`) ou la révocation ; 60 appels par minute.
- Outils : `club_overview`, `teams`, `matches(from,to)`, `tournaments`, `calendar(from,to)`, `dues(season, unpaidOnly)`. Tous `readOnlyHint` ; aucune écriture par ce chemin. Les instructions du serveur rappellent que les noms des cotisations servent au suivi du club.
- Console : la fiche d'une organisation compte ses connecteurs actifs.

## La console des pays

- Onglet **Pays** : chaque pays connu (`country`), avec ce qui y vit : fédérations, clubs (et suspendus), joueurs, barèmes, mensuel récurrent, à encaisser, en retard, dossiers internationaux entrants et sortants, dernière activité. Le propriétaire **ajoute un pays** (ISO 3166-1, monnaie ISO 4217) ou le renomme ; journal `country.add` / `country.edit`. Les factures restent en euros.
- Onglet Facturation : filtre **Pays** sur les factures (`?country=`), le pays sur chaque abonnement.

## Migrations

`0137_organization_mcp.sql` (additive, idempotente) : `organization_mcp_key`, `organization_mcp_rate`.

## Permissions

- `mcp/org` : POST 401 sans jeton (la session ne compte pas), GET 405 ; création et révocation des clés : présidence du club (`integrations`, inchangée dans la matrice) ; `console?view=countries` : opérateurs, écriture propriétaire.

## Vérification

- `tests/integration/console-e.integration.ts` (deux clubs : clé de la présidence et pas d'un coach, outils par portée, cotisations nommées seulement avec `dues:read`, clé morte avec le mandat, la suspension et la révocation ; pays, ajout et renommage par le propriétaire seul, facturation filtrée), `tests/international-console.test.ts` (outils, portées, commandes, matrice), e2e (connecteur créé et interrogé à 390 px, cookie refusé, révocation ; onglet Pays et ajout de la Norvège), matrice.
