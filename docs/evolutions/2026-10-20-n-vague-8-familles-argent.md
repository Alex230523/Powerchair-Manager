# Vague 8 : attestations mutuelle, réduction fratrie, levée de fonds, absences annoncées, passage de saison, fidélisation (20 octobre 2026)

Reprises de PRÊT, adaptées au powerchair football.

## Attestations pour la mutuelle

- Cotisations, bouton **Attestations pour la mutuelle** : une attestation par personne et par saison, dès que la cotisation de la saison est entièrement payée (paiements rattachés en trésorerie).
- Le trésorier voit tout le club et imprime toutes les attestations d'un coup (une par page) ; un joueur ou une famille voit les siennes et les imprime ou les enregistre en PDF.
- L'attestation reprend le club, son adresse, son numéro d'entreprise (BCE), sa fédération, la personne et sa date de naissance, la saison, le montant payé et la date du dernier paiement, la date du jour, le signataire et une place pour la signature.
- Gestion du club, nouvelle rubrique **Pour les documents officiels** : adresse du siège, numéro d'entreprise, signataire.

## Réduction fratrie

- Sur chaque barème de cotisation : pourcentage pour le **2e enfant** et pour les **suivants**. L'aîné paie le plein tarif.
- Les fratries se déduisent des parents ou représentants communs. Le rang suit l'âge, et se recalcule à chaque nouvelle cotisation, à chaque annulation et à chaque changement de règle.
- Une cotisation déjà payée (même en partie) ou avec une réduction posée à la main n'est jamais modifiée.

## Levée de fonds

- Menu Finances, **Levée de fonds** (module activable) : des **groupements** (comité de soutien, projet) contiennent des **cagnottes** avec un objectif et une échéance.
- Mouvements : dons, sponsors, actions (souper, vente), subsides, et dépenses de l'action déduites. Barre de progression, reste à récolter, objectif atteint.
- **À part de la trésorerie** : rien n'est écrit dans les comptes du club ; le trésorier encode de son côté.
- Les membres voient la progression et les actions menées ; les montants et les donateurs restent aux responsables de la trésorerie.
- **Page publique** à partager avec les sponsors : objectif et progression, jamais les donateurs. Elle disparaît si le module est coupé ou la page retirée.

## Absences annoncées

- Présences, rubrique **Absences annoncées** : un joueur, une famille ou le staff annonce une absence sur une période (maladie, blessure, fauteuil en panne, transport, école ou travail, famille, autre).
- Toutes les séances de la période sont répondues « absent » avec le motif, **y compris celles planifiées ensuite**. Annuler l'annonce rouvre les réponses à venir.
- Chaque réponse « absent » porte désormais un motif ; répondre « présent » l'efface.

## Passage de saison

- Gestion du club, lien **Passage de saison** : nom et dates proposés (un an plus tard), équipes recopiées, personnes cochées réinscrites dès le premier jour (les inactifs ne le sont pas), barèmes de cotisation recopiés un an plus tard avec leur réduction fratrie, ancienne saison archivée au choix.
- Les appartenances de l'ancienne saison se terminent avec elle ; l'historique est gardé.

## Fidélisation

- Statistiques, carte **Fidélisation des joueurs** : par saison, joueurs, restés, arrivés, partis et taux de réinscription. Une personne compte une fois par saison.

## Tests

- Unitaires (`tests/wave8.test.ts`) : rangs dans les fratries, réductions, progression d'une cagnotte, fidélisation, dates et noms de saison, conditions de l'attestation.
- Intégration (`tests/integration/wave8.integration.ts`) : réduction fratrie recalculée sans toucher ce qui est payé, attestations d'une famille, levée de fonds séparée des comptes et page publique sans donateurs, absences annoncées appliquées aux séances futures puis rouvertes, passage de saison complet.
- Bout en bout : levée de fonds, attestations, passage de saison, avec contrôle axe.
