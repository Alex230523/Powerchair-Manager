# Ergonomie : champs, à faire, sections du formulaire, menu (04/11/2026)

Retours du propriétaire sur l'aperçu.

## Champs de saisie

Une seule apparence pour tous les champs (texte, nombre, date, recherche, listes, textes longs) : même hauteur, même bordure, mêmes coins, même marge intérieure, même taille de texte. Les listes dessinent leur propre flèche au lieu de celle du navigateur (Safari affichait des listes grises et brillantes). Exclus volontairement : cases à cocher, boutons radio, fichiers, capsules de la barre du haut, fenêtre de commande, choix segmentés et pastilles. Règle unique en fin de `globals.css`.

## « À faire » de l'accueil

Une seule liste au lieu de six cartes et d'une ligne « Aussi » : une ligne par chose à faire, la plus urgente en premier (rouge, puis orange, puis le reste ; le plus grand nombre d'abord), avec le nombre, une phrase courte et le lien vers la page où agir. Ce qui est à jour tient sur une ligne discrète en dessous.

## Formulaire d'inscription

Nouveau type de question « Titre de section » : il regroupe les questions qui suivent, que la personne qui remplit replie et déplie. Une section n'est jamais répondue ni obligatoire ; une question obligatoire dans une section repliée la rouvre. Le modèle « Inscription d'un joueur » a quatre sections : Le joueur, Coordonnées, Santé et équipement, Accords et paiement.

## Menu et affichage

- « Nouveau » : trois badges au plus dans le menu, et le badge d'une page disparaît dès qu'on l'ouvre.
- Présences : le bouton « Exporter en Excel » a sa propre ligne, au-dessus de l'en-tête du tableau.
- Mes équipes : la ligne isolée « Mes équipes » en bas de page est retirée, ainsi que le lien « Équipes du club ↓ » qui ne menait nulle part sur cette page.

## Vérification

- `tsx tests/ergonomie-1104.test.ts`, `tsx tests/news.test.ts`
- `playwright test tests/e2e/ergonomie.spec.ts` (axe, 390 px)
