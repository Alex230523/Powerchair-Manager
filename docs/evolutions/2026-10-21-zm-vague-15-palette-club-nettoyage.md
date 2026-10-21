# Vague 15, prompt 2.9 : palette du club et nettoyage final (21 octobre 2026)

Migration `0041_club_palette.sql` (ajouts) : `organization.theme_palette` (night, bordeaux, aubergine, brown ; défaut night) et `organization.theme_tint` (neutral, light, strong ; défaut light).

## Nettoyage de la feuille de style

- **Alias de la vague 13 supprimés** : `--ink`, `--line`, `--line-strong`, `--bg`, `--surface-2`, `--surface-3`, `--accent*`, `--on-accent`, `--brand-50` à `--brand-900`, `--radius`, `--radius-lg`, `--shadow-sm`, `--shadow`, `--font`. Leurs usages (environ 200 dans la feuille, aucun dans les composants) portent maintenant les nouveaux noms, y compris les quelques variables inexistantes écrites avec une valeur de secours (`--radius-s`, `--brand-soft`, `--brand-ink`, `--font-serif`).
- **Couleurs écrites en dur remplacées** par des variables, impression comprise (`--print-paper`, `--print-ink`, nouveau `--print-muted`) : il ne reste de couleurs que dans les jetons, les palettes et le bloc d’impression (vérifié par un test).
- **Tailles de police** : toutes sur l’échelle `--text-*` (les titres h3 passent à `--text-md`).
- **CSS morte supprimée** : les règles dont aucune classe n’est utilisée dans le code (ancien calendrier mois et semaine, `quick-links`, anciennes cartes de subsides, `sibling-rule`, `embed-code`…) et deux blocs `@media` vides.
- Le test des jetons (`tests/wave13-design.test.ts`) vérifie maintenant qu’aucun alias ne subsiste.
- **Non fait volontairement** : le déplacement complet de la feuille en couches (jetons, base, composants, mise en page, modules, responsive, impression). Les règles des modules et leurs variantes responsives sont imbriquées depuis quinze vagues ; les déplacer change l’ordre de la cascade, ce qui ne se vérifie qu’à l’œil, page par page. Les jetons sont déjà en tête, suivis de la base ; je propose de faire ce déplacement à part, avec des captures avant et après.

## Palettes

- Attribut `data-palette` (et `data-tint`) sur `<html>`, chaque palette écrite une fois en `light-dark()` : Bleu nuit (défaut, valeurs actuelles), Bordeaux, Violet aubergine, Brun profond, avec les valeurs claires demandées et des versions sombres. Les couleurs sémantiques, d’équipe, de type d’événement et `--chart-*` ne changent jamais.
- Contrastes mesurés comme le tableau de la vague 13 (texte, gris, titres sur fond, fond doux et surface ; liens ; texte des boutons) : tous au-dessus de 4,5:1 en clair et en sombre. Seul le gris du Brun profond échouait (4,4:1 sur le fond d’accent) : il passe à `#706459` (4,7:1). Un test unitaire recalcule ces rapports depuis la feuille.
- **Teinte du fond** : Neutre (`#FAFAFA`), Légère (défaut, fond de la palette), Marquée (fond mélangé à 4 % de la primaire avec `color-mix`). Les cartes restent blanches.

## Interface

Réglages > Club, sous l’identité : carte « Apparence » avec quatre cartes de palette cliquables (aperçu : titre serif, bouton, pastille, carte, chacune dans ses propres couleurs), boutons groupés pour la teinte, aperçu en direct sur toute la page (et retour à la palette enregistrée si l’on quitte sans enregistrer), « Enregistrer ». Droit de gestion du club, validation Zod, journal d’audit. Le thème clair ou sombre reste personnel. La galerie `/design` montre les quatre palettes en clair et en sombre. « Bien démarrer » (C3) compte maintenant neuf étapes, dont le choix de la palette.

## Sans flash

- Le layout serveur pose `data-palette` et `data-tint` sur `<html>` à partir du club actif de la session (en cas de souci, bleu nuit par défaut, jamais d’erreur).
- Les pages publiques (inscription, cagnotte) prennent la palette du club propriétaire, par un petit script en tête de page.
- La couleur de la barre du navigateur (`theme-color`) suit la primaire du club.

## Tests

- Unitaires (`tests/wave15-palettes.test.ts`) : palettes et noms identiques à la migration, contrastes recalculés en clair et en sombre, couleurs sémantiques inchangées, textes fr/nl/en, attributs posés par le serveur et pages publiques, aucune couleur hors jetons, tailles sur l’échelle ; `tests/wave13-design.test.ts` adapté.
- Intégration (`tests/integration/wave15-palette.integration.ts`, deux clubs) : bleu nuit par défaut, enregistrement limité au club actif avec ligne d’audit, refus pour l’autre club, pour un entraîneur et pour une palette inconnue (Zod et contrainte en base).
- Bout en bout (`tests/e2e/palettes.spec.ts`) : choix avec aperçu en direct, enregistrement, attribut et `theme-color` dans le HTML du serveur, page publique de cagnotte, puis accueil, joueurs, fiche joueur, calendrier et réglages dans les quatre palettes, en clair et en sombre, à 1440 et 390 px : pas de débordement, axe sans erreur à 1440 px, une capture par page dans `test-results/palettes` (artefact de la CI).

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
