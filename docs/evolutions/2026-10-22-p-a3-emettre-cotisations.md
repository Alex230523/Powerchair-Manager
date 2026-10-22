# A3 : « Émettre des cotisations » visible, émission groupée (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point A3.

## Constat corrigé
Le bouton n'apparaissait qu'avec le droit `dues.manage` et restait grisé, sans explication, tant qu'aucun barème n'existait. Le président a bien ce droit : `permissions()` le donne à `club_president`, ce que vérifie un test.

## Bouton et assistant
« Émettre des cotisations » est toujours visible pour qui a `dues.manage`, jamais grisé. L'assistant (`src/components/dues-issue.tsx`) a trois étapes :
1. **Barème** : un barème existant, ou « Créer un barème » sur place (saison, catégorie, montant, nombre de versements, première échéance, réduction fratrie). Sans barème, l'assistant commence par là.
2. **Qui** : une personne, une équipe, tous les joueurs actifs de la saison, ou les nouveaux admis. Aperçu ligne par ligne :
   - montant après réduction fratrie ;
   - personnes déjà couvertes (même catégorie, même saison) exclues ;
   - exonération possible avec un motif ;
   - pour les admis, le nombre de versements choisi dans le formulaire est repris.
3. **Confirmer** : créances et échéances en une transaction (commande `issueMany`), puis email facultatif à chaque famille, avec le montant et l'échéancier (nouveau message « Cotisation émise », `dues_issued`).

Le QR de virement viendra avec B1.

## Émission à l'acceptation
Réglages › Argent : « Émission à l'acceptation d'une inscription », avec le choix d'un barème (colonne `organization.dues_auto_plan_id`, migration `0063`).
- Quand une inscription est acceptée, la cotisation de ce barème est émise toute seule, avec le nombre de versements choisi par la famille, sauf si la personne en a déjà une.
- Annuler la décision annule cette cotisation tant qu'elle n'est pas payée.

## Page
Sans cotisation pour la saison, l'état vide le dit et propose « Émettre des cotisations ».

## Code
- `src/domains/dues/core.ts` : écritures communes (journal, échéancier, fratrie), sorties de `service.ts`.
- `src/domains/dues/issue.ts` : aperçu, émission groupée, email, émission à l'acceptation.
- Migration `0063` : `dues_auto_plan_id` et le type de message `dues_issued`.

## Tests
- Unitaires (`tests/a3-dues-issue.test.ts`) : droit du président, lignes d'aperçu, commandes, message, textes.
- Intégration (`tests/integration/a3-dues-issue.integration.ts`) :
  - club sans barème qui émet pour une équipe avec fratrie et exonération ;
  - 250 € en 4 échéances de 62,50 € ;
  - personnes déjà couvertes ignorées ;
  - émission à l'acceptation puis annulation ;
  - coach sans droit ;
  - deux clubs.
- Bout en bout (`tests/e2e/dues-issue.spec.ts`, `tests/e2e/dues.spec.ts` mis à jour), axe et 390 px.
