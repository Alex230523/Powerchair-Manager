# Vague 13, prompt 2.2 : composants partagés et migration des pages (21 octobre 2026)

Suite des fondations (prompt 2.1). Aucune migration de base de données ; seuls l'apparence et le balisage changent, les comportements restent identiques.

## Composants (`src/components/ui.tsx`)

Tous en TypeScript strict, textes passés en props, couleurs et tailles prises dans les jetons.

- **PageHeader** : titre `h1` serif, sous-titre secondaire, actions à droite (le bouton principal en dernier), fil d'Ariane facultatif (`crumbs`, `crumbsLabel`), enfants sous la ligne de titre. Sur mobile les actions passent sous le titre.
- **Card** : fond carte, bordure, arrondi 20 px, ombre douce, padding 24 px. Variantes `flat` (sans ombre, pour une carte imbriquée), `href` ou `onClick` (toute la carte est un lien ou un bouton : ombre et bordure renforcées au survol, sans déplacement, focus visible), `label` (nom accessible sans titre visible), `labelledBy` et `headingId` (titre pointé par un autre élément), `footer`, `divider` (ligne fine sous l'en-tête, automatique pour une carte `flush` qui contient un tableau). **CardHeader** et **CardFooter** sont exportés ; **Panel** devient une Card titrée.
- **KpiCard** (anciennement StatCard, nom conservé) : libellé 13 px, IconTile en haut à droite, valeur serif 30 px, description 12 px, variation facultative (flèche + texte obligatoire, tonalité succès ou danger), entièrement cliquable avec `href`. Hauteur minimale 136 px.
- **IconTile** : 36 px (ou 44 px), arrondi 12 px, fond accent doux et icône primaire ; tons succès, avertissement, danger, info, neutre.
- **Badge** : 22 px, arrondi 8 px, 12 px 600, fond doux et encre d'une même famille (neutre, primaire, succès, avertissement, danger, info). Remplace `.status-tag`, `.role-chip` et `.count-pill`, supprimés. « brand » reste accepté comme ancien nom de primaire ; une valeur inconnue (chaîne vide) donne le ton neutre.
- **Button** : variantes `primary`, `secondary`, `ghost`, `danger` ; tailles `md` (38 px) et `sm` (32 px) ; arrondi 12 px, 13 px 600 ; icône à gauche (`icon`) ; état `loading` avec un petit anneau et `aria-busy`. Les classes `.button`, `.button.secondary` restent valables pour les liens.
- **Tabs** (onglets de page) : rôles `tablist` et `tab`, tabindex tournant, flèches, Début et Fin déplacent et sélectionnent ; seul l'onglet actif porte `aria-controls` (les autres panneaux ne sont pas dans la page) ; `idPrefix` pour les panneaux qui pointent vers leur onglet ; compteur facultatif. **Segmented** (choix compact) : groupe de boutons `aria-pressed`, mêmes touches.
- **EmptyState** : IconTile 44 px, titre 15 px 600, phrase d'aide, action facultative ; centré, 40 px de marge verticale.
- **DataTable** : habille un `<table>` existant dans une région nommée et focusable (`role="region"`, `tabIndex=0`), légende `sr-only`. Les styles de tableau (en-tête 12 px 600 secondaire sur fond doux, collant, lignes de 44 px, survol, colonnes `.num` à droite en chiffres tabulaires) s'appliquent à tous les tableaux de l'application.
- **Field** : libellé 13 px 500 au-dessus, champ 38 px arrondi 12 px bordure `--field-border`, aide 12 px, erreur 12 px encre danger avec icône ; `describedBy()` donne la valeur d'`aria-describedby` du contrôle.

## Migration

- En-têtes faits main (`<h1>` suivi d'un paragraphe, blocs `.directory-heading`) remplacés par PageHeader dans 36 composants, actions comprises.
- `.panel` remplacés par Card dans toutes les sections (titre, `aria-labelledby`, actions de `.panel-head`) ; les quelques formulaires et blocs repliés qui gardent la classe `.panel` ont exactement l'apparence d'une Card.
- Étiquettes `.status-tag`, `.role-chip`, `.count-pill` remplacées par Badge ; `.empty-directory` et `.all-clear` par EmptyState.
- Tuiles de chiffres (`.metric` de l'accueil, `.finance-cards`, `.metric-grid` du matériel, `.stat` des fiches) remplacées par KpiCard ou alignées dessus ; les listes « À faire » de l'accueil restent une liste sobre (compteur dans une tuile douce, sans bordure colorée).
- Cartes spécifiques des listes (fauteuils, déplacements, véhicules, salles, cagnottes) remplacées par Card (`as="li"`, attribut `data` pour le statut) ; les 39 paragraphes `p.muted` qui servaient d'état vide remplacés par EmptyState.
- Trois listes d'onglets faites main (fiche joueur, communication, fiche équipe) passent par Tabs.
- Bordures colorées décoratives supprimées (aperçu de notification, puce du calendrier, événement du tableau, cartes de statistiques, cartes d'équipe de la gouvernance, blocs de newsletter, barre devant les titres de panneau) ; un événement garde une bordure gauche à la couleur de son équipe. La page d'accueil visiteur perd son fond sombre dégradé : une grande carte blanche sur le fond de page.
- CSS devenu inutile supprimé (styles des tuiles, des étiquettes, des en-têtes faits main, de l'ancien héros) et surcharges de taille des `h1`/`h2` retirées pour laisser l'échelle des fondations s'appliquer.
- Un commit par module : socle et accueil, Joueurs, Vie du club, Gestion du club et réglages, Finance du club, Fédération.

## Contrôle

- Page interne `/[locale]/design` (composant `DesignGallery`, textes dans `design-copy.ts`) : chaque composant dans tous ses états, en clair et en sombre côte à côte (un conteneur `.theme-scope` avec son propre `color-scheme` recalcule les jetons `light-dark()`). Visible seulement hors production (`NODE_ENV !== "production"`) ; la suite de bout en bout l'ouvre sur un build de production grâce à `PFM_DESIGN_PAGE=true`, posé par `playwright.config.ts` seulement.
- Tests unitaires (`tests/ui.test.tsx`, rendu serveur) : Button (variantes, tailles, icône, chargement), PageHeader (fil d'Ariane, actions), Card (titre, plate, lien, étiquetée), Badge et IconTile (tons, anciens noms, valeur inconnue), KpiCard (lien, variation en toutes lettres), Tabs et Segmented (rôles, tabindex tournant, `aria-controls` du seul onglet actif), EmptyState, DataTable, Field et `describedBy`.
- Bout en bout (`tests/e2e/design.spec.ts`) : la galerie passe axe dans les deux thèmes ; flèches, Début et Fin déplacent et sélectionnent les onglets ; le choix segmenté suit les flèches ; aucun débordement à 320 px. Les pages migrées restent couvertes par les contrôles axe existants (`new-pages`, `people`, `attendance`, `dues`, `teams`...).

## Vérification

`npm run check`, `npm run test:e2e:db`.
