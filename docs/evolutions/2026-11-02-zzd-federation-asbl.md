# La fédération comme ASBL (02/11/2026)

Point 35 de l'avis. Les modules de gestion de l'ASBL écrits pour les clubs s'ouvrent à la fédération, sans nouveau module et sans jamais mélanger ses données avec celles des clubs : chaque ligne reste celle de son organisation. Migration `0097_federation_asbl.sql` (additive).

## Partie 1 : finances de la fédération

- Vue d'ensemble, opérations, budget, relevés, comptes annuels, « Subsides & sponsors » : mêmes pages que les clubs, avec la compétence `federation.finance` (la présidence l'a). Un droit de club (`dues.*`) n'ouvre jamais les livres d'une fédération, et la fédération ne lit jamais ceux d'un club.
- Les onglets propres aux clubs disparaissent pour la fédération : affiliations à payer, attestations fiscales, cotisations, cagnottes.
- Écritures automatiques, une seule fois par cause, annulées avec leur cause :
  - affiliation d'un club marquée « en ordre » : recette de la fédération (nom du club seulement ; rien des joueurs ni de ses notes) ; l'annulation côté club annule aussi la recette ;
  - amende disciplinaire payée (point 34) : dépense du club et recette de la fédération ;
  - note de frais d'arbitrage payée (point 37) : dépense de la fédération.

## Partie 2 : vie de l'ASBL

- Les membres de la fédération sont ses clubs : chaque club affilié reçoit une fiche de membre dans la fédération, admise une fois au registre, portée par la personne qui le représente à l'AG (son président au départ ; la fédération peut choisir une autre personne qui a un mandat dans le club).
- Assemblée générale de la fédération : même module que les clubs (ordre du jour, invitations envoyées aux représentants, présence, procurations, votes, PV, suites UBO et Moniteur).
- Réglage des statuts « Voix de chaque club » : une voix par club, ou une voix par licence active du club cette saison. Le quorum et la liste des présents suivent le poids.
- Accès : présidence fédérale et délégué finances.

## Partie 3 : to-do fédérale

- « Année administrative de l'ASBL » s'applique aussi à la fédération : AG et comptes, dépôt, UBO, impôt, assurances, puis ses échéances propres (ouverture des affiliations, publication du calendrier des compétitions, journées de classification), chacune avec sa catégorie fédérale et une personne responsable.

## Partie 4 : menu fédéral

- Groupe « Finances » : Finances, Subsides & sponsors, Vie de l'ASBL, visibles avec la compétence finances.

## Limites

- Les représentants des clubs ne répondent pas eux-mêmes dans l'application (il leur faudrait un profil dans la fédération) : la fédération note leur présence et leurs procurations.
- Les tournois n'ont pas de droit d'inscription dans l'application : rien à reprendre en recette.
- Les « fonds réservés » n'existent pas encore comme module, ni pour les clubs ni pour la fédération.

## Vérification

- `npx vitest run tests/federation-asbl.test.ts tests/a1-todo.test.ts`
- `npm run test:integration` (`tests/integration/federation-asbl.integration.ts`, deux fédérations) :
  - opération de la fédération invisible des clubs, délégué sans compétence refusé ;
  - affiliation payée en recette côté fédération et en dépense côté club, sans donnée privée, annulée puis réécrite une fois ;
  - AG des clubs avec procuration et voix pondérées par licences ;
  - année administrative de la fédération ;
  - autre fédération isolée.
- Amende et note de frais : `discipline.integration.ts`, `refereeing.integration.ts`.
- `tests/e2e/federation-asbl.spec.ts` à 390 px avec axe.
