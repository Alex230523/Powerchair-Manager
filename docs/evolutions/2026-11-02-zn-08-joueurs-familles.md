# 8. Joueurs et familles : le représentant dès l'ajout, la vérification de début de saison (02/11/2026)

## Partie 1. Ajouter un joueur avec son représentant

- « Ajouter un joueur » : après la date de naissance, la section « Parent ou responsable légal ».
  - Obligatoire pour un mineur (au moins un).
  - Pour un adulte, la question « Ce joueur a-t-il un représentant légal ou un aidant qui gère son dossier ? » (non par défaut) : jamais imposée à un adulte autonome.
- Un représentant :
  - une personne déjà connue du club (celles du même nom de famille d'abord : le parent d'un frère ou d'une sœur) ou une nouvelle : nom, lien (mère, père, tuteur, administrateur, aidant, autre), email, téléphone, langue ;
  - jusqu'à deux (« Ajouter un second responsable »).
- Droits, avec les règles existantes :
  - responsable légal : lien déclaré, qui devient vérifié quand il accepte l'invitation, puis accès complet jusqu'aux 18 ans ;
  - aidant délégué : voit le dossier jusqu'à la fin de la saison, sans décider.
- Tout s'enregistre en une transaction ; « Inviter maintenant » (coché par défaut) envoie une invitation à chaque représentant qui a une adresse, une seule par personne.
- « N joueurs mineurs sans responsable » : dans la liste des joueurs (avec un filtre pour les afficher) et dans « À faire » de l'accueil.
- À 18 ans, le joueur reçoit une invitation à gérer son propre compte (tâche quotidienne `majorityTick`). L'accès légal du parent s'arrêtait déjà à 18 ans ; le joueur peut ensuite le déléguer.

Limites :
- Pas d'adresse postale (la fiche n'en a pas).
- L'aidant délégué voit tout le dossier en lecture ; un accès limité au calendrier, aux présences, aux documents ou aux cotisations demanderait des droits par partie, qui n'existent pas.
- L'import Excel et l'inscription publique gardent leur fonctionnement (colonnes parent déjà acceptées).

## Partie 2. Vérification de début de saison

- Migration `0081_season_check.sql` : `season_check` (club, saison, délai de 14 jours par défaut) et `season_check_answer` (vérifié, reporté, relancé).
- Ouverte d'elle-même quand une saison commence (tâche quotidienne), ou par le président dans Réglages › Saisons et équipes (« Lancer la vérification »).
- À la connexion, chaque joueur adulte autonome et chaque responsable légal voit « Vos informations sont-elles toujours exactes ? ». Pour chaque personne dont il a la charge :
  - coordonnées, contact d'urgence ;
  - consignes de soin (pour la personne elle-même ou le responsable légal du mineur, qui ont le droit de les voir et de les modifier) ;
  - consentement du nom sur le site, documents qui expirent cette saison.
  - Puis « C'est toujours exact » ou « Modifier » (la fiche).
- « Me le rappeler plus tard » une fois ; après le délai, l'écran revient à chaque connexion. Il ne bloque jamais rien.
- Suivi du club (Réglages › Saisons et équipes) : « Vérifié le … / Pas encore » par joueur, « Relancer » (un email par jour au plus), date dans le journal (`seasonCheck.verified`).

## Vérification

- `npx vitest run tests/t08-families.test.ts`
- `npm run test:integration` (`tests/integration/t08-families.integration.ts` : mineur refusé sans responsable, adulte sans parent, adulte avec administrateur, fratrie, invitation unique, passage à 18 ans, parent de deux enfants, report puis rappel, suivi, deux clubs)
