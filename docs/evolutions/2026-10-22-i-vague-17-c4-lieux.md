# Vague 17, C4 : lieux, catégories, fiche complète et partage validé (22 octobre 2026)

Revue du 21 octobre, point C4.

## Deux catégories
Chaque lieu du club est classé dans une catégorie :
- « Entraînement et match » : une salle de sport, avec son accessibilité et son terrain ;
- « Autre lieu » : local, restaurant, salle de réunion ou hébergement.

Les lieux existants sont repris en « Entraînement et match ». La page « Salles » s'appelle maintenant « Lieux » et a deux onglets, un par catégorie. Chaque onglet montre :
- les lieux du club ;
- l'annuaire partagé de la fédération, filtré sur la même catégorie.

Dans le formulaire d'événement, la liste des lieux est groupée par catégorie. Pour un entraînement ou un match, les lieux d'entraînement et de match viennent en premier ; pour les autres événements, les autres lieux viennent d'abord.

## Fiche d'un lieu
La fiche contient :
- nom, adresse, catégorie ;
- accessibilité : accès PMR, toilettes, parking, rangement, recharge ;
- capacité ;
- « Notre salle d'entraînement (domicile) » : le point C5 s'en servira pour le transport ;
- personne de contact, choisie dans le Carnet de contacts ou créée dans la même fenêtre (elle rejoint le carnet avec l'étiquette « lieu ») ;
- politique sur la nourriture et les boissons ;
- notes.

Tarifs (table `venue_rate`) :
- chaque tarif a un libellé, un montant, une unité facultative et une date de début de validité ;
- la date d'ajout et l'auteur sont notés automatiquement ;
- l'historique reste visible, et le tarif en cours de chaque libellé porte le badge « En cours ».

Le contact, les tarifs, la nourriture et les notes ne sont visibles que par ceux qui gèrent les lieux (le président et `calendar.manage`).

## Une seule fenêtre de création
« Ajouter un lieu » ouvre la même fenêtre depuis trois endroits :
- la page Lieux ;
- l'en-tête du calendrier ;
- le choix du lieu dans le formulaire d'événement. Le lieu créé y est sélectionné tout de suite.

Les formulaires de lieu et de salle partagée qui se trouvaient en bas du calendrier sont retirés. Le calendrier garde un lien « Gérer les lieux ».

## Partage validé par la fédération
- Un lieu est privé par défaut.
- « Proposer au partage » le met « En attente de validation ».
- La fédération voit les propositions de ses clubs sur la page Lieux. Elle n'y voit que le nom, l'adresse, la catégorie et l'accessibilité.
- La fédération valide, ou refuse avec un motif. Les présidents du club reçoivent la décision dans leur boîte.
- Un lieu validé rejoint l'annuaire partagé avec ces seuls champs publics. Il est vu par les clubs de la même fédération et par la fédération, dans la page Lieux, le calendrier et les déplacements.
- Les salles déjà partagées passent en « Validé ». La fédération peut retirer une salle avec un motif.
- La fédération peut aussi créer une salle directement. Un club ne complète que les salles qu'il a proposées.

## Données
Migration `0057_places.sql` (ajouts seulement) :
- colonnes de catégorie, contact, nourriture, domicile et partage sur `calendar_place` ;
- table `venue_rate` ;
- catégorie et statut sur `shared_venue`.

L'action de calendrier `sharedVenue`, qui partageait sans validation, est retirée.

## Tests
- Unitaires (`tests/wave17-places.test.ts`) :
  - ordre des lieux selon l'événement ;
  - tarif en cours ;
  - champs partagés ;
  - contrôles ;
  - textes en trois langues.
- Intégration (`tests/integration/wave17-places.integration.ts`) :
  - fiche privée et contact créé ;
  - tarifs historisés ;
  - lieu invisible des autres clubs ;
  - proposition, refus sans motif interdit, validation ;
  - champs privés jamais partagés ;
  - annuaire limité à la fédération ;
  - retrait ;
  - reprise des salles existantes.

  `calendar` et `wave7` suivent la nouvelle règle de partage.
- Bout en bout (`tests/e2e/places.spec.ts`) :
  - deux onglets ;
  - fenêtre avec contact créé ;
  - tarif « En cours » ;
  - proposition validée par la fédération sans voir la fiche privée ;
  - fenêtre depuis le calendrier et ordre des lieux ;
  - axe et 390 px.

  `calendar.spec` crée son lieu par la fenêtre, et `new-pages` suit le nom « Lieux ».
