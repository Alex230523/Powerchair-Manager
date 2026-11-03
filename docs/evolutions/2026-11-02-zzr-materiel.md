# Matériel, amélioré (02/11/2026)

Point 11 de l'avis, sur la page Matériel existante (Q1). Migration `0109_equipment_more.sql`.

## Modèles

- `chair_label()` en base et `chairLabel()` côté code : « Nom du fauteuil · Marque Modèle » dans le tableau, la fiche, la fiche joueur, les prêts, les lieux de stockage, les déplacements et la fiche de match.
- Un fauteuil sans modèle porte le badge « Modèle à choisir », un modèle en attente garde son badge ; « Choisir le modèle » ouvre sa fiche.

## Disposition

- Deux groupes d'onglets séparés visuellement : « Ce que nous possédons » (Fauteuils, Atelier, Petit matériel) et « Où et chez qui » (Prêts entre clubs, Lieux de stockage) ; Modèles reste réservé à la fédération. Un groupe sans onglet choisi reste joignable au clavier par son premier onglet.
- Le petit matériel garde son onglet, avec un filtre par catégorie ; recherche et filtre « État » alignés à la même hauteur.

## Prêter partout

- « Prêter » sur chaque ligne de fauteuil et de matériel, « Nouveau prêt » en tête de l'onglet Prêts (l'onglet « Prêter » de la fiche fauteuil reste).
- `equipment_loan` s'étend au matériel (`item_id`, `quantity`) et aux joueurs du club (`borrower_profile_id`) : un prêt direct part tout de suite et se termine par « Noter le retour ». Un fauteuil n'est jamais prêté deux fois sur les mêmes dates ; un prêt de matériel ne dépasse pas ce qui reste (quantité moins les prêts en cours) ; un club hors de la fédération est refusé.

## Catégories

- `equipment_category` par club : les dix catégories actuelles deviennent des catégories système (créées pour chaque club, renommables, jamais archivées ni fusionnées : les alertes batteries et trousse de secours continuent de les suivre) ; le club crée les siennes directement depuis le champ (« + Créer « ‹texte› » ») ; renommer, fusionner, archiver dans la carte « Catégories du matériel » de l'onglet Petit matériel.

## Lieux imbriqués

- `storage_location.parent_id` : « Local du club › Étagère A », deux niveaux au plus (refus du service et d'un déclencheur en base) ; sous-lieu facultatif ; arbre dans l'onglet Lieux avec ce qui est rangé à chaque niveau, chemin complet (`storage_path()`) partout ailleurs.

## Vérification

- `npx vitest run tests/equipment11.test.ts`.
- `npm run test:integration` (`tests/integration/equipment11.integration.ts`, et `wave17-equipment` adapté au libellé avec modèle) : libellé avec modèle, prêt à un club et à un joueur, double prêt refusé, 5 ballons sur 8 puis refus au-delà, catégorie créée à la volée et réutilisée, catégorie système non archivable, fusion, sous-lieu avec chemin complet, troisième niveau refusé, deux clubs.
- `tests/e2e/equipment11.spec.ts` avec axe et à 390 px.
