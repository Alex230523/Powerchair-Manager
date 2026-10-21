# Vague 15, prompt 2.6 : statistiques et graphiques (21 octobre 2026)

Aucune migration. La structure de la page Statistiques ne change pas : en-tête (Présences, Calendrier, Export CSV), barre de filtres (saison, du, au, équipe, type), cinq chiffres clés, « Évolution mensuelle » et « Détail par personne » côte à côte sur grand écran.

## Bibliothèque : écart assumé

Le prompt demandait `recharts`. Le registre npm n'est pas joignable depuis la session de travail (connexion refusée par la politique réseau), donc impossible d'obtenir la version exacte et ses empreintes pour `package-lock.json`. Plutôt que d'écrire un verrou faux, les deux graphiques nécessaires sont dessinés en SVG dans `src/components/charts.tsx` (environ 300 lignes, aucune dépendance). Ils respectent la charte demandée et chargent avec la page. Si recharts reste souhaité, il suffit d'autoriser registry.npmjs.org pour la session et de remplacer le contenu de `LineChart` et `StackedBarChart` : `ChartFrame`, la légende, l'infobulle et le tableau restent.

## Charte des graphiques (`charts.tsx`)

- Texte des axes en `--font-ui` 12 px, couleur `--muted` ; grille horizontale seulement, 1 px `--grid-line` ; ni ombre, ni dégradé, ni 3D.
- Séries en `--chart-1` à `--chart-8`, `--primary` réservée au club ; une série d'équipe prend la couleur de l'équipe (`--team-<couleur>-border`, vague 12). Les couleurs restent des variables CSS dans le SVG : le thème sombre suit sans relire les couleurs en JavaScript.
- Infobulle : petite carte `--surface`, bordure `--border`, arrondi 12 px, `--shadow-pop`, valeurs en 600 et chiffres tabulaires.
- Légende sous le graphique : de vraies cases à cocher, colorées, pour afficher ou masquer une série (cible de 44 px).
- « Voir les données » : choix Graphique / Tableau ; le tableau montre les mêmes chiffres. Chaque graphique a un nom accessible qui résume la tendance (première et dernière valeur de chaque série), se parcourt aux flèches gauche et droite (Début, Fin) et annonce la valeur pointée.
- Exemples des deux graphiques dans la galerie `/design`, en clair et en sombre.

## Page Statistiques

- **Évolution mensuelle** : une courbe par équipe (2 px, sans remplissage, points au survol, couleur de l'équipe) et le club en 3 px `--primary`, axe Y de 0 à 100 %, un point par mois de la période filtrée (un mois sans registre clôturé reste vide). Avec une équipe choisie : sa courbe et la moyenne du club en pointillés (lue sans le filtre d'équipe). Le filtre « Type d'événement » s'applique aussi aux courbes.
- **Effectif par saison** (pleine largeur, dessous) : barres empilées sur les cinq dernières saisons, segments par équipe ou par catégorie (choix dans l'en-tête), colonnes de 28 px espacées, 1 px de fond entre segments, total au-dessus en 600 `--heading`. Un joueur compte une fois par saison, dans sa première équipe par ordre alphabétique, pour que les segments fassent le total. À côté, la tuile « Taux de fidélisation » (dernière saison mesurable, avec restés, arrivés, partis). Le tableau garde les chiffres de fidélisation de la vague 12 (restés, arrivés, partis, taux) : l'ancienne carte « Fidélisation des joueurs » est remplacée par ce bloc, sans perte.
- **Détail par personne** : inchangé (le tri par colonne viendra avec C8).
- États : l'état vide explicite et le message d'erreur avec « Afficher » sont gardés ; l'effectif n'apparaît qu'aux personnes qui voient l'annuaire.

Textes de la page déplacés dans `statistics-copy.ts` (fr, nl, en). Données de démonstration : couleurs des équipes A et B et deux saisons précédentes, pour que les graphiques aient de l'historique.

## Tests

- Unitaires (`tests/wave15-charts.test.ts`) : mois d'une période, taux mensuels du club et des équipes, effectif compté une fois, graduations, phrase de tendance, textes identiques en trois langues sans tiret long.
- Intégration (`tests/integration/wave15-charts.integration.ts`) : effectif par équipe et par catégorie, fidélisation, rien de l'autre club, refus sans droit d'annuaire, couleurs d'équipe.
- Bout en bout (`tests/e2e/statistics-charts.spec.ts`) : courbes par équipe et club, légende au clavier, flèches, bascule vers le tableau, équipe choisie avec la moyenne en pointillés, effectif par saison et par catégorie, taux de fidélisation, axes en clair et en sombre, 390 et 320 px, axe à chaque étape.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
