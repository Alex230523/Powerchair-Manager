# Mode « bord de terrain » sur téléphone (02/11/2026)

Point 14 de l'avis. Écran `/matches/[id]/terrain`, ouvert par « Ouvrir au bord du terrain » depuis la ligne du match (page Matchs) et la fiche du match, pour ceux qui gèrent l'équipe (coach de l'équipe, rôles avec la gestion des équipes, présidence). Migration `0105_sideline.sql`.

## L'écran

- Une colonne, boutons d'au moins 56 px, contraste renforcé, utilisable à une main en portrait.
- Onglets : Présences (les invités au match ; un tap = présent, boutons « Absent » et « Excusé »), Composition (titulaires, remplaçants, problèmes de licence, de fauteuil et de suspension déjà calculés par la fiche de match), Match (score des deux équipes avec + et -, but avec buteur et passeur, carton jaune ou rouge, remplacement, temps mort, chronomètre facultatif qui date les faits), Fin (récapitulatif, validation du score, photo de la feuille de match).
- Bandeau « Hors connexion : 3 actions en attente » ; « Annuler la dernière action » toujours visible (reprend l'action encore en attente, sinon annule le dernier fait envoyé).
- L'écran reste allumé pendant le match (Wake Lock, quand le navigateur le permet).

## Hors connexion

- Chaque action passe par une file d'attente sur l'appareil (`src/lib/offline-queue.ts`, file « bord de terrain ») et part dans l'ordre dès que le réseau revient ; une action refusée par le serveur (match modifié entre-temps) est signalée par son libellé sans bloquer les suivantes.
- Les données du match (invités, numéros, classifications, composition) sont gardées sur l'appareil pour la journée afin d'ouvrir l'écran sans réseau ; aucune donnée de santé n'y est stockée.

## Serveur

- Faits de match : la passe décisive et le temps mort s'ajoutent (la passe compte dans les statistiques du joueur à la validation).
- Présence du jour (`presence`) écrite sur l'invitation du match, avec son historique ; photo de la feuille de match (`match_sheet_photo`).
- À la fin : validation existante (statistiques, présences, score proposé à l'adversaire, brouillon d'annonce au club).

Limite : la journée de tournoi fédéral garde sa feuille propre (les matchs de tournoi ne sont pas des matchs du club) ; le bord de terrain couvre les matchs du club, amicaux compris.

## Vérification

- `npx vitest run tests/sideline.test.ts` : ordre d'envoi, refus non bloquant, annulation de la dernière action, données gardées, passe et temps mort.
- `npm run test:integration` (`tests/integration/a5-match-journey.integration.ts`) : présences, passe, temps mort, photo, validation sur un état périmé refusée, coach d'une autre équipe refusé.
- `tests/e2e/sideline.spec.ts` à 390 px avec axe : hors connexion puis synchronisé.
