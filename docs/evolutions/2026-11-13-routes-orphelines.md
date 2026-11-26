# Routes sans écran : une retirée, une gardée

Suite de la vérification générale du 13/11/2026 (point 3).

## Retirée : `/api/funding/tasks`

Elle listait les tâches des dossiers sponsors et subsides (vague 15). Ces tâches vivent dans le tableau des tâches (`/tasks`), qui les montre avec les mêmes règles (toutes pour qui gère l'argent, les siennes pour les autres). Aucun écran ne l'appelait plus : la route et sa fonction `fundingTasksView` sont retirées ; les tests passent par le tableau des tâches.

## `/api/designations` : gardée le 13/11, retirée le 26/11/2026

Le 13/11, elle a été gardée en la croyant le seul chemin pour désigner un arbitre sur un match officiel d'un club. C'était une erreur de lecture : depuis le 02/11/2026 (`2026-11-02-zzb-arbitrage.md`), le bloc « Couvrir les matchs » de la page « Arbitres et désignations » désigne sur les matchs de club comme de tournoi, par `/api/refereeing` (avec les alertes indisponible, même club, même heure). La recherche ne l'avait pas vu parce que ce service choisit sa table au moment de la requête. `/api/designations` était donc bien un doublon sans écran : elle est retirée avec `designationsView` et `designationExecute` ; les tests passent par `refereeingView` et `refereeingExecute`. L'accueil fédéral (« X matchs officiels sans arbitre ») mène toujours à cette page.
