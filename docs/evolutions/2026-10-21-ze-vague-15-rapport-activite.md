# Vague 15, observation C11 : rapport d’activité modifiable dans Canva (21 octobre 2026)

Migration `0037_activity_report.sql` (ajouts) : résultat d’un tournoi sur le déplacement (`final_rank`, `teams_count`, `result_note`, avec place inférieure ou égale au nombre d’équipes) et case « Fait marquant » (`calendar_event.highlight`).

Dépendance ajoutée : `pptxgenjs` 4.0.1 (version exacte dans `package.json` et `package-lock.json`, avec son arbre : `jszip`, `image-size`, `https`…), et `jszip` 3.10.1 en dépendance de développement pour relire le fichier dans les tests.

## Saisie

- Fiche du déplacement de type « Tournoi » : section « Résultat du tournoi » après la date de retour (place finale, nombre d’équipes engagées, note courte).
- Éditeur d’événement : case « Fait marquant de la saison ».

## Page « Rapport d’activité » (`/statistics/report`)

Bouton dans l’en-tête des Statistiques ; droit annuaire en lecture ou plus. Paramètres : saison, équipe (suit la capsule de la barre du haut), sections à inclure, « Mot du président » et « Remerciements » (proposés à partir des sponsors actifs et des subsides accordés de la saison, modifiables). Aperçu à l’écran : une carte au format 16:9 par page du futur fichier.

Contenu, uniquement agrégé (aucune donnée de santé, aucun nom de joueur ; les seuls noms sont ceux des coachs, des partenaires, des financeurs et ce que le président tape) :

- Couverture : nom du club (et de l’équipe choisie), « Rapport d’activité 2025-26 », cadre photo vide.
- Le club en chiffres : membres, joueurs, équipes, entraînements passés, heures de pratique, taux de présence (registres clôturés), avec l’écart par rapport à la saison précédente (équipes du même nom quand une équipe est choisie).
- Résultats sportifs : tournois avec place (« 2e sur 8 ») et note ; bilan des matchs joués par équipe (victoires, nuls, défaites, buts).
- Grands événements : événements « Fait marquant » et déplacements, date et lieu, un cadre photo chacun (six au plus).
- Encadrement : coachs, nombre de bénévoles, formations suivies.
- Matériel : fauteuils du club, achats de la saison avec leur financeur (C2).
- Finances en bref : recettes et dépenses par catégorie en barres, seulement avec le droit Argent (et le module Finances actif).
- Remerciements.

## Exports

- **PowerPoint** (`POST /api/statistics/report`) généré côté serveur avec pptxgenjs : 16:9, une diapositive par section, de vrais champs de texte, des graphiques en barres natifs (modifiables dans Canva), des cadres photo gris arrondis « Glissez une photo ici ». Couleurs de la palette bleu nuit, Source Serif 4 pour les titres et DM Sans pour le texte. Sous le bouton, l’aide Canva en trois étapes.
- **PDF** : impression de l’aperçu (une page par carte, paramètres masqués).

## Tests

- Unitaires (`tests/wave15-report.test.ts`) : écarts, pages et leur ordre, finances absentes sans droit, remerciements proposés, fichier .pptx relu (une diapositive par page, deux graphiques natifs, textes, aucune image), textes fr/nl/en.
- Intégration (`tests/integration/wave15-report.integration.ts`, deux clubs) : chiffres identiques aux modules (membres, joueurs, entraînements, heures, présence), saison précédente, tournoi, matchs, faits marquants, coachs, finances, aucun nom de joueur, finances absentes sans droit Argent, refus sans droit annuaire, autre club isolé et équipe d’un autre club refusée.
- Bout en bout (`tests/e2e/activity-report.spec.ts`) : depuis les Statistiques, aperçu, sections, mot du président, fichier téléchargé relu, impression, case « Fait marquant », 390 px, axe.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
