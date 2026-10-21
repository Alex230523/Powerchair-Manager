# Vague 15, observation C5 : barre de navigation mobile en bas d’écran (21 octobre 2026)

Pas de migration.

## Ce qui change

Sous 760 px, une barre fixe en bas d’écran s’ajoute au tiroir de la vague 14 :

- **Contenu selon le rôle** (`bottomNav()` dans `src/components/menu.ts`, tiré du menu du rôle, donc avec ses droits et les modules activés), quatre entrées puis « Plus » qui ouvre le tiroir complet :
  - président : Accueil, Calendrier, Joueurs, Cotisations ;
  - coach : Accueil, Calendrier, Présences, Joueurs (si ses droits le permettent) ;
  - joueur et parent : Accueil, Calendrier, Ma fiche (ou celle de l’enfant), Cotisations ; le reste de « Mon espace » est sous « Plus ».
  La Messagerie n’y est pas, comme dans le menu depuis la vague 10.
- **Apparence** : 4rem de haut (64 px en taille normale) plus la zone de sécurité, fond `--surface`, bordure haute `--border`, icônes de 22 px et libellé de 12 px, entrée active en `--primary` avec une pastille `--accent-soft` derrière l’icône, compteur quand il y a quelque chose à traiter (présences à remplir, cotisations en retard), comme dans le menu.
- Les pages gardent une marge basse égale à la barre (`--bottom-nav-space`, aussi utilisée par les messages courts de C10), et le défilement vers un champ ne le laisse jamais sous la barre (`scroll-padding-bottom`). La barre se retire quand on tape dans un champ (clavier du téléphone ouvert). Pas de barre à l’impression ni sur grand écran.
- **Accessibilité** : `<nav aria-label="Navigation rapide">` traduit, `aria-current` sur l’entrée active, cibles de 48 px au moins, « Plus » avec `aria-expanded`.

## Tests

- Unitaires (`tests/wave15-bottom-nav.test.ts`) : entrées selon le rôle, droits et modules désactivés, libellé dans les trois langues, masquée par défaut et zone de sécurité.
- Bout en bout (`tests/e2e/bottom-nav.spec.ts`) : à 390 px pour le président, le coach, le joueur et le parent (entrées, page active, cibles de 48 px, pas de débordement, « Plus » ouvre le menu, axe), barre retirée pendant la saisie, absente à 1280 px.

## Vérification

`npm run check`, `npm run test:e2e:db`.
