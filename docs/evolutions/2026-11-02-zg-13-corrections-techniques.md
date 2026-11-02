# 13. Corrections techniques (02/11/2026)

Trois corrections sans changement visible pour les utilisateurs, sauf le bouton « Afficher plus » au bas des listes longues.

## 1. Une base par aperçu

- `organization.is_demo` (migration `0078_demo_flag.sql`) : le script de démo marque ses organisations (club de démo, BPCF (démo), les quatre clubs des tournois).
- `scripts/vercel-build.mjs` : après les migrations et la démo, refus de déployer un aperçu si la base contient une organisation qui n'est pas de démo (son nom apparaît dans le journal du build).
- Une branche Neon par aperçu, par l'intégration Neon de Vercel, depuis une branche `demo` ; `.github/workflows/preview-db.yml` supprime la branche `preview/<branche>` à la fermeture de la PR (secrets `NEON_API_KEY` et `NEON_PROJECT_ID`, sans eux il ne fait rien).
- Offre gratuite de Neon : 10 branches par projet, donc 9 aperçus ouverts à la fois. Repli documenté si ça ne suffit pas.
- Mise en place pas à pas : `docs/APERCUS-VERCEL.md`, section « Une base par aperçu ». Rien n'est activé tant que ces réglages ne sont pas faits ; la vérification `is_demo` est active dès la fusion.

À savoir : si la base partagée actuelle des aperçus contient un club créé à la main pendant des essais, le prochain aperçu s'arrête et donne son nom. Il faut alors supprimer ce club de la base des aperçus, ou passer à une base par aperçu.

## 2. `funding_task` devient `task`

- Migration `0077_task_rename.sql` : `funding_task` → `task`, `funding_task_proof` → `task_proof`, avec leurs contraintes, index, déclencheur et fonction. Aucune ligne ne change.
- Pour une version, les vues `funding_task`, `funding_task_proof` et `org_task` répondent encore (lecture et écriture) pour les déploiements plus anciens. La prochaine migration qui touche aux tâches les supprime.
- Code, tests et scripts utilisent `task`. Le type de notification `funding_task` (une valeur, pas une table) reste inchangé.

## 3. Pagination

Pagination par curseur (`src/lib/cursor.ts`) : une page se termine sur les valeurs de tri de sa dernière ligne, la suivante commence juste après. Côté interface, `useServerList` et `LoadMore` (`src/components/use-api.tsx`) : « Afficher plus », le nombre affiché annoncé aux lecteurs d'écran.

| Liste | Avant | Maintenant |
| --- | --- | --- |
| Calendrier, mois, semaine, jour | 100 événements par période, puis « Page suivante » | la période entière |
| Calendrier, liste de tout | pages de 100 par décalage | pages de 100 par curseur, « Afficher plus » |
| Abonnement au calendrier (ICS) | 1 000 événements | toute la fenêtre (30 jours avant, 1 an après) |
| Opérations (Finances) | 2 000 lignes, filtres dans le navigateur | pages de 100, filtres et recherche sur le serveur ; chiffres, saisons et exports calculés sur toutes les lignes |
| Documents | 300 documents | pages de 100 |
| Journal des droits et journal santé | 500 lignes | pages de 100 |
| Joueurs, contacts | tout, sans limite | inchangé : tri et filtres dans le tableau ; quelques centaines de lignes au plus par club |
| Tâches | 2 000, tâches faites des 90 derniers jours | inchangé : la fenêtre de 90 jours borne déjà la liste |

Limite connue : sur la page Documents, la recherche et les filtres portent sur les documents déjà chargés. La refonte en dossiers (point 10) les fera porter sur le serveur.

## Vérification

- `npx vitest run tests/t13-technical.test.ts tests/vercel-preview.test.ts`
- `npm run test:integration` (dont `tests/integration/t13-technical.integration.ts` : renommage sans perte et anciennes vues, 10 000 opérations et 5 000 événements paginés, totaux justes, deux clubs)
