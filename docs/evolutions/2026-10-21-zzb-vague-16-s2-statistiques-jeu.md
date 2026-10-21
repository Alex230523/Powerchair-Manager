# Vague 16, S2 : statistiques de jeu (21 octobre 2026)

Revue du 21 octobre au soir, point S2 (proposition de Claude) : l'onglet « Jeu » de la page Statistiques, `/[locale]/statistics/game`, à côté de l'onglet « Club » (S1). Aucune nouvelle table : il lit ce que le module Matchs contient déjà (`match` : scores, type de compétition, adversaire ; `match_player` : titulaire, minutes, buts, passes, cartons).

## Règles communes avec S1
Saison et équipe de la barre du haut, pas de barre de filtres, un menu « ... » par carte (période gardée dans l'adresse, CSV, et pour les graphiques les données et le PNG). Seuls les matchs joués comptent : un match annulé, reporté ou à venir n'entre jamais dans les chiffres, ni ses compositions.

## Cartes
- Tuiles : matchs joués, victoires (nombre et pourcentage), buts marqués, buts encaissés, différence de buts.
- « Bilan par équipe » : tableau triable (tri gardé dans l'adresse, `sort-teams`), J, V, N, D, buts pour, buts contre, différence, et « Forme » : les 5 derniers résultats en pastilles avec la lettre visible (V, N, D), lues en toutes lettres par les lecteurs d'écran.
- « Buts par match » : barres dans l'ordre chronologique, buts marqués au-dessus de l'axe dans la couleur de l'équipe, encaissés en dessous ; la légende masque une équipe ou les buts encaissés.
- « Meilleurs buteurs » et « Meilleurs passeurs » : top 10, équipe, total, moyenne par match joué, lien vers la fiche du joueur.
- « Temps de jeu » : minutes par joueur en barres horizontales, avec le nombre de titularisations.
- « Discipline » : cartons jaunes et rouges par joueur et par équipe.
- « Par compétition » : championnat, coupe, tournoi, amical (choix segmenté), avec la forme.
- « Bilan contre chaque adversaire » : tableau triable, J, V, N, D, buts (un adversaire écrit avec des espaces en trop compte une fois).
- « Tournois » : places obtenues par saison (`trip.final_rank`, déplacements de type tournoi non annulés), médaille et place en toutes lettres, badge « Au Hall of fame », lien vers le Hall of fame.
- L'anneau d'une équipe dans l'onglet Club mène maintenant à l'onglet Jeu filtré sur elle.

## Droits
Le président et les personnes qui lisent l'annuaire voient tout ; un coach voit ses équipes (les statistiques s'ouvrent à tous les coachs, limités à leurs équipes, dans les deux onglets ; l'entrée du menu suit) ; une autre équipe demandée par l'adresse retombe sur les siennes. Un joueur ou un parent n'a pas cet onglet : ses chiffres restent sur sa fiche (déjà en place).

## Tests
- Unitaires : `tests/wave16-game.test.ts` (résultat, forme, différence, moyennes, classement des buteurs).
- Intégration à deux clubs : `tests/integration/wave16-game.integration.ts` (matchs non joués jamais comptés, tuiles, bilan et forme, joueurs, compétitions, adversaires, tournois, coach limité à son équipe, parent refusé).
- Bout en bout : `tests/e2e/statistics-game.spec.ts` (onglets, tuiles, pastilles avec lettres, tri, buts par match, buteur et lien, temps de jeu, compétitions, équipe de la barre du haut, axe en clair et en sombre, 390 px).
