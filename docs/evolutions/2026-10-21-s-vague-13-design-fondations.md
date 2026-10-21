# Vague 13, prompt 2.1 : fondations du design « minimalisme chaleureux » (21 octobre 2026)

Cette livraison ne touche qu'aux fondations : polices, variables, mode sombre, typographie de base, logo. Les composants partagés et la migration des pages suivent (prompt 2.2). Aucune migration de base de données.

## Polices

`src/app/fonts.ts` charge DM Sans (400, 500, 600, 700) et Source Serif 4 (600, 700) avec `next/font/google`, sous-ensembles latin et latin-ext, `display: swap`. Les deux layouts (`[locale]` et `(entry)`) posent les variables `--font-dm-sans` et `--font-source-serif` sur `<html>`. Les polices sont servies par le site : aucun `@import` ni lien vers Google (hors ligne et RGPD). `globals.css` lit `--font-ui: var(--font-dm-sans), system-ui, sans-serif` et `--font-display: var(--font-source-serif), Georgia, serif`.

## Variables (`:root` de `globals.css`)

- Couleurs claires : primaire `#213C60` (survol `#2F5078`, texte dessus blanc), titres `#1A3655`, texte `#283444`, secondaire `#5F6E80`, fond `#F9FBFE`, carte `#FFFFFF`, fond doux `#F4F7FB`, accent doux `#E8EFF6`, bordures `#E5EBF2` et `#D3DCE6`, lignes de grille `#E9EDF2`, focus `#2F73A8`.
- Familles sémantiques (teinte pleine, fond doux, encre) : succès `#357B58 / #E6F2EC / #24583E`, avertissement `#B97008 / #FBF0DC / #9A5B06`, danger `#C24741 / #F9E6E5 / #9E322D`, info `#4B91C8 / #E4F0F9 / #29679A`. Du texte n'utilise jamais la teinte pleine warning ou info.
- Palette des graphiques `--chart-1` à `--chart-8`, indépendante de la primaire.
- Arrondis 8, 12, 14, 20 px et pilule ; ombres `--shadow-card`, `--shadow-hover`, `--shadow-pop` ; espacements `--space-1` à `--space-12` ; échelle de texte 12 à 30 px (`--text-xs` à `--text-2xl`), rien en dessous de 12 px ; dimensions (menu 256 px, barre 60 px, marge de contenu `clamp(16px, 3vw, 40px)`, carte 24 px, écart 16 px) ; `--transition: 180ms ease-out`.
- Le menu de gauche devient une colonne blanche : ses jetons (`--sidebar-*`) pointent vers la carte, le texte, la bordure et l'accent doux ; seule l'entrée active porte la primaire.

Trois écarts par rapport aux valeurs demandées, mesurés et assumés :

- `--muted` passe de `#5F6E80` à `#5A697B` : la valeur demandée lisait à 4,49:1 sur l'accent doux `#E8EFF6` (entrée de menu active, puces), juste sous 4,5:1.

- `--info-ink` passe de `#2F73A8` à `#29679A` : la valeur demandée lisait à 4,4:1 sur le fond info `#E4F0F9`, sous le minimum de 4,5:1.
- `--border-strong` (`#D3DCE6`) lit à 1,4:1 sur blanc, bien sous les 3:1 attendus pour la bordure d'un champ (WCAG 1.4.11). Un jeton dédié `--field-border` (`#8290A1` en clair, `#64758A` en sombre, 3,1 à 3,9:1) habille les champs ; `--border-strong` reste pour les bordures décoratives (carte survolée).

## Mode sombre

Les deux blocs existants (`@media (prefers-color-scheme: dark)` et `:root[data-theme="dark"]`) ne contiennent plus que `color-scheme: dark`. Chaque couleur est écrite une seule fois avec `light-dark(clair, sombre)` dans un bloc `@supports`, y compris la palette d'équipe de la vague 12 ; un navigateur sans `light-dark()` garde le thème clair. Les quatre règles sombres dispersées (notice, option de recherche, badges d'accès, palette d'équipe) ont disparu au profit des jetons. Valeurs sombres : fond `#10151C`, carte `#161D27`, fond doux `#1B232E`, accent doux bleu à 14 %, bordures `#263140` et `#34404F`, grille `#212B37`, texte `#E6EBF1`, titres `#F2F5F9`, secondaire `#9AA8B8`, primaire `#8FB3E0` (survol `#A9C5E8`, texte dessus `#0F1620`), ombres noires à 40 %, familles sémantiques en teintes claires sur fonds transparents.

## Compatibilité

Les anciens noms (`--ink`, `--line`, `--line-strong`, `--bg`, `--surface-2`, `--surface-3`, `--accent*`, `--on-accent`, `--brand-50` à `--brand-900`, `--radius`, `--radius-lg`, `--shadow-sm`, `--shadow`, `--font`) sont déclarés comme alias des nouveaux, sous le commentaire « alias temporaires, à supprimer au prompt 2.9 ». Les quelque 3 800 lignes qui les utilisent n'ont pas été réécrites.

## Base typographique

`body` en `--font-ui` 14 px, interligne 1,5, texte `--text` sur `--background` ; chiffres tabulaires (`tnum`) seulement sur `.num`, le grand livre, le tableau des cotisations et `.amounts`. `h1` en serif 30 px 700, interligne 1,15, approche -0,02 em, couleur `--heading`, jamais en italique ni en capitales ; `h2` serif 18 px 700 ; `h3` DM Sans 15 px 600. Le trait orange de 4 px devant les `h2` de `.panel` est supprimé. Champs à 16 px sur écran tactile et cibles de 44 px conservés ; la règle `prefers-reduced-motion` est conservée.

## Logo

`BrandLogo` prend sa couleur d'accent dans `--logo-accent` (`#F97316` en clair, `#FB923C` en sombre). C'est le seul orange qui reste dans l'interface ; la couleur de thème du manifeste et des métadonnées passe au bleu nuit et au fond de page.

Les 68 tailles de texte écrites en rem sous 12 px (0,68 à 0,85 rem, devenues plus petites avec le corps à 14 px) passent à `var(--text-xs)`, soit 12 px.

## Contrastes mesurés

Calcul WCAG (luminance relative), fonds translucides composés sur la carte. Minimum 4,5:1 pour le texte, 3:1 pour les bordures de champ, l'anneau de focus et les icônes utiles.

| Couple | Minimum | Clair | Sombre |
|---|---|---|---|
| Texte sur carte | 4.5:1 | 12.61:1 | 14.14:1 |
| Texte sur fond de page | 4.5:1 | 12.17:1 | 15.29:1 |
| Texte sur fond doux | 4.5:1 | 11.74:1 | 13.21:1 |
| Titres sur carte | 4.5:1 | 12.33:1 | 15.50:1 |
| Texte secondaire sur carte | 4.5:1 | 5.61:1 | 6.99:1 |
| Texte secondaire sur fond doux | 4.5:1 | 5.22:1 | 6.53:1 |
| Liens et texte primaire sur carte | 4.5:1 | 11.17:1 | 7.82:1 |
| Entrée de menu active | 4.5:1 | 9.63:1 | 5.99:1 |
| Texte sur bouton primaire | 4.5:1 | 11.17:1 | 8.38:1 |
| Texte sur bouton primaire survolé | 4.5:1 | 8.27:1 | 10.24:1 |
| Encre succès sur fond succès | 4.5:1 | 7.19:1 | 8.98:1 |
| Encre avertissement sur fond avertissement | 4.5:1 | 4.80:1 | 9.04:1 |
| Encre danger sur fond danger | 4.5:1 | 5.93:1 | 8.12:1 |
| Encre info sur fond info | 4.5:1 | 5.18:1 | 8.75:1 |
| Encre succès sur carte | 4.5:1 | 8.27:1 | 11.63:1 |
| Encre avertissement sur carte | 4.5:1 | 5.42:1 | 11.75:1 |
| Encre danger sur carte | 4.5:1 | 7.12:1 | 9.91:1 |
| Encre info sur carte | 4.5:1 | 6.00:1 | 11.37:1 |
| Bordure de champ sur carte | 3:1 | 3.25:1 | 3.59:1 |
| Bordure de champ sur fond de page | 3:1 | 3.14:1 | 3.89:1 |
| Bordure de carte survolée (décorative) | 1:1 | 1.39:1 | 1.61:1 |
| Anneau de focus sur carte | 3:1 | 5.07:1 | 8.88:1 |
| Anneau de focus sur fond de page | 3:1 | 4.89:1 | 9.60:1 |
| Icône succès sur carte | 3:1 | 5.09:1 | 7.53:1 |
| Icône avertissement sur carte | 3:1 | 3.90:1 | 8.02:1 |
| Icône danger sur carte | 3:1 | 4.92:1 | 5.82:1 |
| Icône info sur carte | 3:1 | 3.40:1 | 7.67:1 |
| Icône primaire sur carte | 3:1 | 11.17:1 | 7.82:1 |
| Trait orange du logo sur carte | 3:1 | 2.80:1 (insuffisant) | 7.49:1 |

Le trait orange du logo est une partie d'un logotype (lettres sombres, trait de couleur), exempté du critère de contraste ; il n'est pas une icône utile.

## Tests

- Unitaires (`tests/wave13-design.test.ts`) : présence de chaque jeton, palette écrite une fois en `light-dark()`, alias des anciens noms, aucun orange hors du logo, échelle de texte sans valeur sous 12 px, titres en serif et trait des `h2` supprimé, polices servies par le site.
- Bout en bout (`tests/e2e/new-pages.spec.ts`) : variables de police posées sur `<html>`, titre en serif différent du texte, aucun lien vers Google Fonts, aucun débordement à 1440, 1024, 390 et 320 px sur l'accueil, Joueurs, Calendrier, Finance du club, Réglages et Mes équipes ; contrôles axe existants.

## Vérification

`npm run check`, `npm run test:e2e:db`.
