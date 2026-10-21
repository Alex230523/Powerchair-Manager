# Vague 15, observation C4 : taille du texte et contraste renforcé (21 octobre 2026)

Pas de migration.

## Réglages personnels

Dans le menu du compte (pied de la barre latérale) et dans Réglages > Mon compte (« Taille du texte et contraste », trouvable par la recherche des Réglages) :

- **Taille du texte** : Normal (100 %), Grand (112,5 %), Très grand (125 %), en boutons groupés. Appliquée par l’attribut `data-text-size` sur `<html>`.
- **Contraste renforcé** : case à cocher. Attribut `data-contrast="more"` ; décocher pose `data-contrast="normal"`, ce qui refuse aussi la demande du système.

Effet immédiat, mémorisé sur l’appareil (localStorage avec try/catch) et appliqué avant l’affichage par le même script que le thème (`themeScript`), donc sans flash.

## Feuille de style

- La racine passe à `font-size: 100 %` (1rem = 16 px en « Normal ») ; le texte courant reste à 14 px par `--text-base`.
- Les jetons `--text-*`, `--space-*` et `--sidebar-width` sont en rem, ainsi que les hauteurs des composants (boutons, champs, lignes de tableau de 44 px, cibles tactiles) et les dernières tailles de police en px. Les valeurs déjà en rem (calculées sur l’ancienne racine de 14 px) sont converties pour garder exactement le même rendu en « Normal ».
- Contraste renforcé : `--muted` au niveau de `--text`, bordures `--border-strong` partout (y compris les lignes de grille), contour des champs au niveau du texte, liens soulignés, états actifs (`aria-current`, `aria-pressed`, `aria-selected`) entourés de 2 px. Activé aussi automatiquement par `@media (prefers-contrast: more)`, sauf refus explicite.
- En « Très grand », la barre latérale grandit avec le texte (20rem) ; à 1280 px le contenu garde 960 px, sous 1024 px c’est déjà le tiroir.

## Tests

- Unitaires : le test des jetons de la vague 13 lit maintenant l’échelle en rem (toujours 12 px au minimum, 14 px de base).
- Bout en bout (`tests/e2e/display-size.spec.ts`) : choix dans le menu, effet immédiat (texte à 17,5 px), mémorisation au rechargement, tableau de bord et fiche joueur en « Très grand » à 1280 et 390 px sans débordement, gris au niveau du texte et axe en contraste renforcé.

## Vérification

`npm run check`, `npm run test:e2e:db`.
