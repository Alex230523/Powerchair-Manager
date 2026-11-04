# 2. To-do : plusieurs responsables, modèles à la demande, vue de l'année (02/11/2026)

La to-do centrale (A1) est étendue, pas reconstruite. Migration `0085_tasks_more.sql` (additive, idempotente).

## 1. Plusieurs responsables

- Table `task_assignee` : un profil du club ou, pour une fédération, un compte.
  - `responsible_id` et `responsible_user_id` restent « la première personne » pour les modules qui les écrivent encore.
  - Un déclencheur garde cette personne parmi les responsables.
  - Les tâches existantes gardent leur personne.
- Dans la fenêtre de la tâche, une liste à cocher avec recherche. Chaque personne est prévenue et reçoit les rappels (échéances d'argent comprises).
- Mode de fin :
  - « dès qu'une personne la coche » (par défaut) ;
  - « quand chacun a coché sa part », avec « 3/5 faits » sur la ligne.
- « Mes tâches » et les filtres par personne tiennent compte de tous les responsables.

## 2. Rendez-vous, lieu, lien, montant

- Une tâche peut avoir un rendez-vous (début, fin) distinct de son échéance, un lieu (lieu du club, salle partagée ou texte libre) et un lien web (http ou https seulement).
- Les rendez-vous des tâches apparaissent dans l'Agenda (« Mes rendez-vous (tâches) ») et dans l'abonnement « mes activités » de la personne.
- Montant prévu : la tâche entre dans les échéances d'argent. Une fois cochée, « Enregistrer la dépense ? » crée la dépense une seule fois, liée à la tâche.

## 3. Répétitions

- Nouveau rythme « chaque semaine », et une date de fin facultative.
- La répétition est dite en mots (« Chaque semaine le mercredi jusqu'au 16 décembre 2026 »).
- La tâche suivante reprend les responsables. Filtre « Récurrentes ».

## 4. Modèles à la demande

- « Depuis un modèle » : choisir un modèle et une date de référence. Chaque ligne devient une tâche N jours avant, avec ses responsables ; une ligne peut être écartée.
- « Enregistrer comme modèle » depuis une tâche et ses sous-tâches.
- Dans Réglages › Activités : catégorie, archiver, réactiver, dupliquer. Un modèle archivé n'est plus proposé mais reste lisible.
- Sept modèles suggérés en fr, nl et en : déplacement, entraînement, tournoi, saison, recrutement, subside, souper du club.

## 5. Affiliation

- Chaque ligne d'affiliation due crée sa tâche (catégorie Affiliation et fédération).
- Cocher la tâche propose « Marquer l'affiliation en ordre », avec sa dépense : rien n'est écrit deux fois.
- Marquer l'affiliation en ordre ailleurs ferme la tâche ; l'annuler (bouton « Annuler ») la rouvre.

## 6. L'année d'un coup d'œil

- Bouton « Année » : les douze prochains mois, tâches et répétitions à venir, subsides, sponsors, comptes annuels, affiliations.
- Chaque date porte son état en mots (Fait, À venir, En retard) et une icône, pas seulement une couleur.
- « Calendrier administratif (PDF) » en fr, nl ou en (`/api/tasks?year=pdf&locale=`).

## Droits

Inchangés : les mêmes que la to-do (A1). Toutes les requêtes filtrent par organisation ; une personne, un lieu, un modèle ou une affiliation d'un autre club est refusé.

## Limites

- Le rendez-vous d'une tâche n'envoie pas d'invitation à répondre : ce n'est pas une activité de l'Agenda.
- Le PDF de l'année reprend les douze mois à venir, pas une année civile choisie.

## Vérification

- `npx vitest run tests/t02-todo.test.ts tests/a1-todo.test.ts`
- `npm run test:integration` (`tests/integration/t02-todo.integration.ts`) : plusieurs responsables et mode « chacun », modèle appliqué, répétition hebdomadaire bornée, dépense une seule fois, affiliation fermée et rouverte, vue de l'année, refus entre deux clubs.
- `npm run test:e2e:db` (`tests/e2e/todo-more.spec.ts`) : 390 px, axe.
