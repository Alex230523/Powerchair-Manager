# Vérifications — 18 octobre 2026

## Réalisées sur cette machine

- Dépôt Git local initialisé, aucun dépôt préexistant.
- Dépendances installées ; versions directes exactes et package-lock.json.
- npm run check : lint et TypeScript réussis ; 4 tests unitaires réussis.
- npm run build : compilation de production réussie (Next.js 16.4.2).
- npm run test:e2e : 4 tests réussis sur Chromium, serveur de production.
  FR/NL : langue HTML, clavier/lien d’évitement, changement de langue,
  absence de débordement à 320px et aucune violation axe dans les règles ciblées.
  Redirection racine et 404 langue inconnue ; santé 503 sans détails sensibles
  lorsque PostgreSQL est volontairement inaccessible.
- Débordement néerlandais détecté puis corrigé ; suite E2E entièrement repassée.
- npm audit --omit=dev : aucune vulnérabilité signalée à la date du contrôle.

## Limites et vérifications restantes

- Docker, PostgreSQL et psql absents de cette machine : migration sur base réelle,
  idempotence, persistance et santé HTTP 200 non exécutées ici. La CI PostgreSQL
  fournie applique deux fois les migrations puis exécute db:test ; elle n’a pas
  été exécutée sur GitHub. Les commandes de recette sont dans README.md.
- npm audit complet : 5 alertes élevées dans la chaîne de développement
  eslint-config-next → plugin Next → fast-glob → micromatch → braces 3.0.3
  (GHSA-vfj7-8cjw-p6xm). Registre consulté : pas de version braces plus récente.
  Pas de rétrogradation forcée du framework. À revoir avant acceptation du socle.
- Pas de validation de préproduction, de lecteur d’écran ou de pilote utilisateur.
  Les tests automatiques ne constituent pas une certification WCAG 2.2 AA.
- Aucun compte, permission, isolation métier, PWA installable ou module métier.
- Pas de commit ou de publication distante ; fichiers livrés dans le dépôt local.

Lot 00 livré pour revue, avec réserves ci-dessus. Recette complète et validation
explicite encore requises avant tout développement du lot 01.
