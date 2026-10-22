# Vague 17, C5 : matchs, tournois, amicaux entre clubs et ligne complète (22 octobre 2026)

Revue du 21 octobre, point C5. La page Matchs devient le point de suivi de tous les matchs du club.

## Matchs de tournoi
La section « Matchs de tournoi » liste d'elle-même les matchs des tournois fédéraux où le club est invité ou inscrit. Les matchs sont groupés par journée : un en-tête avec le tournoi, la journée et la date, puis l'heure, les clubs, la phase et le score.

## Match amical entre clubs
« Nouveau match amical » ouvre une fenêtre avec :
- notre équipe ;
- l'adversaire, choisi parmi les équipes des clubs de la fédération (groupées par club), ou « Autre adversaire » en texte libre ;
- la date et l'heure ;
- le lieu (nos lieux, C4, ou un texte libre) ;
- domicile ou extérieur ;
- un message.

Le match et son événement de calendrier sont créés tout de suite. L'équipe est invitée, avec une réponse demandée, comme le fait le calendrier.

Nouvelle table `match_invitation` (match, club et équipe invités, statut envoyée, acceptée, refusée ou annulée, message, réponse) :
- Le club invité reçoit une notification. Son président, ou une personne qui a le droit calendrier, accepte ou refuse sur la page Matchs.
- Entre deux équipes du même club, l'invitation est acceptée d'office.
- Une fois acceptée, le club invité a son propre match et son propre événement. Les deux matchs sont liés.
- Un refus annule le match du club qui invitait, et ce club est prévenu. Celui-ci peut aussi annuler son invitation.

Score :
- le premier club qui le saisit le propose, chaque côté le voyant de son point de vue ;
- tant qu'il n'est pas confirmé, la ligne affiche « à confirmer » ;
- l'autre club voit « Confirmer le score ». Le club qui l'a proposé ne peut pas le confirmer lui-même.

## Ligne d'un match à venir
- La date, l'horaire et le lieu.
- « Joueurs 7/9 » et « Coachs 2/2 » : les réponses « je viens » sur les invités. Les badges prennent la couleur des seuils de Réglages › Activités. Au survol ou au focus clavier, une petite infobulle grise liste les noms : ceux qui viennent, puis ceux sans réponse. Échap la ferme.
- « Arbitre : Nom Prénom » pour l'arbitre principal désigné, avec une infobulle qui liste tous les arbitres et leur statut. Sinon, « Pas encore désigné ».
- Transport :
  - « En ordre (domicile) » si le lieu est marqué domicile (C4) ;
  - « En ordre » si un déplacement lié a un véhicule avec un conducteur ;
  - sinon « À organiser », avec le bouton « Organiser ».
- « Organiser » crée les tâches de type Transport (O1) à partir du modèle Transport du club, ou du modèle proposé s'il n'en a pas :
  - les échéances sont calculées avant le match ;
  - le responsable est le coach de l'équipe ;
  - les tâches sont liées au match, et la ligne mène ensuite à « Tâches de transport (5) ».

## Données
Migration `0058_match_invitations.sql` (ajouts seulement) :
- sur `match` : lieu, équipe adverse, match lié, état du score (proposé, confirmé) et club qui l'a proposé ;
- table `match_invitation`.

## Tests
- Unitaires (`tests/wave17-matches.test.ts`) :
  - état du transport ;
  - décompte des réponses ;
  - journées de tournoi ;
  - contrôles ;
  - textes en trois langues.
- Intégration (`tests/integration/wave17-matches.integration.ts`) :
  - amical entre deux clubs : invitation, acceptation, apparition chez les deux, événement du club invité ;
  - ligne complète et transport à domicile ;
  - tâches créées depuis le modèle pour le coach ;
  - score proposé puis confirmé, sans que le club qui propose puisse confirmer ;
  - acceptation d'office dans un même club ;
  - matchs de tournoi par journée ;
  - club hors fédération et clubs isolés.
- Bout en bout (`tests/e2e/friendlies.spec.ts`) :
  - invitation puis acceptation ;
  - infobulle au clavier, fermée par Échap ;
  - transport à domicile, puis organisé chez l'autre club ;
  - score à confirmer puis confirmé ;
  - matchs de tournoi ;
  - axe et 390 px.
