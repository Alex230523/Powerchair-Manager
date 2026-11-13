# Routes sans écran : une retirée, une gardée

Suite de la vérification générale du 13/11/2026 (point 3).

## Retirée : `/api/funding/tasks`

Elle listait les tâches des dossiers sponsors et subsides (vague 15). Ces tâches vivent dans le tableau des tâches (`/tasks`), qui les montre avec les mêmes règles (toutes pour qui gère l'argent, les siennes pour les autres). Aucun écran ne l'appelait plus : la route et sa fonction `fundingTasksView` sont retirées ; les tests passent par le tableau des tâches.

## Gardée : `/api/designations`

En la regardant de plus près, ce n'était pas un doublon : c'est le seul chemin pour désigner un arbitre sur un match officiel de championnat ou de coupe d'un club (`referee_assignment`). L'écran arbitres de la fédération ne gère que les arbitres, leurs invitations et les tournois ; l'accueil fédéral compte pourtant « X matchs officiels sans arbitre » et mène à cet écran, où rien ne permet de les désigner. Retirer la route aurait supprimé la fonction elle-même. Elle reste en place, protégée et testée ; il manque un écran de désignation.
