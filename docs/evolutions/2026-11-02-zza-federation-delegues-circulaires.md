# Fédération : rôles délégués, tableau de bord et circulaires (02/11/2026)

Points 32 et 33 de l'avis. Le président fédéral distribue des compétences (rôles délégués) sur le même mécanisme que les rôles de staff des clubs (point 7) ; l'accueil fédéral suit ces compétences ; la fédération envoie des circulaires officielles. Migration `0094_federation_delegates.sql` (additive).

## Partie 1 : rôles délégués

- Huit compétences, codes de droits dédiés : `federation.referees`, `federation.competitions`, `federation.discipline`, `federation.classification`, `federation.licences`, `federation.courses`, `federation.communication`, `federation.finance`. La présidence fédérale les a toutes ; la présidence d'un club n'en a aucune.
- Elles remplacent les contrôles « président ou travailleur » dans les services fédéraux :
  - licences et classifications, clubs, équipes, affiliations, transferts : licences (et classification pour les demandes, finances pour les affiliations) ;
  - désignations d'arbitres : arbitrage ;
  - tournois, lieux partagés, flotte de fauteuils : compétitions ;
  - formations : formations ;
  - guide du jeu : communication ;
  - to-do fédérale : n'importe quelle compétence.
- Les travailleurs fédéraux qui existaient gardent tout ce qu'ils faisaient : toutes les compétences, comme ajustement personnel.
- Huit rôles proposés, une phrase chacun, modifiables, rôles libres possibles : responsable arbitrage, compétitions, discipline, classification, licences et affiliations, formations, communication, trésorier fédéral.
- Page « Équipe fédérale » (présidence) : désigner une personne qui a déjà un compte (arbitre de la fédération, président ou coach d'un club affilié) ou inviter par email, un ou plusieurs rôles, une durée (jusqu'à nouvel ordre par défaut), fin de délégation, journal des changements. La personne garde ses autres rôles et choisit son profil dans la barre du haut.
- Un délégué président de club ne voit, par son rôle fédéral, que ce que la fédération voit : aucune donnée de santé, aucune finance de club.
- Le menu fédéral suit les compétences.

## Partie 2 : tableau de bord fédéral

Cartes selon les compétences, chacune menant à sa liste : clubs affiliés et sans présidence active, licenciés par saison et par catégorie (barres sur plusieurs saisons), affiliations en retard, classifications demandées, matchs sans arbitre désigné, rapports de match en attente, prochaines journées de classification et de tournoi, demandes à valider (lieux, modèles de fauteuils, formations).

## Partie 3 : circulaires

- Une circulaire : titre, texte, pièces jointes (PDF, PNG, JPEG), destinataires (présidents, coachs, arbitres, tous les membres ; clubs choisis ou tous), date d'envoi (tout de suite ou programmée, envoyée par la tâche quotidienne), accusé de lecture obligatoire facultatif. Rédaction réservée à la compétence communication.
- Réception : notification et email dans la langue du destinataire ; page « Circulaires » dans le menu des clubs et des arbitres ; ouverte = lue ; bouton « J'ai lu » si l'accusé est demandé.
- Suivi : taux de lecture et d'accusés, non-lus par club (noms), relance groupée (au plus une par jour et par personne), export CSV.

## Limites

- Les sanctions et recours (discipline, point 34) et les finances de la fédération (point 35) n'existent pas encore : leurs compétences sont prêtes, leurs cartes viendront avec eux.
- « Les fiches de la bibliothèque » à valider n'existent pas dans l'application : pas de carte.

## Vérification

- `npx vitest run tests/federation-delegates.test.ts tests/wave16-federation.test.ts tests/wave6.test.ts`
- `npm run test:integration` (`tests/integration/federation-delegates.integration.ts`, deux fédérations) :
  - délégué arbitrage qui désigne mais ne voit ni affiliations ni clubs ;
  - arbitre devenu délégué qui garde son espace arbitre ;
  - président de club délégué sans droit privé, son mandat de club inchangé ;
  - cartes selon les compétences ;
  - circulaire avec accusé, relance des non-lus, export ;
  - autre fédération isolée.
- `club-coaches` et `wave16-federation` adaptés : un délégué sans la compétence ne lit ni les formations ni les clubs.
- `tests/e2e/federation-delegates.spec.ts` à 390 px avec axe.
