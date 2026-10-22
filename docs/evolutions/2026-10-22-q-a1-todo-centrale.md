# A1 : to-do centrale du club et de la fédération (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point A1.

## Décisions
- **Pas de nouvelle table.** La liste des tâches de la vague 17 (`funding_task`) grandit : catégorie, statut à trois valeurs, priorité, sous-tâches, répétition, équipe, responsable par compte (fédération), source automatique. Une vue `org_task` lui donne son vrai nom. Recommandation : renommer la table plus tard, en une migration dédiée, quand plus aucune prévisualisation ne tourne sur l'ancien nom.
- **La catégorie remplace le type pour l'affichage.** Le type (`kind`) reste stocké pour les sponsors, les subsides et les anciens liens (`?kind=grant` ouvre « Subsides »). Un déclencheur remplit la catégorie à partir du type quand un ancien code l'omet.
- **Les tâches automatiques sont recalculées, pas stockées en double.** Chaque cause donne une clé unique par organisation (`source_key`) : une deuxième passe n'ajoute rien, et une tâche dont la cause a disparu se ferme seule (« Fermée par l'application »).
- **Un subside qui a déjà sa check-list** (vague 15) ne reçoit pas de tâche automatique en plus : la check-list fait foi.
- **Rappels** : à l'attribution, puis à J-7 et J-1, au profil ou au compte responsable, une seule fois chacun.

## Page « Tâches »
- Une section repliable par catégorie, vide comprise, avec le nombre de tâches ouvertes et un badge rouge pour celles en retard.
  - Club : Affiliation et fédération, Administratif et légal, Subsides, Sponsors, Collecte de fonds, Matériel, Sport (licences, inscriptions aux tournois), Événements, Autre.
  - Fédération : Affiliations des clubs, Licences, Compétitions et arbitrage, Administratif et légal, Finances, Autre.
- Filtres : Toutes, Mes tâches, En retard, Cette semaine ; une catégorie ; un responsable ; afficher les tâches faites.
- Ajout rapide dans chaque catégorie (un titre suffit), ou « Nouvelle tâche » avec échéance, priorité, répétition (une fois, chaque mois, chaque année), responsable, équipe et sous-tâches.
- Fenêtre de la tâche : statut (à faire, en cours, fait), sous-tâches à cocher, commentaires, lien « Ouvrir » vers ce dont il s'agit, « Modifier ».
- Tâche répétée : quand elle est faite, la suivante est créée pour la date suivante (fin de mois respectée).
- « Année administrative de l'ASBL » : assemblée générale et approbation des comptes, dépôt des comptes, registre UBO, impôt des personnes morales, assurances, affiliation. Dates calculées depuis l'exercice comptable, à vérifier et modifier avant d'appliquer ; elles reviennent chaque année.
- `?task=` ouvre une tâche (lien des rappels), `?new=1` la fenêtre de création.
- Ctrl+K propose « Ajouter une tâche » à qui planifie.
- Cibles de 44 px, fenêtres accessibles, aucune couleur en dur.

## Tâches créées par l'application (club)
| Cause | Catégorie | Se ferme quand |
|---|---|---|
| Échéance de dépôt d'un subside (idée) | Subsides | le dossier est déposé |
| Rapport justificatif d'un subside accordé | Subsides | le subside est clôturé |
| Fauteuil à réviser dans les 30 jours | Matériel | la révision est enregistrée |
| Document qui expire dans les 30 jours | Administratif et légal | le document est renouvelé |
| Cagnotte à clôturer dans les 14 jours | Collecte de fonds | la cagnotte est fermée |
| Comptes annuels à approuver, puis à déposer | Administratif et légal | l'étape est franchie |

Le titre est écrit dans la langue du lecteur. La synchronisation tourne à l'ouverture de la page et une fois par heure dans le service de fond.

## Qui voit quoi
- Le président et ceux qui planifient (`calendar.manage`, `teams.manage`, `mandates.manage`) voient et donnent toutes les tâches ; les catégories d'argent restent à ceux qui ont les droits de cotisations, et disparaissent si le module Finances est coupé.
- Tous les autres (joueurs, parents, coachs, arbitres) ont le menu « Tâches » et n'y voient que les tâches qui leur sont données ; ils les cochent, les commentent et y ajoutent des sous-tâches.
- À la fédération, président et secrétariat gèrent ; la tâche est donnée à un compte de la fédération.
- Accueil : nouvelle case « Mes tâches » (échéance dans les 14 jours ou en retard).

## Code
- Migration `0064_org_tasks.sql` : colonnes, `task_comment`, vue `org_task`, déclencheur de catégorie.
- `src/domains/tasks/schema.ts` : catégories, commandes, modèle annuel, répétition.
- `src/domains/tasks/sources.ts` : tâches automatiques (`syncSources`, `taskSourcesTick`).
- `src/domains/tasks/service.ts` : vue, droits, commandes, `myTasksCount`.
- `src/components/tasks.tsx` et `todo-copy.ts` (fr, nl, en).
- Rappels J-7 et J-1 : `fundingTaskTick` ; synchronisation horaire : `scripts/attendance-worker.ts`.

## Données de démonstration
Le club démo reçoit l'année administrative, une tâche de sport donnée au coach avec sous-tâches, une vente de gaufres annuelle, une réservation de salle et une tâche en retard.

## Tests
- Unitaires (`tests/a1-todo.test.ts`) : catégories et tri, répétition, dates de l'année ASBL, retard et semaine, commandes, Ctrl+K, textes.
- Intégration (`tests/integration/a1-todo.integration.ts`) :
  - tâche d'un subside créée une seule fois, fermée au dépôt, absente si la check-list existe ;
  - joueur qui ne voit que sa tâche, la passe en cours, coche une sous-tâche, commente ;
  - répétition mensuelle et modèle annuel appliqué une fois ;
  - rappels J-7 et J-1 ;
  - fédération et clubs séparés, deux clubs.
- Bout en bout (`tests/e2e/todo.spec.ts`, `coaches.spec.ts` et `sponsors.spec.ts` mis à jour), axe et 390 px.
