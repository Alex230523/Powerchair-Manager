# `tests`

| Dossier        | Commande                   | Base de données                        | Contenu                                                          |
| -------------- | -------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `*.test.ts`    | `npm test`                 | Non                                    | Fonctions pures, dictionnaires de langues, politique de sécurité |
| `integration/` | `npm run test:integration` | Oui, schéma aléatoire supprimé ensuite | Services et droits : plusieurs clubs, rôles autorisés et refusés |
| `e2e/`         | `npm run test:e2e:db`      | Oui, base aléatoire supprimée ensuite  | Parcours Playwright complets et contrôles axe (accessibilité)    |
| `support/`     |                            |                                        | Utilitaires (TOTP pour la MFA)                                   |

Les tests ne touchent jamais aux données de développement ni au club de démo.
