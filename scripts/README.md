# `scripts`

| Script                 | Commande                                              | Rôle                                                                                 |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `migrate.mjs`          | `npm run db:migrate`                                  | Applique les migrations manquantes                                                   |
| `db-test.mjs`          | `npm run db:test`                                     | Vérifie que toutes les migrations sont appliquées                                    |
| `local-db.mjs`         | `npm run db:local`                                    | PostgreSQL embarqué pour le développement (données dans `.local/`)                   |
| `bootstrap.ts`         | `npm run admin:bootstrap`                             | Crée une organisation réelle et son président (lien de mot de passe par email local) |
| `account-status.ts`    | `npm run admin:account -- email activate\|deactivate` | Active ou désactive un compte                                                        |
| `demo-seed.ts`         | `npm run demo:seed`                                   | Club et comptes de démonstration (jamais en production)                              |
| `demo-start.sh`        | `npm run demo:start`                                  | Lance workers + serveur compilé (Codespaces)                                         |
| `mail-worker.ts`       | `npm run mail:worker`                                 | Traite la file d'emails                                                              |
| `documents-worker.ts`  | `npm run docs:worker`                                 | Expiration des documents                                                             |
| `attendance-worker.ts` | `npm run attendance:worker`                           | Relances et alertes de présence                                                      |
| `e2e-db.mjs`           | `npm run test:e2e:db`                                 | Crée une base temporaire, lance Playwright, la supprime                              |
| `check-auth-schema.ts` | `npx tsx scripts/check-auth-schema.ts`                | Compare le schéma Better Auth attendu à la base                                      |
| `check-deps.mjs`       | `node scripts/check-deps.mjs`                         | Chaque paquet contre les failles connues et les versions malveillantes (CI)          |
