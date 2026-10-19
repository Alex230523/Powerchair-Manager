# Vague 3 : compétitions et arbitres (19 octobre 2026)

## Matchs (`/matches`, menu Vie du club)

- Un match appartient à une équipe du club : adversaire (club de l'application ou équipe extérieure), domicile ou déplacement, type (championnat, coupe, tournoi, amical), compétition, date et heure de Bruxelles, salle, lien facultatif vers l'événement du calendrier (pour les convocations), statut (prévu, reporté, annulé, joué).
- **Composition** : joueurs convoqués parmi l'équipe, titulaires, poste et numéro.
- **Résultat** : score et, par joueur, minutes, buts, passes décisives, cartons jaunes (2 max.) et rouge. Les buts des joueurs ne peuvent dépasser ceux de l'équipe.
- Bilan par équipe : joués, victoires, nuls, défaites, points (3/1/0), buts pour et contre.
- Droits : responsables des équipes (`teams.manage`) et coachs de l'équipe, avec double authentification. Les autres profils voient les matchs des équipes qu'ils peuvent voir.

## Statistiques

- **Fiche joueur**, vue sportive : matchs joués, titularisations, minutes, buts, passes, cartons et derniers matchs.
- **Fiche coach** : bilan des matchs de ses équipes.

## Arbitres

- **Mon espace arbitre** (`/referee`, profil Arbitre de la fédération) : disponibilités sur les 10 prochains week-ends, désignations à accepter ou refuser, rapport de match après la rencontre (score domicile/visiteurs, incidents). Le score officiel est recopié sur le match du club s'il n'en a pas encore.
- **Désignations** (`/federation/referees`, président ou travailleur fédéral) : matchs de championnat et de coupe des clubs affiliés, avec la disponibilité de chaque arbitre pour le jour du match ; désigner (principal, assistant, table de marque) ou retirer.
- Notifications (nouveau type « Matchs et arbitrage », modèle modifiable) : l'arbitre à sa désignation ou à son retrait, la fédération à la réponse et au rapport, le président du club au rapport.

## Données

Migration `0023_competitions_referees.sql` : `match`, `match_player`, `referee_availability`, `referee_assignment`, `match_report`, nouveau type de notification.

## Démo

- Équipe A : victoire 3-1 contre Liège Lions il y a deux semaines (composition, buts de Camille et Thomas, carton pour Lucas, rapport d'arbitre) et déplacement à Gand Wheels dans 5 jours.
- Nouveau compte `arbitre@demo.pfm` (Jules Verhaegen, arbitre BPCF) : une désignation acceptée avec rapport, une à confirmer, des disponibilités.

## Tests

- `tests/wave3.test.ts` : bilans, totaux par joueur, lecture du rapport côté club, validations, week-ends, traductions.
- `tests/integration/wave3.integration.ts` : composition, résultat, statistiques sur la fiche joueur, droits des coachs, circuit désignation, acceptation, rapport et score officiel, notifications.
