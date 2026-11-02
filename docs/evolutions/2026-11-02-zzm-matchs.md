# Matchs : une seule ligne, cartes d'équipe, statistiques par équipe (02/11/2026)

Point 5 de l'avis. Pas de nouvelle donnée.

## Une seule ligne de match

- Composant `MatchRow` (`src/components/match-row.tsx`) utilisé partout : matchs du club, matchs de tournoi fédéral, amicaux, fiche d'équipe, fiche joueur (et face-à-face).
- À gauche la date et l'heure ; au centre la pastille de couleur et le nom de notre équipe, le score ou « - », l'adversaire ; un badge de contexte (tournoi avec lien, journée et phase, « Match amical », « Championnat », « Coupe »).
- À venir : lieu, « Joueurs 7/9 » et « Coachs 2/2 » avec les noms en infobulle, arbitre, transport (ligne C5 existante).
- Joué : score en gras et pastille V, N ou D (couleur succès, neutre ou danger), lue « Victoire 3 à 1 » ; « à confirmer » tant que l'autre club n'a pas confirmé. Lignes séparées par une bordure et un fond alterné.

## Haut de page et filtres

- Une carte par équipe, bordée de sa couleur : nom, J / V / N / D, buts pour et contre, forme des 5 derniers matchs (pastilles à lettre), prochain match. La carte mène à Statistiques › Jeu filtré sur l'équipe (`/statistics/game?team=…`), chaque chiffre à sa section.
- Filtres : À venir / Joués / Tous, compétition, équipe de la barre du haut. Un seul bouton « Nouveau match ».

## Statistiques et fiche de match

- Statistiques › Jeu : « Toutes les équipes » puis un onglet par équipe, chacun avec son adresse ; en vue équipe, le bilan contre chaque adversaire et les buts par match.
- Fiche d'un match à venir : encadré « Face-à-face » avec les derniers résultats contre cet adversaire.
- Un score proposé par l'autre club et pas encore confirmé n'entre plus dans les statistiques, la forme ni le bilan.

## Vérification

- `npx vitest run tests/match-row.test.tsx`
- `npm run test:integration` (`tests/integration/wave16-game.integration.ts`) : score non confirmé hors statistiques, carte d'équipe (couleur, forme, prochain match), coach limité à ses équipes.
- `tests/e2e/matches5.spec.ts` à 1440 et 390 px avec axe ; `friendlies.spec.ts` adapté à la liste.
