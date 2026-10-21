# Vague 15, prompt 2.8 : finances et cotisations (21 octobre 2026)

Aucune migration, aucune règle de calcul ni d'encaissement changée. Le lot 09 (import bancaire, QR de paiement, rapprochement) reste hors de ce dépôt : aucune table qu'il utilisera n'est touchée.

## Finance du club

- **Budget** : pour chaque ligne, « réalisé sur budget » aligné à droite et une colonne « Avancement » avec une barre fine (6 px, arrondie) et le pourcentage toujours écrit. Dépenses : vert sous 90 %, ambre de 90 à 100 %, rouge au-delà (le pourcentage passe aussi en encre ambre ou rouge). Recettes : jamais d'alarme, vert une fois le budget atteint, neutre avant (choix assumé : dépasser une recette prévue est une bonne nouvelle).
- **Barres par catégorie** : les deux derniers `style={{ width }}` du projet sont remplacés par une variable CSS `--value` ; entrées en `--success`, sorties en `--chart-8`.
- **Grand livre** : montant à droite, « + » et encre succès pour une recette, « − » en texte normal pour une dépense ; catégorie en Badge ; filtres dans une Toolbar ; « Afficher plus » conservé.
- **Rapport annuel** : en-tête de document à l'impression seulement (logo, nom, numéro d'entreprise et adresse du club, saison) ; les couleurs d'impression passent par des jetons (`--print-ink`, `--print-paper`, `--print-line`).
- **Subsides et Sponsors** : la « Prochaine étape » à moins de 14 jours passe en encre ambre avec une icône horloge (rouge avec une icône d'alerte si la date est dépassée chez les partenaires).

## Cotisations

- Sous les quatre chiffres clés, une Card fine « Taux d'encaissement » : la barre ambre de la carte « Situation financière » de l'accueil, pleine largeur, « 62 % encaissé », puis encaissé, reste à encaisser et « dont en retard » (encre danger et icône). Un seul composant partagé, `CollectionBar`, aux deux endroits, sur les mêmes chiffres (`duesTotals` puis `collectionFigures`).
- Prochaine échéance dépassée : encre danger et icône d'alerte, plus « En retard » pour les lecteurs d'écran.
- Bouton ✓ : bouton rond de 32 px (44 px sur téléphone) avec l'icône coche, nommé « Encaisser la prochaine échéance de Lucas Peeters, 62,50 € », avec la même infobulle.
- Couleurs des états : familles sémantiques seulement (payé succès, en retard danger, échéance proche avertissement, en ordre et annulé neutre, exonéré information).

## Plus de style en ligne

Les composants ne passent plus de valeur au style que par des variables CSS (`cssVars` dans `src/components/css-vars.ts`) : barres, graphiques (2.6), grille du calendrier (2.7), galerie. Un test unitaire vérifie qu'aucun `style={{ … }}` ne reste dans `src`.

## Tests

- Unitaires (`tests/wave15-finance.test.ts`) : couleurs du budget, chiffres de la barre d'encaissement et accord avec `duesTotals`, textes, aucun style en ligne.
- Bout en bout (`tests/e2e/finance-dues.spec.ts`) : trois lignes de budget à 20, 95 et 150 %, montants et Badge du grand livre, même barre d'encaissement sur l'accueil et sur Cotisations, échéance dépassée avec icône, bouton ✓ nommé, en-tête du rapport à l'impression, axe ; `tests/e2e/dues.spec.ts` adapté au nouveau nom du bouton.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
