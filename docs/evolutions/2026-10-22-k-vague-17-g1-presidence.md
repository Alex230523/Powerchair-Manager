# Vague 17, G1 : transmission de la présidence depuis le club (22 octobre 2026)

Revue du 21 octobre, point G1.

## Transmettre la présidence
Dans Réglages › Membres et droits, le président (et lui seul) voit la carte « Transmettre la présidence ». Il y choisit :
- le nouveau président : une personne du club qui a un compte, ou l'email d'une nouvelle personne (avec son nom, facultatif) ;
- la date d'effet, facultative : sans date, la transmission a lieu dès l'acceptation ;
- ce qu'il garde ensuite : « Membre du club, sans mandat », « Coach » ou « Aucun rôle » ;
- un message.

## Effet
- Une invitation de président de club (I2) est envoyée. Tant qu'elle n'est pas acceptée, rien ne change. La carte montre la transmission en attente, et « Annuler la transmission » l'arrête. Une seule transmission à la fois : une nouvelle invitation remplace la précédente.
- Une transmission refusée (« Ce n'est pas mon rôle ») ou prise par une autre adresse ne change rien.
- À l'acceptation, tout se passe dans une seule transaction :
  - le nouveau mandat commence à la date d'effet ;
  - chaque autre mandat de président se termine exactement à ce moment, si bien que le club n'a jamais deux présidents ni aucun ;
  - le rôle choisi est créé pour l'ancien président (coach à la même date). Avec « Aucun rôle », s'il n'y a pas de date d'effet, il quitte aussi les membres du club ; avec une date, son mandat se termine simplement ce jour-là ;
  - une ligne est ajoutée au journal (`presidency.transferred`, avec qui part, ce qu'il garde et la date) ;
  - une notification part à la fédération et aux deux personnes.
- C'est la même fonction que le changement de président demandé par la fédération (I3) : `applySuccession` dans `src/domains/access/invite.ts`.

## Données
Migration `0059_presidency.sql` (ajouts seulement). Sur `invitation` : l'ancien président, le rôle qu'il garde et le message. La date d'effet utilise la colonne `valid_from` déjà présente.

## Tests
- Unitaires (`tests/wave17-presidency.test.ts`) : contrôles et textes en trois langues.
- Intégration (`tests/integration/wave17-presidency.integration.ts`) :
  - transmission proposée puis annulée ;
  - refus (contestation) ;
  - acceptation par une autre adresse refusée ;
  - acceptation : un seul président, l'ancien devenu coach, journal et notifications ;
  - date d'effet : un président et un seul à chaque instant ;
  - autre club et coach sans accès.
- Bout en bout (`tests/e2e/presidency.spec.ts`) : envoi, transmission en attente sans aucun changement, annulation, axe.
