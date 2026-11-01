# Vague 17, Q1 : matériel, modèles, prêts, stockage, petit matériel (22 octobre 2026)

Revue du 21 octobre, point Q1.

## Onglets
La page Matériel a des onglets, chacun avec sa liste, ses filtres et son bouton « Ajouter » :
- **Fauteuils** : un tableau avec le modèle et la date d'achat en colonnes, l'état, les joueurs, le lieu de stockage et la prochaine révision ; filtres par état, modèle et lieu ; export Excel ;
- **Petit matériel** : chargeurs, balles, cônes (nouvelle catégorie), batteries, pièces, maillots, trousse de secours, et les demandes d'achat ;
- **Prêts entre clubs** : les fauteuils disponibles au prêt, mes prêts et demandes reçues, mes emprunts ;
- **Lieux de stockage** ;
- **Modèles de fauteuils**, pour la fédération.

## Fiche fauteuil
Le bouton « Gérer » disparaît : un clic sur le nom du fauteuil ouvre sa fiche dans une fenêtre. « Agrandir » ouvre la même fiche en pleine page (`/equipment/[id]`), comme la fiche joueur (J1).

En tête de fiche : le modèle, la date d'achat et l'état. Onglets :
- Fiche ;
- Modifier ;
- Prêter : à un joueur du club (l'attribution existante) ou à un autre club ;
- Entretien : noter une révision et la suivante ;
- Historique : créations, modifications, attributions, révisions et chaque étape d'un prêt.

Le modèle et la date d'achat sont obligatoires.

## Modèles
Table `chair_model` (marque, nom, statut validé, proposé ou refusé, club qui propose, fédération qui décide). La liste commune démarre avec Equalizer, Storm et Strike Force.

Dans la fiche, on choisit un modèle validé ou « Proposer un nouveau modèle ». En attendant la décision, le fauteuil affiche « En attente de validation ». La fédération valide ou refuse dans son onglet « Modèles de fauteuils ».

`equipment_chair.model_id` remplace le texte libre. La migration `0061` rapproche les textes existants d'un modèle de la liste ou les crée « proposés ». Les colonnes texte restent, tenues à jour, pour les écrans plus anciens.

## Lieux de stockage
Table `storage_location` : nom, lieu du club, adresse, contact, accès, remarques. Fauteuils et petit matériel choisissent un lieu ; le texte libre actuel est repris par la migration. L'onglet montre ce qui est stocké à chaque endroit.

## Prêts et flotte de la fédération
Un fauteuil peut être marqué « Prêtable ». Table `equipment_loan` : fauteuil, prêteur, emprunteur, dates, conditions, caution facultative, statut, état au départ et au retour.

Déroulé d'un prêt :
- un club demande un prêt depuis « Fauteuils disponibles au prêt » ;
- ou le prêteur prête directement depuis la fiche ;
- le prêteur accepte ou refuse, remet le fauteuil (état au départ), puis note le retour (état au retour) ;
- une demande ou un prêt pas encore remis peut être annulé.

Les dates déjà prises sont refusées. L'emprunteur ne voit du fauteuil que son nom, son modèle, son propriétaire, son lieu de stockage et les dates. Pendant le prêt, il apparaît chez lui avec « Prêté par [club] jusqu'au ... ».

Sept jours avant la date de retour, un rappel part aux deux clubs, une seule fois (tâche quotidienne du worker, `equipmentLoanTick`).

La fédération gère sa propre flotte (fauteuils dont elle est propriétaire) avec les mêmes écrans, depuis « Matériel » dans son menu. Ses fauteuils prêtables sont proposés à ses clubs. Hors prêt, deux clubs ne voient jamais le matériel l'un de l'autre.

## Tests
- Unitaires (`tests/wave17-equipment.test.ts`) : catégorie cône, liste de départ et reprise des textes, disponibilités, étapes d'un prêt, rappel, commandes, textes en trois langues.
- Intégration (`tests/integration/wave17-equipment.integration.ts`) :
  - modèle obligatoire, proposé puis validé ;
  - stockage par lieu ;
  - clubs isolés hors prêt, une autre fédération exclue ;
  - prêt entre deux clubs (demande, acceptation, remise, rappel, retour) ;
  - prêt direct ;
  - flotte fédérale visible des clubs.
  Les tests existants qui créaient un fauteuil donnent maintenant un modèle et une date d'achat.
- Bout en bout (`tests/e2e/equipment-loans.spec.ts`) : fiche ouverte par le nom et en pleine page, modèle validé par la fédération, lieu de stockage, prêt entre deux clubs avec le badge de l'emprunteur, axe et 390 px.
