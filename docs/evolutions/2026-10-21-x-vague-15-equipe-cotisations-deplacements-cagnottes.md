# Vague 15, prompt 1.C : cotisations, déplacements et cagnottes par équipe (21 octobre 2026)

Migration `0032_trip_pot_team.sql` (ajout seulement). Lot 09 non touché : aucune table de rapprochement bancaire n'est modifiée.

## Règle commune des cotisations

Une ligne de cotisation appartient à une équipe si son barème a cette équipe (`dues_plan.team_id`, vague 12), ou, pour un barème « club entier », si le joueur est membre actuel de l'équipe (`team_membership` en cours : ni annulée, ni clôturée, commencée, pas terminée). La règle est écrite une fois (`receivableTeamsSql`, `src/domains/dues/teams.ts`) et chaque ligne arrive avec ses `team_ids` dans la page Cotisations, l'accueil et les rappels.

`duesTotals(lignes, aujourdhui, équipe)` reçoit désormais l'équipe en paramètre : la page Cotisations, la carte « Situation financière » de l'accueil et le compteur « en retard » du menu appellent la même fonction avec la même équipe et donnent donc les mêmes chiffres. Auparavant l'accueil filtrait par joueurs de l'équipe, ce qui comptait à tort une ligne d'un barème d'une autre équipe.

## Cotisations (`/dues`)

- Les quatre tuiles, le tableau et la recherche suivent l'équipe de la barre du haut. Un filtre « Équipe » local dans la barre d'outils peut s'en écarter, avec « Appliquer à toute la plateforme » comme sur les autres pages de la vague 12.
- Quand « Toutes les équipes » est choisi, une colonne « Équipe » montre la puce de couleur de chaque ligne.
- La note « Vue club entière » disparaît.

## Rappels (`/reminders`)

La liste des cotisations, le compteur de l'onglet et « Cocher tous les retards » ne prennent que les lignes de l'équipe choisie ; l'envoi ne part qu'aux personnes listées.

## Déplacements (`/trips`)

- `trip.team_id` facultatif (NULL = club entier), clé étrangère composée avec l'organisation ; le service refuse proprement (404) une équipe d'un autre club.
- Champ « Équipe » dans le formulaire (« Club entier » par défaut). Modifier un déplacement sans envoyer le champ garde l'équipe.
- La liste montre la puce de l'équipe ; avec une équipe choisie, elle garde ses déplacements et ceux du club entier.
- Argent : une opération enregistrée sur un déplacement sans équipe explicite compte pour l'équipe du déplacement (grand livre filtré, rapport financier par équipe), y compris pour les opérations déjà liées avant qu'on choisisse l'équipe du déplacement.

## Levée de fonds (`/fundraising`)

- `fundraising_pot.team_id` facultatif. Champ « Équipe » dans le formulaire de cagnotte.
- Une cagnotte d'équipe n'est visible que des joueurs de cette équipe et de leurs parents (les responsables de l'argent voient tout) ; un joueur d'une autre équipe ne peut pas y noter une récolte, et un responsable ne peut pas y créditer un joueur d'une autre équipe.
- « Qui a rapporté quoi » ne liste que les joueurs de l'équipe ; la liste des collecteurs proposée au responsable aussi.
- Avec une équipe choisie, la page garde ses cagnottes et celles du club entier ; la note « Vue club entière » disparaît.

## Nettoyage

`WholeClubNote` et le texte `wholeClub` de `shell-copy.ts` sont supprimés (plus utilisés), ainsi que la règle `.scope-note`.

## Tests

- Unitaires (`tests/wave15-team.test.ts`) : totaux par équipe, ligne sans équipe exclue, ordre de la règle (barème puis appartenance), plus aucune note.
- Intégration (`tests/integration/wave15-team-money.integration.ts`, deux clubs) : équipes de chaque ligne (barème d'équipe et barème club entier), chiffres identiques entre page, accueil et compteur pour chaque équipe et sans équipe, rappels ; déplacement d'équipe, équipe d'un autre club refusée, équipe gardée à la modification, dépense du déplacement comptée pour l'équipe ; cagnotte d'équipe invisible et refusée pour un joueur d'une autre équipe, classement limité à l'équipe, autre club isolé.
- Bout en bout (`tests/e2e/team-money.spec.ts`) : colonne Équipe et 500 € pour toutes les équipes, Équipe B dans la barre du haut puis tuiles à 250 €, une ligne, plus de colonne ni de note, même montant sur l'accueil, champ Équipe des déplacements, axe. `teams.spec.ts` adapté (plus de note).

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
