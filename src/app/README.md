# `src/app` : routes Next.js

| Dossier               | Contenu                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `(entry)/`            | Redirige `/` vers `/fr`                                                                                      |
| `[locale]/`           | Pages en `fr`, `nl` ou `en`. Chaque `page.tsx` vérifie la langue puis rend un composant de `src/components/` |
| `[locale]/layout.tsx` | HTML commun : thème, lien d'évitement, coquille de navigation, métadonnées PWA                               |
| `api/`                | Routes JSON. `GET` = vue du module, `POST` = commande `{ action, ... }`                                      |
| `globals.css`         | Design system complet (variables, composants, thème sombre, responsive)                                      |

| Page                                                         | Composant                            | API                                               |
| ------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------- |
| `/` (accueil)                                                | `home.tsx`                           | `api/dashboard`                                   |
| `/access`                                                    | `access.tsx`                         | `api/workspace`, `api/auth/*`                     |
| `/players`, `/coaches`, `…/former`                           | `player-directory.tsx`               | `api/people`                                      |
| `/players/[id]`                                              | `player-profile.tsx`                 | `api/player-profile`                              |
| `/equipment`                                                 | `equipment.tsx`                      | `api/equipment`                                   |
| `/club`, `/club/manage`                                      | `people.tsx`                         | `api/people`, `api/people/export`                 |
| `/registrations`, `/registrations/mine`, `/inscription/[id]` | `registrations.tsx`                  | `api/registrations`                               |
| `/registration-widget/[id]`                                  | page autonome intégrable (iframe)    | `api/registrations/public/[id]`                   |
| `/documents`                                                 | `documents.tsx`                      | `api/documents`, `api/documents/file/[id]`        |
| `/calendar`                                                  | `calendar.tsx`, `calendar-board.tsx` | `api/calendar`, `api/calendar/feed/[token]` (ICS) |
| `/attendance`                                                | `attendance.tsx`                     | `api/attendance`                                  |
| `/statistics` (bouton de l'accueil)                          | `statistics.tsx`                     | `api/attendance`                                  |
| `/dues`                                                      | `dues.tsx`                           | `api/dues`                                        |
| `/messages`                                                  | `messages.tsx`                       | `api/messages`                                    |
| `/notifications`                                             | `notifications.tsx`                  | `api/notifications`                               |
| `/funding`                                                   | page statique (financement)          | aucune                                            |

`api/health` répond `200` si la base est joignable, `503` sinon.
