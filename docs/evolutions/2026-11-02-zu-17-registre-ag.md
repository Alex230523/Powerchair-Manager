# 17. Registre des membres et assemblée générale, automatisés (02/11/2026)

La vie associative de l'ASBL : registre des membres et assemblée générale (et conseil d'administration), automatisés au maximum. Le président décide (date de l'AG, admissions) ; l'outil calcule les dates, rédige, envoie, compte, génère le PV et crée les tâches qui suivent. Migration `0088_association.sql` (additive).

Ce n'est pas un avis juridique : toutes les règles sont des réglages, à aligner sur les statuts du club.

## Où

- Nouvelle page « Vie de l'ASBL » (`/club/association`) dans le groupe Club du menu, pour la présidence et ceux qui gèrent les mandats. Le secrétaire (fonction « Secrétaire » au registre) y a les mêmes outils.
- Un membre effectif y lit le registre, répond à l'invitation et donne procuration (lien de l'invitation).
- Réglages › Club › « Règles de l'ASBL ».

## Partie 1. Registre des membres

- Statut associatif par personne, distinct de l'inscription sportive : membre effectif, membre adhérent, aucun ; administrateur avec fonction et dates de mandat. Date d'admission ou de sortie, et décision qui la fonde (AG ou conseil, date).
- Le registre se tient seul : chaque décision (inscrite à la main ou adoptée dans un PV) ajoute une ligne datée. Une ligne ne se modifie ni ne se supprime (verrou en base) : une correction est une nouvelle ligne motivée.
- Suggestions, jamais ajoutées sans décision : un adulte inscrit dans une équipe depuis plus d'une saison, un parent qui a mené au moins trois tâches.
- Export PDF daté (membres effectifs et historique), lecture seule pour les membres effectifs.

## Partie 2. Assemblée générale

- Réglages issus des statuts : délai d'invitation (15 jours par défaut), quorum (aucun par défaut), seconde assemblée sans quorum, majorité par type de point, procurations par membre, vote à distance, délais de publication au Moniteur belge et de mise à jour du registre UBO.
- Planification : après la clôture de l'exercice, la tâche « Fixer la date de l'assemblée générale » avec la date limite (six mois après la clôture, calculée depuis l'exercice comptable). La date choisie crée les tâches : préparer les comptes et le budget, valider l'ordre du jour, envoyer l'invitation à J-15.
- Ordre du jour prérempli : approbation des comptes, budget, décharge, mandats qui arrivent à terme, points libres ; on ajoute admissions, sorties et mandats, on réordonne, on retire.
- L'invitation part d'elle-même à la date prévue (une seule fois) aux membres effectifs qui ont un compte, avec l'ordre du jour et le lien vers la page (réponse présent ou absent, procuration). Relance à J-5 à ceux qui n'ont pas répondu.
- Jour de l'AG : présences à cocher, procurations rattachées (au-delà du maximum : refusé ; un porteur ne donne pas la sienne), quorum calculé en direct ; vote point par point (pour, contre, abstention) et majorité vérifiée ; sans quorum, pas de vote et l'outil propose une seconde assemblée avec le même ordre du jour.
- Clôture : le PV est généré (présents, représentés, quorum, points et votes), modifiable jusqu'à la première signature, signé par le président et le secrétaire, puis rangé en PDF dans Documents (« Vie de l'ASBL · année · titre »).
- Suites : comptes approuvés (comptes vérifiés passés en approuvés, la tâche de dépôt suit) ; admission ou sortie adoptée = ligne du registre ; mandat adopté = fonction au registre et tâches « Publication au Moniteur belge » et « Mettre à jour le registre UBO » avec leurs délais.
- Le conseil d'administration utilise les mêmes outils, plus légers (administrateurs invités, sans quorum ni procuration).

## Vocabulaire

L'application parle d'« invitation » à l'assemblée.

## Limites

- Les membres sans compte ne reçoivent pas l'invitation par l'application ; le président les marque présents et note leur procuration.
- La signature du PV est une signature électronique simple (nom et horodatage), pas une signature qualifiée.
- Le rappel « décision non inscrite après 8 jours » n'a pas d'objet : une décision adoptée dans un PV est inscrite à la clôture. Le délai reste un réglage pour les décisions prises hors de l'application.
- Les comptes non vérifiés ne passent pas en approuvés : il faut d'abord les vérifier dans Comptes annuels.

## Vérification

- `npx vitest run tests/t17-association.test.ts tests/wave14.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/t17-association.integration.ts`) :
  - registre alimenté par un PV ;
  - ligne non modifiable et correction motivée ;
  - date limite de l'AG calculée depuis l'exercice ;
  - invitation envoyée une seule fois à J-15 ;
  - procuration au-delà du maximum refusée ;
  - quorum non atteint qui propose une seconde AG ;
  - PV généré et signé ;
  - tâches UBO et Moniteur après un changement d'administrateur ;
  - joueur non membre absent du registre ;
  - deux clubs.
- `npm run test:e2e:db` (`tests/e2e/association.spec.ts`) : 390 px, axe.
