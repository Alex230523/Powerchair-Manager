# Joueur : « Mon suivi » (02/11/2026)

Point 31 de l'avis. Nouvel onglet de la fiche du joueur (`/players/[id]`) : « Mon suivi » pour le joueur et ses parents, « Suivi » pour ses coachs et la présidence. Migration `0107_player_progress.sql`.

## Chiffres de la saison

- Présence aux entraînements et aux matchs : taux sur les séances dont la présence a été notée le jour même (présent, en retard, parti plus tôt comptent comme présents), et série en cours.
- Matchs joués, temps de jeu, buts, passes décisives, cartons (matchs validés).
- Tableau avec la saison précédente et l'écart. Aucun classement entre joueurs, aucune donnée d'un autre joueur.

## Objectifs

- `player_goal` : 1 à 5 objectifs par joueur et par période (la saison par défaut, ou une période nommée par le coach), domaine (technique, conduite du fauteuil, tactique, comportement, autre), échelle « À travailler », « En progrès », « Acquis » (date d'acquisition gardée).
- Le joueur ou son parent propose un objectif ; le coach le retient ou non. Un sixième objectif sur la période est refusé (`TOO_MANY_GOALS`).

## Retours et notes

- `player_feedback` : retours courts et datés, liés si besoin à un entraînement ou un match récent du joueur, lus par le joueur et ses parents ; le joueur (ou son parent) répond « Vu » et une réaction courte (280 caractères).
- Notification (application et email, catégorie sport) au joueur pour chaque nouveau retour, ou à ses responsables s'il n'a pas de compte ; le lien ouvre directement l'onglet (`?tab=progress`).
- `player_coach_note` : notes privées du coach dans une table séparée, lues seulement par les coachs actuels du joueur ; jamais renvoyées au joueur, à ses parents ni à la présidence.

## Droits

- Lecture : le joueur, ses responsables (lien de responsabilité actif et autorisé), ses coachs actuels (coach ou adjoint d'une équipe active où il joue), la présidence du club.
- Écriture : ses coachs actuels seulement. Un ancien coach, un autre joueur, un autre club n'ont aucun accès. La bourse aux transferts garde ses seules statistiques.

## Vérification

- `npx vitest run tests/progress31.test.ts` : taux, série, comparaison, commandes, textes, onglet.
- `npm run test:integration` (`tests/integration/progress31.integration.ts`) : objectif créé puis acquis, limite de cinq, proposition du joueur, chiffres contre la saison précédente, retour notifié, vu et commenté, note privée invisible du joueur et du parent, parent qui lit, présidence en lecture, ancien coach, autre joueur et autre club refusés.
- `tests/e2e/progress.spec.ts` avec axe, à 390 px pour le parent.
