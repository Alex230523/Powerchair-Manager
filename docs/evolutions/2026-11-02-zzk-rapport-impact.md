# Rapport d'impact pour les subsides (02/11/2026)

Point H13 de l'avis. Page « Rapport d'impact » (`/statistics/impact`), à côté du rapport d'activité (C11), pour une saison, une année civile ou une période choisie. Migration `0103_impact.sql` : réglages du bénévolat, ajustements notés, rapports joints aux subsides. Aucun chiffre n'est stocké : tout est recalculé depuis les données.

## Indicateurs (définition affichée pour chacun)

- Bénéficiaires : joueurs inscrits dans une équipe pendant la période ; par tranche d'âge, par commune de domicile (lue dans l'adresse postale), jamais un nom ni une donnée de santé. Le sexe n'est pas relevé : « non relevé », pas un zéro.
- Nouveaux joueurs (première inscription dans la période) ; provenance « pas encore relevée » tant que H1 n'est pas fait.
- Rétention : joueurs de l'année précédente encore inscrits.
- Séances tenues (annulées exclues) et heures de sport encadrées (durée × joueurs relevés présents ; sans présence relevée : donnée absente).
- Matchs joués, tournois, kilomètres des véhicules de déplacement (donnée absente si aucune distance), coachs formés.
- Bénévolat : tâches terminées × durée réglable par type, encadrement des entraînements et matchs (staff × durée, 2 h par match), chauffeurs (durée du déplacement, 4 h par défaut) ; valorisation facultative au taux horaire réglé.
- Ajustements : un ajout ou retrait avec sa raison, pour la période ; le chiffre calculé reste affiché à côté.

## Mise en forme et subsides

- À l'écran : chiffres clés, barres par âge et par commune, détail du bénévolat, définitions, ajustements, réglages.
- Export PDF au logo du club (méthode de calcul en fin de document) et export Excel des données avec la méthode en annexe.
- Depuis un subside (Subsides & sponsors) : « Générer le rapport d'impact » préremplit la période et l'objet ; « Joindre au dossier du subside » enregistre le PDF avec le dossier (fonds réservés du subside et dépensés, point 9, inclus) ; la fiche du subside liste les rapports joints.

## Vérification

- `npx vitest run tests/impact.test.ts`
- `npm run test:integration` (`tests/integration/impact.integration.ts`) : heures de sport avec séances annulées exclues, aucun nom ni donnée de santé dans les exports, bénévolat calculé puis ajusté, rapport joint au subside, deux clubs.
- `tests/e2e/impact.spec.ts` à 390 px avec axe.
