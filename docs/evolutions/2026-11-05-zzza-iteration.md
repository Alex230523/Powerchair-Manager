# Itération du 05/11/2026 : finances BPCF, direct public, covoiturage, rapport d'AG, commission, chantier technique

Six lots proposés après la revue, acceptés par le propriétaire (la revue écran par écran est remise à plus tard).

## Lot 2 : le règlement BPCF jusque dans les finances
- **Amende du règlement** : à sa création, une tâche « Payer l'amende de la fédération » pour la présidence du club (30 jours). Marquée payée : dépense du club (catégorie compétition) et recette de la fédération, écritures automatiques annulables si l'amende est remise à payer ou annulée ; la tâche se ferme et se rouvre avec.
- **Indemnité de formation** : la confirmation du paiement par la fédération écrit la dépense du club entrant et la recette du club sortant ; retirer la confirmation les annule.
- **Indemnité internationale** : marquée reçue, recette de la fédération, reversement (dépense) à la fédération et recette du club formateur.
- **Carte « Dû à la fédération »** sur ses Finances : affiliations à encaisser (et en retard), amendes du règlement, amendes disciplinaires, indemnités internationales à recevoir, chacune liée à sa page.
- Migration 0121 (sources d'écritures `transfer`, `international`, `internationalOut`).

## Lot 3 : page publique du match en direct
- Dans le parcours du match, carte « Page publique du match » : « Créer le lien » donne `/live/<jeton>` ; un nouveau jeton à chaque activation, « Retirer le lien » le révoque.
- La page, sans compte : équipe, adversaire, date, état (à venir, en cours, terminé…), score en direct depuis le bord de terrain puis résultat confirmé, faits de match avec la minute (buts, cartons, corners, temps morts). Un joueur est nommé selon les règles des noms publics (adulte, ou accord) ; sinon par son numéro. Actualisée toutes les 20 secondes tant que le match n'est pas terminé.
- Route `GET /api/public/live/[token]` (404 sans jeton valide), page `/[locale]/live/[token]`, non indexée. Migration 0122.

## Lot 4 : covoiturage par les parents
- Sur un déplacement, un parent ou un joueur adulte concerné (lui-même ou un enfant inscrit) propose des places : places, fauteuils, trajet, téléphone, précisions. La présidence est prévenue.
- Accepter crée la voiture dans les véhicules du déplacement (privée, le parent au volant, ses étapes proposées) ; il reste à y placer les passagers. Refuser ou retirer : la personne est prévenue. Une proposition ouverte par personne et par déplacement.
- Migration 0123 (`trip_carpool_offer`).

## Lot 5 : rapport de saison en PDF
- Le rapport d'activité se télécharge aussi en PDF (bouton en premier), même contenu que le PowerPoint sans les cadres photo.
- Deux sections de plus : **Distinctions** (titre, compétition, place, équipe ou personne selon les règles des noms publics) et **Obligations de l'ASBL** (tenues sur total, chacune faite ou à faire avec son échéance).

## Lot 6 : commission et licences
- Page **Commission** (fédération : présidence, délégués licences ou discipline) : journal des décisions, inscrites par l'application (transfert validé ou refusé, force majeure, amende, transfert international) ou à la main ; chaque membre signe en son nom, « signée par toute la commission » quand tous ont signé. Migration 0124.
- Licences : export en tableur (numéro, nom, année de naissance, club, saison, statut) et **reprise des numéros** depuis le fichier CSV de la fédération (colonnes numéro, nom, club, saison ; correspondance sans accents ni casse) ; les lignes sans correspondance et les numéros déjà pris sont listés ; une licence demandée devient active avec son numéro.

## Lot 7 : chantier technique
- `.file-button` : quatre définitions (contours de 2 et 3 px mêlés) fondues en une.
- Budget : la feuille de style reste sous 300 Ko (test), chaque règle du bouton de fichier une fois.
- L'erreur d'hydratation intermittente de l'accueil : composants de l'en-tête relus (thème, taille, contraste, raccourci clavier), tous rendus après le montage ; cause toujours pas trouvée.

## Permissions
Commission : lecture par toute personne avec une compétence fédérale, écriture par la présidence et les délégués licences ou discipline. Covoiturage : proposition par une personne du déplacement, décision par qui gère les déplacements. Page du direct : publique par jeton, créée par qui gère le match.

## Vérification
- `tsx tests/revue-0511.test.ts`, boucle unitaire complète
- Intégration : `fines`, `wave17-transfers`, `federation-asbl`, `a5-match-journey`, `wave7`, `wave15-report`, `commission`
- `playwright test tests/e2e/iteration-0511.spec.ts` (axe, 390 px)
