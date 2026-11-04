# Retours du 04/11/2026 : retraits, to-do, accueil, fenêtres, fiches, matchs, transferts BPCF

Liste de retours du propriétaire, appliquée lot par lot selon le prompt de travail (document de projet `claude/prompt-retours-2026-11-04.md`). Ce qui était déjà fait n'a pas été refait.

## Lot A : retraits
- **Incidents**, **Recrutement** et **Sondages** disparaissent de l'interface (pages, menu, API, tâches de fond, droits, textes). Les tables restent (migrations additives) ; la purge légale des anciens incidents continue (`jobs/retired.ts`). Le champ « incidents » du rapport de match reste.
- Recrutement devient une étiquette **« Recrutement »** des contacts (migration 0112).

## Lot B : to-do
Une tâche cochée reste, barrée (un filtre masque les faites). Ligne légère : case, titre, échéance, personnes ; statut et suppression dans le détail. Ajout rapide : titre, puis en option responsables (plusieurs), lieu, date.

## Lot C : accueil et finances
Chiffres clés sans Trésorerie ni Disponible (dans Finances), cases de même taille ; survol de « Joueurs » : bulle grise PF1 / PF2. Finances : une seule case Trésorerie.

## Lot D : rôles et coachs
Éditeur de rôles réparé (Rien / Lecture / Modification). Liste des coachs : survoler le nombre de tâches montre les trois prochaines ; le lien mène à ses tâches.

## Lot E : calendrier
« Nouvel événement » et « Modifier » en fenêtre centrale ; équipe « Toutes les équipes » ; absences annoncées repliables.

## Lot F : matchs
Score vert gagné, rouge perdu, sans pastilles « Forme ». Lignes de tournoi sans répéter tournoi et jour. Corners pour nous et adverses au bord du terrain. Composition dévoilée automatiquement (au coup d'envoi, 30 min, 1 h, 2 h ou la veille). Migration 0115.

## Lot G : déplacements
« Ajouter un permis » (qui, catégories, depuis le, valable jusqu'au) et « Ajouter un véhicule du club » en fenêtre ; la fiche du coach aussi (« Ajouter un permis »). Migration 0113 (`driver_licence.obtained_on`).

## Lot H : fiches d'exercice
L'objectif libre existait déjà (à côté du type). Nouveau : « Envoyer à un autre club » (clubs de la même fédération). La présidence du club reçoit une ligne dans « À faire » et un bloc « Fiches reçues d'autres clubs » ; acceptée, la fiche arrive dans sa bibliothèque avec son créateur et son club d'origine ; refusée, rien n'arrive. Migration 0114 (`exercise_offer`).

## Lot I : finitions
Mes équipes sans « Équipes du club » ; type de document « carte d'identité » retiré (démo comprise) ; cases à cocher de 20 px alignées sur la première ligne ; champs de filtre (recherche et listes) alignés et de même hauteur ; « Lieu du club » aligné. Fédération : « Changer le montant » d'une cotisation fédérale existante (coût par joueur et par an).

## Transferts : règlement BPCF 2025 (art. 1/12)
- Deux nouvelles règles : transfert consenti possible toute la saison ; au plus N transferts d'un club vers un même club par saison (`TRANSFER_PAIR_LIMIT`). Migration 0116.
- Départ libre ou litigieux : si le club sortant refuse et que le joueur (ou un parent) a donné son accord, la fédération peut valider pendant une période de transfert.
- Bouton « Reprendre le règlement BPCF 2025 » : périodes de la saison (1er juillet au 31 août, 20 décembre au 10 janvier), plafond de 500 €, un transfert par saison d'un club vers un autre, validation par la fédération et texte résumé (indemnités de formation, force majeure). La fédération vérifie puis enregistre.
- Limites : l'indemnité de formation n'est pas calculée automatiquement (format académie ou élite non enregistré) ; le montant reste saisi par le club entrant sous le plafond. Les transferts internationaux restent hors application.

## Permissions
Aucune nouvelle permission. Envoi de fiche : qui écrit les fiches du club ; réponse : présidence du club destinataire seulement. Règles de transfert : fédération seulement.

## Vérification
- `tsx tests/wave17-transfers.test.ts`, `tsx tests/sideline.test.ts`, `tsx tests/t01-interface.test.ts`, `tsx tests/t12-navigation.test.ts`
- Intégration : `exercises4`, `a5-match-journey`, `wave7`, `wave17-transfers`, `wave17-affiliations`, `staff-roles`, `dashboard`
- `playwright test tests/e2e/retours-0411.spec.ts tests/e2e/coaches.spec.ts` (axe, 390 px)
