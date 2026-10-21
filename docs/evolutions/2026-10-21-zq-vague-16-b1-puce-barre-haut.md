# Vague 16, B1 : plus de puce sous la barre du haut (21 octobre 2026)

Revue du 21 octobre au soir, observation sur la barre du haut.

- La puce « Équipe A · 2026-27 » avec sa croix (`ScopeChip`, `.scope-chip-row`) disparaît, avec son CSS et ses textes (`scopeClear`). Le contexte (saison et équipe dans l’adresse et le navigateur, `use-scope.tsx`, `src/domains/scope`) ne change pas.
- Repère à la place : la capsule **Équipe** prend le fond `--accent-soft` et la bordure `--primary` quand une équipe précise est choisie (avec sa pastille de couleur) ; la capsule **Saison** fait de même quand la saison choisie n’est pas la saison en cours. « Toutes les équipes » et la saison en cours gardent le style neutre.
- Le lien « Appliquer à toute la plateforme » des pages qui ont leur propre filtre reste.
- Tests : `tests/wave16-shell.test.ts` ; `tests/e2e/teams.spec.ts` (plus aucune puce, capsule colorée, retour à toutes les équipes par la capsule, axe).
