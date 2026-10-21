# Vague 15, observation C8 : tableaux triables, sélection multiple et actions groupées (21 octobre 2026)

Pas de migration.

## Le composant

`DataGrid` (`src/components/data-grid.tsx`) s’appuie sur `DataTable` (vague 13 : en-tête collant, lignes de 44 px) et ajoute :

- **Tri** : clic sur un en-tête triable (flèche discrète), `aria-sort` sur la colonne triée, ordre croissant puis décroissant, tri mémorisé dans l’adresse (`?sort=nom`, `?sort=-nom`) et retrouvé après un rechargement. Accents et majuscules ignorés, nombres triés comme des nombres, valeurs vides toujours en dernier.
- **Sélection** : case en première colonne, case « Tout sélectionner » dans l’en-tête avec état intermédiaire, Maj+clic (ou Maj+Espace au clavier) pour une plage. La sélection ne porte que sur les lignes affichées ; un filtre ou un rechargement retire les lignes disparues.
- **Barre d’actions** : dès qu’une ligne est cochée, une barre en bas de la carte, juste sous le tableau (fond `--primary`, texte blanc, arrondi 14 px). Elle reste dans le flux de la page plutôt que de flotter par-dessus les lignes : elle ne cache ainsi jamais une ligne ni le focus du clavier (WCAG 2.4.11) : « 4 sélectionnés », les actions du module, « Désélectionner ». Une action peut demander un choix (l’équipe, le statut) ou une confirmation. Chaque action passe par le service du module, un appel par ligne, donc avec la vérification des droits ligne par ligne ; le résumé s’affiche et est annoncé (« 3 réussies, 1 refusée : droits insuffisants »). Les lignes refusées restent cochées.
- **Colonnes** : menu « Colonnes » pour masquer ou afficher, mémorisé sur l’appareil (localStorage avec repli en mémoire).
- **Téléphone** : la case et la première colonne restent visibles quand le tableau défile horizontalement.
- Pages de 50 lignes avec « Afficher plus », après le tri.

Règles pures (tri, plages, case d’en-tête, résumé, CSV) dans `src/components/table-state.ts`, textes dans `table-copy.ts` et `bulk-copy.ts` (fr, nl, en).

## Utilisation

- **Joueurs** (et coachs) : affecter à une équipe (choix de l’équipe ouverte), écrire un email (ouvre la messagerie de l’ordinateur avec les adresses en copie cachée ; les personnes sans adresse sont signalées), exporter la sélection en CSV, passer dans les anciens ou réintégrer.
- **Membres** (annuaire du club) : changer le statut (actif, inactif, archivé), exporter.
- **Inscriptions** : accepter, refuser (avec confirmation). Le service vérifie la version et les doublons ; un doublon possible est refusé et reste à traiter dans la fiche.
- **Cotisations** : envoyer un rappel (même envoi que la page Rappels), exonérer. Nouvelle commande `exempt` du service des cotisations : remise totale, échéances à 0, rang de fratrie retiré pour que la règle des frères et sœurs ne la recalcule pas, ligne dans l’historique ; refusée dès qu’un paiement existe (« paiement déjà reçu »).
- **Documents** : relancer (un rappel par personne, quel que soit le nombre de ses documents cochés ; les documents du club, sans personne, sont signalés).
- **Matériel** : le tableau du stock (archiver, exporter). La modification d’un article s’ouvre au-dessus du tableau. Les fauteuils restent en cartes, avec leurs actions sur chaque carte.

Le CSV utilise le point-virgule (Excel en Belgique), un BOM UTF-8 et neutralise les formules.

## Tests

- Unitaires (`tests/wave15-tables.test.ts`) : tri (adresse, accents, nombres, vides), plages dans les deux sens, case d’en-tête, nettoyage de la sélection, appels ligne par ligne et résumé, CSV, textes fr/nl/en sans tirets, utilisation dans les six listes, `aria-sort`, aucun style en ligne.
- Intégration (`tests/integration/dues.integration.ts`) : exonération sans paiement, refus après un paiement, refus sans droit et dans un autre club.
- Bout en bout (`tests/e2e/data-tables.spec.ts`) : tri par nom et adresse après rechargement, sélection au clavier avec Maj, état intermédiaire, export, exonération groupée avec une ligne refusée, 390 px, axe.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
