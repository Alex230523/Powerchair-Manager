# Vérification générale du 13/11/2026

Demande : « un gros check des bugs, connexions, voir si des endpoints manquent, check de sécurité et check autorisation des différents types de profils ».

## Ce qui a été vérifié

- **Appels de l'interface vers l'API** : 264 appels `fetch` relevés dans les écrans, comparés aux 195 routes et à leurs méthodes. Aucun appel vers une route absente, aucune méthode manquante.
- **Liens internes** : liens des écrans, du menu, des cases « À faire », des notifications et des nouveautés comparés aux 126 pages. Aucun lien mort.
- **Menus par profil** : chaque entrée de menu de chaque profil (président, coach, joueur, parent, fédération, arbitre, permanent fédéral, club B, fédération B) mène à une page dont l'API répond pour ce profil.
- **Sécurité** : toutes les routes vérifient la session (ou un jeton, une clé d'API, le secret du planificateur) ; les écritures vérifient l'origine ; pas de SQL construit avec une saisie (les seuls morceaux variables sont des noms de table ou de colonne fixés dans le code) ; pas de HTML injecté hors des deux scripts signés par nonce ; la redirection après connexion reste sur le site.
- **Autorisations par profil** : 39 routes étaient appelées par l'audit des droits sans réponse attendue (une erreur 500 ou une fuite de l'autre club était vue, pas un changement de droits). Leurs réponses observées ont été relues profil par profil puis fixées dans `tests/access-matrix.ts` : tout changement de droits sur ces routes fait désormais échouer la CI. Un test refuse qu'une nouvelle route arrive sans réponse attendue pour chaque profil.

## Corrigé

- Les 39 routes ci-dessus ont leurs réponses attendues ; `docs/MATRICE-DROITS.md` n'a plus de « ? ».
- `tests/e2e/settings.spec.ts` : la vue téléphone compte aussi la catégorie « Abonnement à la plateforme » (échec de la CI de #162).
- Avec #165 : les assistants d'une équipe n'étaient pas comptés comme encadrement (calendrier) et ne voyaient pas leur équipe sur l'accueil coach.

## Relevé, à décider

- **Date du jour entre minuit et 1 h (2 h en été)** : environ 240 requêtes prennent la date du serveur de base de données (UTC). Entre minuit et 1 h à Bruxelles, l'application se croit encore la veille : un contact noté « aujourd'hui » est daté d'hier, une échéance du jour n'est pas encore échue. C'est aussi la cause des tests qui échouent quand la CI tourne entre 23 h et minuit UTC. Correction possible : fuseau Europe/Brussels par défaut sur la base, puis un fuseau par club quand les clubs des Pays-Bas, de France, du Royaume-Uni et des États-Unis arriveront.
- **Encadrement des sélections nationales** : la route `/api/national/care` (consignes de soin des joueurs qui ont consenti) existe, mais aucun écran ne l'appelle ; l'encadrement national (coach, kiné, accompagnant) n'a pas d'écran à lui.
- **Routes sans écran** : `/api/designations` (remplacée par l'écran arbitres) et `/api/funding/tasks` (les tâches sponsors et subsides sont dans le tableau des tâches) ne sont plus appelées ; elles restent protégées, et pourraient être retirées.
