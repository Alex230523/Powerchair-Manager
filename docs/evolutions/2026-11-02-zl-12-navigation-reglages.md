# 12. Navigation : « Gestion du club » et « Plus » rangés dans Réglages (02/11/2026)

Règle : dans le menu, ce qu'on utilise chaque semaine ; dans Réglages, ce qu'on configure une fois par saison.

## Menu

- Plus de groupe « Plus ». Une seule entrée « Réglages », en bas du menu de gauche, pour tous les profils (`settingsItem`, rendu par la barre latérale après les groupes).
- Menu du président : Équipes, Activités, Communication, Finances, Club (page publique, Matériel, Incidents, Contacts, Tâches), puis Réglages.
- Raccourci « Réglages du club » sur l'accueil du président.

## Réglages

| Bloc | Avant | Maintenant |
| --- | --- | --- |
| Données personnelles du club (doublons, demandes RGPD, conservation, historique) | page `/privacy` | Réglages › Données personnelles (audit.read ou mandates.manage) |
| Mes données (export JSON, rectification) | n'existait pas | Réglages › Données personnelles, pour chacun (`GET /api/privacy/mine`) |
| Identité du club, modules | Réglages › Club | inchangé |
| Transmission de la présidence | Réglages › Membres | Réglages › Club |
| Membres, invitations, mandats, droits | Réglages › Membres | inchangé |
| Saisons, équipes, coachs par équipe | « Gestion du club » | Réglages › Saisons et équipes |
| Passage de saison | `/club/rollover` | lien depuis Réglages › Saisons et équipes |
| Couleurs des équipes | « Gestion du club » | page Équipes |

- La grande carte « l'identité a déménagé » disparaît.
- `/privacy` redirige vers `/fr/settings/data`, `/club/manage` vers `/fr/settings/club`.
- La recherche des réglages et Ctrl+K trouvent chaque bloc sous son nom (« Mes données », « Données personnelles du club », « Saisons et équipes », « Passage de saison », « Transmission de la présidence »).
- Les liens internes suivent : configuration du club, chiffre « Équipes » de l'accueil, retour du passage de saison, avis de classification.

« Mes données » : le compte, les préférences, les fiches de la personne dans chaque club, les personnes qu'elle représente et ses mandats. Jamais les données d'une autre personne ni les données de santé (le club les exporte sur demande, avec son droit).

## Vérification

- `npx vitest run tests/t12-navigation.test.ts tests/wave14.test.ts tests/wave15-settings.test.ts`
- `npm run test:integration` (`tests/integration/t12-navigation.integration.ts`)
- Playwright : `shell`, `new-pages`, `settings` (redirections), `undo`, `player-sheet` mis à jour.
