# Vague 17, O1 : coachs, tâches, formation, permis et première connexion (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point O1.

## Tâches unifiées
La table `funding_task` (vague 15, C1 et C2) devient la liste de tâches commune du club. Elle garde son nom pour ne rien casser (code existant, base partagée des aperçus Vercel) et gagne :
- un type : transport, entraînement, documents, sponsors, subsides, obligations, matériel, autres ;
- des liens vers un événement, un match, un déplacement, une obligation ou un fauteuil, en plus du sponsor et du subside ;
- les tâches existantes sont reprises en « sponsors » ou « subsides ».

Page Tâches (`/tasks`) et onglet « À faire » du profil coach :
- un menu « Type » (Tous, Transport, Entraînement, ...) et un groupe par type, jamais mélangés, chacun trié par échéance (sans date à la fin) ;
- une case à cocher, un lien vers l'objet lié et le badge « En retard ».
- « Mes tâches seulement » est coché d'office pour qui ne planifie pas pour les autres (un coach).
- Le président et ceux qui ont `calendar.manage` ou `teams.manage` voient et donnent toutes les tâches. Les tâches de sponsors et de subsides restent réservées à ceux qui voient l'argent, et se créent depuis leur dossier. Les autres membres voient et cochent les tâches qui leur sont confiées, et ne peuvent créer une tâche que pour eux-mêmes.

Modèles de tâches par type dans Réglages › Activités : deux modèles proposés en trois langues (« Transport vers un match », « Préparer un entraînement » : choisir les fiches exercices, confirmer la salle, vérifier le matériel). Chaque tâche d'un modèle est due un nombre de jours avant la date choisie. Les rappels à 7 jours (vague 15) couvrent désormais tous les types.

Les affiliations (N2) gardent leur propre suivi et n'apparaissent pas dans les tâches.

## Permis de conduire
- Section « Permis de conduire » dans le profil du coach : catégories (B, BE, C1, D1, D), date de validité, copie facultative (photo ou PDF, vérifiée sur ses premiers octets et comptée dans le stockage du club).
- Le coach crée et modifie sa propre ligne de `driver_licence`. Le club voit « Déclaré », puis « Vérifié par le club » (date et nom) quand une personne qui organise les déplacements le marque. Toute modification renvoie à « Déclaré ».
- Visible seulement par la personne elle-même, le président et ceux qui organisent les déplacements (`calendar.manage`, `teams.manage`). Un autre coach, un parent ou un autre club reçoit « introuvable ».
- Rappel à la personne 30 jours avant l'expiration, une seule fois par date (travailleur quotidien, colonne `reminded_on`).

## Coach formé
- Liste des coachs : colonne « Formation » :
  - « Formé » (vert, avec le nom de la formation et la date de validation en infobulle et pour les lecteurs d'écran) ;
  - « En attente de validation » (orange) ;
  - « Non formé ».
  Elle se calcule à partir des demandes approuvées par la fédération et encore valables.
- Fiche du coach : historique des formations et « Demander la validation d'une formation », par le président ou désormais par le coach lui-même pour son propre profil, avec un justificatif facultatif. La fédération voit et ouvre le justificatif dans « Formations des coachs ».

## Première connexion
- L'ajout d'un coach avec une adresse envoie bien l'invitation (I2) : un test d'intégration vérifie l'invitation et le courriel mis en file.
- Visite guidée en 5 étapes à la première connexion d'un coach : son équipe dans la barre du haut, le calendrier et la création d'un entraînement, l'appel des présences, l'onglet « À faire », son profil (permis, formation).
- C'est une fenêtre non bloquante, que l'on peut passer (« Passer » ou Échap). Elle entoure tour à tour la partie de l'écran dont elle parle.
- Mémorisée par compte et par public (table `user_tutorial`, colonne `tutorial_seen_at`). Relançable depuis Réglages › Mon compte (« Revoir la visite guidée »).
- Le mécanisme accepte aussi les publics « joueur » et « parent » : il suffira d'ajouter leurs textes dans `tutorial-copy.ts`.

## Données
Migration `0055_tasks_coaches.sql` (ajout seulement) :
- `funding_task` : type, liens et index ;
- table `task_template` ;
- `driver_licence` : déclaration, vérification, copie, rappel ;
- `training_request` : justificatif ;
- vue de stockage complétée ;
- table `user_tutorial`.

## Tests
- Unitaires : `tests/wave17-coaches.test.ts` couvre :
  - groupes par type et tri ;
  - échéances d'un modèle ;
  - types réservés ;
  - catégories de permis et rappel à 30 jours ;
  - types de fichiers ;
  - état de formation ;
  - visite en 5 étapes ;
  - textes en trois langues.
  `wave14` suit le menu.
- Intégration à deux clubs : `tests/integration/wave17-coaches.integration.ts` couvre :
  - tâches par type et filtrées, modèle, coche, refus et isolement ;
  - permis visible seulement des bonnes personnes, vérifié puis remis à « Déclaré », rappel unique ;
  - « Formé » après validation fédérale, avec justificatif ;
  - invitation envoyée ;
  - visite vue puis relancée.
  `club-coaches` suit la nouvelle règle (le coach peut demander pour lui-même, jamais pour un collègue).
- Bout en bout : `tests/e2e/coaches.spec.ts` couvre :
  - visite affichée une seule fois puis relancée ;
  - tâches par type et cochées ;
  - onglet « À faire » ;
  - permis déclaré avec copie, demande de validation avec justificatif ;
  - vérification par le président et badge « Formé » ;
  - axe et 390 px.
  Les comptes créés par les autres tests marquent la visite comme vue.
