# `src/lib` : socle technique

| Fichier                             | Rôle                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `db.ts`                             | Pools PostgreSQL partagés (serveur uniquement)                                  |
| `auth.ts`                           | Configuration Better Auth (mots de passe, sessions, MFA, hooks)                 |
| `auth-server.ts` / `auth-client.ts` | Instance serveur / client navigateur de l'authentification                      |
| `http.ts`                           | Aides communes aux routes API : session, même origine, taille du corps, erreurs |
| `security-policy.ts`                | `mfaSatisfied()` et l'interrupteur `PFM_MFA_SUSPENDED`                          |
| `locale.ts`                         | Langues supportées (`fr`, `nl`, `en`) et textes de la coquille                  |
| `english.ts`                        | Dictionnaires anglais des modules                                               |
| `env.ts`                            | Validation de `DATABASE_URL`                                                    |
