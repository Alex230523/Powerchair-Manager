# Vague 17, G2 : export Excel partout (22 octobre 2026)

Revue du 21 octobre, point G2.

## Un seul composant
`ExportButton` (dans `src/components/export-button.tsx`, réexporté par `ui.tsx`) ajoute « Exporter en Excel » sur une liste. Il ouvre une fenêtre avec :
- le choix des colonnes ;
- le format, Excel par défaut, ou CSV ;
- « Télécharger ».

L'export reprend les lignes affichées, donc les filtres, l'équipe et la saison en cours.

Le fichier est écrit côté serveur (`/api/exports`, `src/domains/exports`) avec `src/lib/xlsx.ts`, qui sait maintenant écrire des cellules typées :
- en-tête en gras, première ligne figée ;
- montants en nombres à deux décimales ;
- dates en vraies dates ;
- comptes en nombres entiers ;
- textes toujours en texte, jamais lus comme une formule.

Le nom du fichier est clair, par exemple `mon-club-cotisations-2026-27.xlsx`.

## Où
- Statistiques :
  - « Exporter en Excel » dans le menu « ... » de chaque graphique ;
  - un bouton pour l'onglet entier, sur une feuille d'une ligne par chiffre avec sa section.
- Joueurs, Coachs, Anciens joueurs : l'export existant (`ExportDialog`, avec sa version imprimable), dont le fichier Excel est maintenant typé (dates de naissance et d'entrée en dates, âge et numéro en nombres).
- Membres (Réglages › Membres et droits).
- Présences :
  - l'appel affiché ;
  - la grille de la saison, une colonne par séance ;
  - les statistiques par joueur.
- Cotisations.
- Finances : opérations, budget, affiliations.
- Sponsors et Subsides.
- Matériel (fauteuils).
- Inscriptions : les dossiers affichés, avec les réponses à leur formulaire.
- Matchs.

## Droits et journal
L'export ne contient que ce que la page montre, et la page ne reçoit que ce que la personne a le droit de voir. Les réponses confidentielles d'un dossier d'inscription, par exemple, n'y figurent qu'avec le droit correspondant.

Chaque export est noté dans le journal (`export.<liste>`) : qui, le format, le nombre de lignes et les colonnes. L'export des personnes l'était déjà.

## Tests
- Unitaires (`tests/wave17-exports.test.ts`) :
  - cellules typées relues dans le fichier : montant, date, nombre, texte non interprété, en-tête figé et en gras, styles ;
  - nom de fichier ;
  - contrôles ;
  - colonnes typées de l'export des personnes ;
  - textes en trois langues.
- Intégration (`tests/integration/wave17-exports.integration.ts`) : fichier Excel typé relu, CSV à deux décimales, journal écrit, contexte d'un autre club refusé.
- Bout en bout (`tests/e2e/exports.spec.ts`) : un export par page (membres, matchs, cotisations, opérations, budget, affiliations, sponsors, subsides, matériel, inscriptions, statistiques des présences, statistiques), le nom du fichier, le journal, axe sur la fenêtre.
