# Point 6 : sélection nationale

## Périmètre

- Page `/federation/national` (présidence fédérale et responsables des compétitions, permission `federation.competitions`) : équipes nationales par catégorie et saison, règle « PF2 au plus », staff (coach d'un club de la fédération avec ses formations, ou compte de la fédération).
- Composition parmi les joueurs licenciés des clubs de la fédération, filtres club, classification, catégorie d'âge, licence valide. Seules les données sportives sont visibles.
- Trois niveaux : présélectionné, sélectionné, remplaçant (et retiré). Chaque changement prévient le joueur (ou les parents), la présidence et les coachs du club.
- Sur la fiche du joueur : carte « Sélection nationale », le joueur ou le parent répond disponible ou non, répond aux rassemblements.
- Consignes de soins : partagées avec le staff national uniquement par un consentement séparé, révocable et limité à une période.
- Rassemblements (stage, entraînement, match) visibles dans le calendrier du joueur.
- Tournoi international : inscription de l'équipe nationale, ou d'une équipe étrangère en texte libre (organisation de type `guest`, sans membre ni rôle), composition et statistiques par match.
- Palmarès : un résultat international entre au Hall of fame de la fédération et est cité sur la fiche des joueurs.
- Rapport annuel de la fédération : nombre de joueurs en équipe nationale.

## Migration

`0111_national_teams.sql` (additive, idempotente).

## Limites connues

- Le badge « international » dans l'annuaire du club n'est pas encore affiché.
- Pas d'import des feuilles de match des tournois externes.

## Vérification

- `tsx tests/national6.test.ts`
- `vitest tests/integration/national6.integration.ts` (deux clubs, consentement, refus hors fédération)
- `playwright test tests/e2e/national.spec.ts` (axe, 390 px)
