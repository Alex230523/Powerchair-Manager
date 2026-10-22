# Vague 17, J1 : anciens joueurs et fiche en fenêtre (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point J1.

## Situation actuelle des anciens joueurs
- La liste des anciens joueurs (et des anciens coachs) gagne une colonne « Situation actuelle », calculée dans cet ordre :
  1. « In memoriam » pour une personne décédée ;
  2. « Joue à [club], [équipe] » si la personne a une licence active dans un autre club de la même fédération (seulement le nom du club et de l'équipe, rien d'autre) ;
  3. « Dans une autre équipe du club : … » si elle a encore une affectation en cours chez nous (par exemple comme coach) ;
  4. sinon la raison choisie au départ : A arrêté de jouer, A déménagé, Inconnu (par défaut).
- « Vers les anciens joueurs » ouvre une fenêtre de départ : la raison et une note facultative (visible des responsables). « Modifier la situation » la change plus tard. Nouvelles colonnes `club_person.departure_status` et `departure_note` (migration `0052_departure.sql`, ajout seulement).

## Décédé
- Seul le président du club peut poser ou retirer ce statut, en cochant « Je confirme le décès de … » (le serveur l'exige aussi).
- La fiche est archivée avec la mention « In memoriam », toutes ses affectations se ferment, et rien ne part plus : les emails en attente pour cette personne ou à son sujet sont annulés, aucune nouvelle notification n'est préparée pour son compte, l'envoi refuse tout reste, et une fiche archivée ne reçoit ni relance ni cotisation.
- Retirer le statut (erreur de saisie) remet la personne parmi les anciens membres, sans rouvrir ses affectations.

## Une seule fiche, en fenêtre
- Un clic sur le nom, ou « Voir », ouvre la fiche du joueur (ou du coach) dans une fenêtre, avec deux boutons en haut à droite : « Agrandir » (la même fiche en pleine page, à l'adresse `/players/[id]` qu'on peut partager) et « Fermer » (Échap aussi). Le doublon « Voir le profil » / « Fiche complète » disparaît.
- La fiche reprend ce que l'aperçu permettait de modifier : identité (nom, naissance, email, téléphone, date d'entrée), poste et numéro, affectation à une équipe, en plus de ses onglets (vue personnelle, vue sportive, santé selon les droits, documents, fauteuil, présences, statistiques).

## Filtre d'âge retiré
Les filtres « Âge minimum » (et « Âge maximum ») quittent les barres de recherche des joueurs et des membres. L'âge minimum d'une règle de documents (qui dit à qui un document est demandé) reste : ce n'est pas un filtre de recherche.

## Tests
- Unitaires : `tests/wave17-players.test.ts`.
- Intégration à deux clubs d'une fédération : `tests/integration/wave17-departure.integration.ts` (situation calculée : autre club, autre équipe, raison saisie ; décès réservé au président et confirmé ; email en attente annulé, aucun nouveau, envoi refusé ; un autre club ne peut rien).
- Bout en bout : `tests/e2e/player-sheet.spec.ts` (fiche en fenêtre puis agrandie avec la bonne adresse, Échap, pas d'âge minimum, fenêtre de départ et « In memoriam », colonne de situation, axe, 390 px) ; `player-directory.spec.ts` suit la fiche unique et la fenêtre de départ.
