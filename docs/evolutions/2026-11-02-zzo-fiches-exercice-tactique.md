# Fiches exercice et tactique (02/11/2026)

Point 4 de l'avis. Extension des fiches exercices E2 (`/exercises`), sans les refaire. Migration `0106_exercise_tactics.sql` (additive, rejouable).

## Objectif et genre

- La liste fixe (technique, tactique, conduite, échauffement, jeu, autre) s'appelle désormais « Type » ; la colonne `objective` garde son nom, le filtre est inchangé.
- Nouveau champ « Objectif » en texte libre (500 caractères, colonne `goal`) ; les fiches existantes gardent leur type, leur objectif est vide.
- Genre « Exercice » ou « Tactique » (`genre`), même formulaire, même éditeur ; filtre Exercices / Tactiques en tête de la bibliothèque (`/exercises?genre=tactic` l'ouvre sur les tactiques).

## Tags

- `exercise_tag` (nom unique par club sans tenir compte de la casse, couleur parmi `c1` à `c8`, c'est à dire les variables `--chart-1` à `--chart-8`) et `exercise_tag_link`.
- Champ avec suggestions (combobox ARIA) : on tape, on choisit un ou plusieurs tags du club ; si rien ne correspond, « Créer le tag « ‹texte› » ». Dix tags au plus par fiche.
- L'ancien tableau `tags` est repris en tags du club puis vidé, pour qu'un second passage de la migration ne recrée rien.
- Tags sur les cartes, colonne « Tags » dans la vue Liste, filtre multi-tags (une fiche doit porter tous les tags cochés).
- Réglages › Activités : « Tags des fiches exercices » (renommer, couleur, fusionner avec un autre, supprimer), pour ceux qui écrivent les fiches.

## Éditeur de terrain

- `FieldEditor` (SVG, `src/components/field-editor.tsx`), sans bibliothèque. Les mesures du terrain (terrain de basket 28 x 15 m, buts de 6 m, zones de but de 5 x 8 m, rond central) sont dans `src/domains/exercises/drawing.ts` et sont à recaler sur le règlement FIPFA en vigueur si besoin.
- Objets : joueurs des équipes A et B (rond numéroté, couleur d'équipe et lettre A/B), gardiens (carré), ballon, cône, plot, chaise, zone rectangulaire, zone libre (polygone), texte ; flèches de déplacement (pleine) et de passe ou tir (pointillée).
- Situations (jusqu'à 8) en onglets, nommables, dupliquer et supprimer ; vue entière ou demi-terrain.
- Souris et doigt (glisser), et sans glisser (WCAG 2.5.7) : outil puis toucher pour placer, champs X/Y, flèches à l'écran. Clavier : Tab pour passer d'un objet à l'autre, flèches pour déplacer (Maj pour 2 m), Suppr, Ctrl+Z / Ctrl+Y. Description texte générée (`describeSituation`, `src/components/field-copy.ts`) reliée au terrain pour les lecteurs d'écran.
- Stockage JSON dans `exercise_drawing` (256 ko au plus, validé par Zod) ; export PNG et PDF (A4 paysage, construit dans le navigateur par `src/lib/image-pdf.ts`) ; l'impression de la fiche et du programme d'entraînement inclut le dessin. Le téléversement d'image ou de PDF reste possible.

## Tactiques d'un match

- `match_tactic` : depuis la fiche du match, carte « Tactiques » et « Ajouter une tactique » (une ou plusieurs fiches, avec des notes du coach). Une journée de tournoi passe par les matchs du club de cette journée.
- Les joueurs invités au match (invitation non retirée) et leurs parents voient ces fiches en lecture seule, sans les notes du coach ; les autres joueurs ne les voient pas (le schéma téléversé passe par `/api/matches/journey/tactic`, avec le même contrôle).

## Compteur et créateur

- « Utilisée dans N entraînements et M matchs ».
- « Créée par ‹nom› (‹club›) » toujours affiché, conservé après duplication et copie (`origin_exercise_id`, `origin_author`, `origin_club`).

## Bibliothèque fédérale

- « Proposer à la bibliothèque fédérale » met la fiche en attente (`federal_status`), sur le modèle du partage validé des lieux (C4). Pas d'envoi de club à club.
- La fédération (présidence, ou délégué avec la compétence formations `federation.courses`) valide (un instantané est publié dans `federal_exercise`, dessin et schéma compris, jamais les notes de programme ou de match) ou refuse avec un motif (3 caractères au moins, affiché sur la fiche du club) ; elle peut publier ses propres fiches et retirer une fiche publiée. Entrée « Fiches exercices » dans son menu.
- Onglet « Bibliothèque fédérale » pour les clubs de la fédération : recherche, genre, type, tag, aperçu, « Copier dans notre bibliothèque » (copie indépendante, tags recréés dans le club, créateur d'origine conservé) et « Copiée par N clubs » (`federal_exercise_copy`, une ligne par club). Un club d'une autre fédération ne voit rien et ne peut rien copier.

## Vérification

- `npx vitest run tests/exercises4.test.ts` : commandes, dessin, déplacement au clavier, description, PDF, textes, menu, migration.
- `npm run test:integration` (`tests/integration/exercises4.integration.ts`) : objectif repris, tag créé à la volée puis réutilisé, fusion, dessin réimprimé, tactique vue par l'invité et refusée au non invité, compteur, proposition validée, copie indépendante, refus motivé, club d'une autre fédération exclu, anciens tags repris une seule fois.
- `tests/e2e/exercises4.spec.ts` avec axe et à 390 px : fiche tactique, tag créé, terrain édité au clavier, vue liste, proposition, validation, copie, réglages des tags.
