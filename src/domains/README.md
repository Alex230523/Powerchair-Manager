# `src/domains` : métier et autorisations

Un dossier par module. Les routes API appellent ces fonctions ; l'interface n'y accède jamais directement.

| Fichier      | Rôle                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| `schema.ts`  | Commandes acceptées (Zod) et calculs purs, testables sans base                      |
| `access.ts`  | Règles d'accès par enregistrement                                                   |
| `service.ts` | `<module>View()` (lecture) et `<module>Execute()` (commandes), dans une transaction |

| Module            | Responsabilité                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `access/`         | Comptes, organisations, mandats, contexte actif, profils enregistrés, `policy.ts` (rôles et permissions) |
| `people/`         | Personnes du club, familles et représentants, équipes, saisons, export CSV                               |
| `notifications/`  | Modèles, préférences, file d'emails (`mail_job`), notifications internes, worker                         |
| `registrations/`  | Formulaires, candidatures, décisions, pièces jointes                                                     |
| `documents/`      | Pièces demandées, versions chiffrées, validation, échéances, partage fédéral                             |
| `calendar/`       | Lieux, séries d'événements, visibilité, flux ICS                                                         |
| `attendance/`     | Convocations, réponses, pointage, relances                                                               |
| `dues/`           | Barèmes, créances, échéanciers (paiements : lot 09)                                                      |
| `messages/`       | Messagerie interne                                                                                       |
| `statistics/`     | Synthèse des présences (fonctions pures)                                                                 |
| `equipment/`      | Fauteuils de sport, révisions, liens fauteuil ↔ joueurs                                                  |
| `player-profile/` | Fiche joueur : vue personnelle (accompagnement, données confidentielles chiffrées) et vue sportive       |
| `club/`           | Identité du club (nom, contact, logo) et résumé des équipes                                              |
| `finance/`        | Grand livre du club : recettes, dépenses, annulations, synthèse de saison                                |
| `coaches/`        | Fiche coach, formations fédérales, demandes des clubs, clubs affiliés                                    |
| `reminders/`      | Relances cotisations et documents : personnes concernées, destinataires, envoi                           |
| `dashboard/`      | Tableau de bord en lecture seule, construit avec les règles d'accès des autres modules                   |

Point d'entrée recommandé pour comprendre le modèle : `access/policy.ts`, puis `access/service.ts` (`active()`, `requirePermission()`), puis un module simple comme `dues/`.
