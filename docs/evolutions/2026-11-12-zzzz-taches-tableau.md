# Tâches : un tableau qu'on range à la souris, des modèles prêts, des automatismes vérifiés

Demande du 12/11/2026.

## Le tableau des tâches

- **Une ligne comme une checklist** : la poignée à gauche, la case à cocher, le titre (un clic ouvre la tâche) avec sa date « Pour le … » ; à droite, trois boutons : les responsables, le matériel, modifier.
- **Glisser-déposer** : une tâche se range à la souris dans sa catégorie ou dans une autre. Pendant le glissement, une ligne colorée montre où elle va tomber. Sans souris, la poignée ouvre un petit menu (Monter, Descendre, Déplacer vers…) et répond aux flèches haut et bas du clavier. L'ordre est celui du club, le même pour tout le monde (réservé à qui planifie). Une tâche qui suit un dossier (sponsor, subside) ou que l'application a créée garde sa catégorie.
- **Catégories du club** : « Nouvelle catégorie » s'ajoute aux catégories de la plateforme ; on la renomme, on la supprime quand elle est vide. Les flèches de chaque catégorie changent leur ordre.
- **En bas de chaque catégorie** : « Nouvelle tâche à préparer… », sa date et « Ajouter » ; les responsables et le lieu restent dans « Plus de détails ».
- **Responsables et matériel depuis la ligne** : une fenêtre pour choisir qui s'en charge (prévenu aussitôt), une autre pour la liste de ce qu'il faut emporter (affichée sur la ligne).

## Modèles prêts à l'emploi

« Depuis un modèle » propose, à côté des modèles du club, cinq listes prêtes : match à domicile, match à l'extérieur, assemblée générale, journée découverte, récolte de fonds, dans la langue de la personne. Elles s'ajoutent aussi aux suggestions de Réglages, Activités, pour être copiées et modifiées. Les suggestions existantes (transport, entraînement, tournoi, saison, recrue, subside, souper) restent.

## Automatismes vérifiés

- **Chaque personne à qui une tâche est confiée est prévenue**, quel que soit le chemin. Jusqu'ici, une tâche donnée par la checklist d'un match, le responsable d'un sponsor, une amende, un départ de coach, une réservation de salle ou l'accueil d'un nouveau ne prévenait personne ; seules les tâches données à la main l'étaient. La tâche horaire prévient désormais ceux qui ne l'ont pas encore été, une seule fois, jamais la personne qui l'a donnée. Les assignations existantes ne sont pas renvoyées.
- **Nouveaux automatismes** :
  - un match à deux semaines : « Préparer le match », confié aux coachs de l'équipe, pour deux jours avant ; il se ferme quand le match est joué ou annulé ;
  - un subside annuel : un mois avant que l'appel rouvre, « L'appel rouvre bientôt, préparer le nouveau dossier », jusqu'à ce que le club ouvre un nouveau dossier chez le même financeur ;
  - la saison se termine dans 45 jours sans saison suivante : « Préparer la saison qui suit », vers les réglages des saisons.
- Les automatismes existants restent (dépôt et rapport de subside, appel ouvert, renouvellement et relance de sponsor, révision de fauteuil, document qui expire, cagnotte à clôturer, comptes annuels, affiliation, réservations de salle, amendes, fonds réservés, trésorerie, départ d'un coach).

## Formulaire d'inscription

Un formulaire de plus de trois questions s'ouvre replié : on lit la liste des titres, on déplie celle qu'on change. « Tout replier » et « Tout déplier » sont un bouton. Glisser une question montre aussi la ligne colorée.

## Base de données

Migration `0147_task_board.sql` : `task.board_position`, `task.materials`, `task.list_id` et la table `task_list`, `organization.task_group_order`, `task_assignee.told_at` (rempli pour les assignations existantes).

## Garde-fous

- `tests/task-board.test.ts` : les listes prêtes dans les trois langues, chaque tâche automatique titrée, les commandes du tableau, la ligne de dépôt, le déplacement sans souris, la tâche horaire.
- `tests/integration/task-board.integration.ts` (club A, club B) : ordre, changement de catégorie, catégorie du club, ordre des catégories, rien du club A pour le club B, responsables prévenus une fois, matériel, listes prêtes, préparation de match aux coachs prévenus une fois, checklist de match prévenue, subside qui rouvre puis se ferme, fin de saison.
- `tests/e2e/task-board.spec.ts` (axe, 390 px) : glisser-déposer, « Descendre », responsables, matériel, nouvelle catégorie, liste prête.
