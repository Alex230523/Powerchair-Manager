# Matrice des droits

Fichier généré par `npm run audit:access` depuis `tests/access-matrix.ts` : ne pas le modifier à la main.

Chaque route d'API est appelée pour de vrai par chaque rôle (`tests/audit/access.spec.ts`), sur le club de démo, un deuxième club, la fédération de démo et une deuxième fédération. Le test échoue si la réponse diffère de ce tableau, si une lecture montre des données de l'autre club ou de l'autre fédération, ou si une écriture au corps vide est acceptée.

Lecture (GET) : « oui » accès, « connexion » il faut se connecter, « refusé » le rôle n'y a pas droit, « introuvable » rien à son nom (ou un identifiant qui n'existe pas), « invalide » requête incomplète, « · » pas de lecture.

## Routes d'API

| Route | Visiteur | Président | Coach | Joueur | Parent | Fédération | Arbitre | Permanent fédéral | Président club B | Fédération B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/absences` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/account/avatar` | connexion | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/accounts` (+ écriture) | connexion | oui | refusé | refusé | refusé | oui | refusé | oui | oui | oui |
| `/api/accounts/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/affiliations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/association` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/attendance` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/auth/[...all]` | · | · | · | · | · | · | · | · | · | · |
| `/api/authorizations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/automations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/bank` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/calendar` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/calendar/feed/[token]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/calendar/season` (+ écriture) | connexion | oui | refusé | refusé | refusé | oui | refusé | refusé | oui | oui |
| `/api/calendar/types` | connexion | oui | refusé | refusé | refusé | oui | refusé | refusé | oui | oui |
| `/api/circulars` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/circulars/file` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/classification` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/classification/texts` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/club` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/club/logo` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/club/obligations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/coach-profile` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/communication` (+ écriture) | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/contacts` (+ écriture) | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/courses` (+ écriture) | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/courses/proof` | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/cron/[job]` | · | · | · | · | · | · | · | · | · | · |
| `/api/dashboard` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/designations` (+ écriture) | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/discipline` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/documents` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/documents/file/[id]` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/documents/sign/[id]` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/dues` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/dues/attestations` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/dues/attestations/form` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/dues/attestations/pdf` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/dues/attestations/settings` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/dues/split` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/equipment` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/equipment/compliance` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/equipment/workshop` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/equipment/workshop/report` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/exercises` (+ écriture) | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/exercises/[id]` | connexion | introuvable | introuvable | refusé | refusé | refusé | refusé | refusé | introuvable | refusé |
| `/api/exercises/[id]/diagram` | connexion | introuvable | introuvable | refusé | refusé | refusé | refusé | refusé | introuvable | refusé |
| `/api/exercises/program/[eventId]` | connexion | introuvable | introuvable | refusé | refusé | refusé | refusé | refusé | introuvable | refusé |
| `/api/exports` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/family` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/federal-calendar` | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/federation/affiliations` (+ écriture) | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/federation/clubs` (+ écriture) | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/federation/licenses` (+ écriture) | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/federation/referees` | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/federation/teams` | connexion | refusé | refusé | refusé | refusé | oui | refusé | oui | refusé | oui |
| `/api/feedback` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/feedback/shot/[token]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance` (+ écriture) | connexion | oui | refusé | refusé | refusé | oui | refusé | oui | oui | oui |
| `/api/finance/allocations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/forecast` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/operations` | connexion | oui | refusé | refusé | refusé | oui | refusé | oui | oui | oui |
| `/api/finance/receipt/[id]` (+ écriture) | connexion | introuvable | refusé | refusé | refusé | introuvable | refusé | introuvable | introuvable | introuvable |
| `/api/finance/report` | connexion | oui | refusé | refusé | refusé | oui | refusé | oui | oui | oui |
| `/api/finance/statements` (+ écriture) | connexion | oui | refusé | refusé | refusé | oui | refusé | oui | oui | oui |
| `/api/finance/statements/[id]` | connexion | introuvable | refusé | refusé | refusé | introuvable | refusé | introuvable | introuvable | introuvable |
| `/api/funding` (+ écriture) | connexion | oui | refusé | refusé | refusé | oui | refusé | oui | oui | oui |
| `/api/funding/attachment` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/deadlines` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/funding/grants/[id]/chairs` | connexion | introuvable | refusé | refusé | refusé | introuvable | refusé | introuvable | introuvable | introuvable |
| `/api/funding/proof/[id]` (+ écriture) | connexion | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/funding/report` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/funding/report/proof` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/funding/tasks` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/fundraising` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/fundraising/public` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/governance` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/governance/journal` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/guide` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/guide/image` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/guide/knowledge` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/guide/public` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/hall-of-fame/[widget]/[id]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/health` | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/incidents` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/incidents/care` | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/incidents/file` | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/incidents/pdf` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/integrations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/keys` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/licences` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/licences/copy` | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/licenses` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/matches` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/matches/journey` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/matches/journey/sheet` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/news` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/notifications` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/notifications/preview` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/offboarding` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/onboarding` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/open-events` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/open-events/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/open-events/public` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/people` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/people/export` | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/player-profile` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/player-profile/overview` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/polls` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/polls/answer` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/presidency` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/privacy` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/privacy/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/privacy/mine` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/public/club/[slug]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/public/ics/[token]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/push` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/push/respond` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/recruitment` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/referee` (+ écriture) | connexion | refusé | refusé | refusé | refusé | refusé | oui | refusé | refusé | refusé |
| `/api/refereeing` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/registrations` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/registrations/file/[id]` (+ écriture) | connexion | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/registrations/guest` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/registrations/public/[id]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/reminders` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/search` | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/season-check` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/seasons/plan` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/seasons/rollover` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/setup` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/staff-roles` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/awards` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/statistics/awards/[id]/photo` | connexion | introuvable | introuvable | introuvable | introuvable | refusé | refusé | refusé | introuvable | refusé |
| `/api/statistics/club` | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/statistics/game` | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/statistics/impact` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/report` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/tasks` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/tax` (+ écriture) | connexion | introuvable | introuvable | introuvable | introuvable | refusé | refusé | refusé | introuvable | refusé |
| `/api/tax/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/tax/identity` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/tax/receipt/[token]` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/tax/receipts/[id]` | connexion | introuvable | introuvable | introuvable | introuvable | refusé | refusé | refusé | introuvable | refusé |
| `/api/teams` (+ écriture) | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/tournaments` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/tournaments/[id]` | connexion | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/tournaments/days` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/tournaments/trophies` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/tournaments/trophies/[id]/photo` (+ écriture) | connexion | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/transfers` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/transfers/threads` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/trips` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/tutorial` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/undo` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/unsubscribe` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/v1/events` | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion |
| `/api/v1/matches` | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion |
| `/api/v1/openapi.json` | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/v1/teams` | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion |
| `/api/v1/tournaments` | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion | connexion |
| `/api/venues` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/venues/bookings` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/venues/bookings/file` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/welcome/[token]` (+ écriture) | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/workspace` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |

Notes :

- `/api/association` : Vie de l'ASBL : registre des membres, assemblée générale et conseil (point 17)
- `/api/auth/[...all]` : Better Auth (connexion, inscription sur invitation) : couvert par tests/e2e/access.spec.ts
- `/api/authorizations` : Autorisations parentales : textes du club (Réglages › Documents), demandes à toutes les familles, relances ; refus par un parent (point 28)
- `/api/calendar/season` : Planifier la saison : congés scolaires de référence, fermetures, créneaux de la saison (H9)
- `/api/circulars` : Circulaires : reçues par les membres et arbitres ; rédaction, envoi, suivi et export par la compétence communication de la fédération
- `/api/circulars/file` : Pièce jointe d'une circulaire : destinataires et communication de la fédération
- `/api/cron/[job]` : Appelé par le planificateur avec CRON_SECRET seulement : 401 sans le secret, 503 tant qu'aucun secret n'est configuré (tests/b2-production.test.ts)
- `/api/discipline` : Discipline (point 34) : bureau de la fédération (compétence discipline : règles par saison, sanctions proposées, décisions, recours, amendes) ; page du club (présidence et coachs ; recours et paiement des amendes par la présidence) ; ?player= historique d'un joueur (son club et sa fédération) ; ?file= pièce d'un recours
- `/api/dues/attestations/form` : Formulaire propre à une mutuelle, vierge ou complété (point 9)
- `/api/dues/attestations/pdf` : Attestation de mutuelle en PDF, avec logo, BCE et signature (point 9)
- `/api/dues/attestations/settings` : Signataire et signature (administrateurs), envoi automatique des attestations (point 9)
- `/api/dues/split` : Deux foyers : qui reçoit les cotisations et les attestations d'un enfant, répartition en % (point 29)
- `/api/equipment/compliance` : Conforme pour un match : contrôles d'un fauteuil (lecture si le fauteuil est visible, saisie avec equipment.manage)
- `/api/family` : Ma famille : les enfants de tous les clubs, réponses, autorisations, part des cotisations ; ses propres coordonnées (points 27 à 29)
- `/api/feedback` : Signaler un problème dans l'application (point 19) : chaque compte, ses propres signalements et leur état ; 10 par jour ; envoi vers GitHub par le serveur, jeton jamais exposé
- `/api/feedback/shot/[token]` : Capture d'un signalement (déjà masquée), par jeton imprévisible, liée depuis l'issue d'un dépôt privé ; 404 sans jeton valide
- `/api/finance/allocations` : Fonds réservés : affectations, opérations rattachées, export justificatif (point 9)
- `/api/finance/forecast` : Trésorerie prévisionnelle sur 12 mois, simulations et seuil, export PDF (H4)
- `/api/funding/attachment` : Rapport d'impact joint au dossier d'un subside (H13)
- `/api/guide` : Guide du jeu : chapitres publiés de sa fédération ; rédaction par la fédération ; note « Chez nous » du club
- `/api/guide/image` : Image de la galerie ou photo d'un modèle : lecteurs de la fédération ; sans compte seulement si un chapitre public la montre
- `/api/guide/knowledge` : Lexique, galerie, catalogue des fauteuils, quiz : lecture par les membres de la fédération, rédaction par la fédération
- `/api/guide/public` : Public : chapitre ouvert par la fédération, sans compte
- `/api/keys` : Clés et badges d'un coach ou d'un membre du staff (H10)
- `/api/news` : Nouveautés (point 20) : chaque compte, filtrées sur le rôle du profil utilisé ; lu ou non lu et fenêtre désactivable par compte
- `/api/offboarding` : Fin de coach : le départ d'un coach (?profile=), pour qui gère les membres et pour le coach lui-même ; attestation PDF
- `/api/onboarding` : Parcours d'accueil : ses propres parcours ; modèles et suivi pour qui gère les membres
- `/api/player-profile/overview` : Vue d'ensemble d'une fiche (point 40) : chaque bloc selon le droit du lecteur ; jamais d'argent ni de santé pour un coach ; un parent voit celle de son enfant sans les notes du club ; 404 hors de l'organisation
- `/api/polls` : Mini-sondages du club et de la fédération : à répondre, créés, résultats, clôture vers un événement ou une tâche (H3)
- `/api/polls/answer` : Lien personnel d'un sondage, sans connexion, à usage unique (H3)
- `/api/privacy/mine` : « Mes données » : ce que la plateforme garde sur la personne connectée (point 12)
- `/api/recruitment` : Recrutement de nouveaux joueurs : prospects, essais, partenaires, indicateurs (H1)
- `/api/refereeing` : Arbitrage (points 25 et 36 à 39) : bureau de la fédération (compétence arbitrage : désignations, niveaux, barème, formations, notes de frais, export CSV, récapitulatif PDF) ; bureau de l'arbitre (réponses, itinéraires, rapport, notes de frais, formations) ; ?report= relecture du rapport par le club dans les 48 heures
- `/api/season-check` : Vérification de début de saison : ce que la personne connectée doit relire ; ?view=club pour le suivi du club (point 8)
- `/api/seasons/plan` : Préparer la saison suivante : l'assistant annuel, réservé à la présidence du club (point 16)
- `/api/staff-roles` : Rôles de staff : lecture par les membres du club, modification et attribution avec mandates.manage
- `/api/statistics/impact` : Rapport d'impact d'une période : chiffres, PDF, Excel, ajustements, réglages (H13)

## Pages

Une page se charge pour toute personne connectée ; ce qu'elle montre dépend de l'API qu'elle lit. « menu » : la page figure dans le menu du rôle.

| Page | Président | Coach | Joueur | Parent | Fédération | Arbitre | Permanent fédéral | Président club B | Fédération B | API |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` |  |  |  |  |  |  |  |  |  |   |
| `/access` |  |  |  |  |  |  |  |  |  |   |
| `/attendance` |  |  |  |  |  |  |  |  |  |   |
| `/c/[slug]` |  |  |  |  |  |  |  |  |  |   |
| `/circulars` |  |  |  |  |  |  |  |  |  |   |
| `/circulars/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/classification` |  |  |  |  |  |  |  |  |  |   |
| `/c/[slug]/widget/[kind]` |  |  |  |  |  |  |  |  |  |   |
| `/cagnotte/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/calendar` |  |  |  |  |  |  |  |  |  |   |
| `/calendar/season` |  |  |  |  |  |  |  |  |  |   |
| `/club` |  |  |  |  |  |  |  |  |  |   |
| `/club/manage` |  |  |  |  |  |  |  |  |  |   |
| `/club/association` |  |  |  |  |  |  |  |  |  |   |
| `/club/public` |  |  |  |  |  |  |  |  |  |   |
| `/club/rollover` |  |  |  |  |  |  |  |  |  |   |
| `/club/season-plan` |  |  |  |  |  |  |  |  |  |   |
| `/coaches` |  |  |  |  |  |  |  |  |  |   |
| `/coaches/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/coaches/former` |  |  |  |  |  |  |  |  |  |   |
| `/communication` |  |  |  |  |  |  |  |  |  |   |
| `/contacts` |  |  |  |  |  |  |  |  |  |   |
| `/design` |  |  |  |  |  |  |  |  |  |   |
| `/desinscription/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/discipline` |  |  |  |  |  |  |  |  |  |   |
| `/documents` |  |  |  |  |  |  |  |  |  |   |
| `/don/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/dues` |  |  |  |  |  |  |  |  |  |   |
| `/family` |  |  |  |  |  |  |  |  |  |   |
| `/dues/attestations` |  |  |  |  |  |  |  |  |  |   |
| `/equipment` |  |  |  |  |  |  |  |  |  |   |
| `/equipment/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/evenement/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/events` |  |  |  |  |  |  |  |  |  |   |
| `/events/checkin/[code]` |  |  |  |  |  |  |  |  |  |   |
| `/exercises` |  |  |  |  |  |  |  |  |  |   |
| `/exercises/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/exercises/program/[eventId]` |  |  |  |  |  |  |  |  |  |   |
| `/federal-calendar` |  |  |  |  |  |  |  |  |  |   |
| `/federation/affiliations` |  |  |  |  |  |  |  |  |  |   |
| `/federation/clubs` |  |  |  |  |  |  |  |  |  |   |
| `/federation/courses` |  |  |  |  |  |  |  |  |  |   |
| `/federation/discipline` |  |  |  |  |  |  |  |  |  |   |
| `/federation/licenses` |  |  |  |  |  |  |  |  |  |   |
| `/federation/referees` |  |  |  |  |  |  |  |  |  |   |
| `/federation/team` |  |  |  |  |  |  |  |  |  |   |
| `/federation/teams` |  |  |  |  |  |  |  |  |  |   |
| `/funding` |  |  |  |  |  |  |  |  |  |   |
| `/funding/affiliations` |  |  |  |  |  |  |  |  |  |   |
| `/funding/annual-accounts` |  |  |  |  |  |  |  |  |  |   |
| `/funding/budget` |  |  |  |  |  |  |  |  |  |   |
| `/funding/forecast` |  |  |  |  |  |  |  |  |  |   |
| `/funding/grants` |  |  |  |  |  |  |  |  |  |   |
| `/funding/grants-sponsors` |  |  |  |  |  |  |  |  |  |   |
| `/funding/operations` |  |  |  |  |  |  |  |  |  |   |
| `/funding/partners` |  |  |  |  |  |  |  |  |  |   |
| `/funding/partners/[id]/agreement` |  |  |  |  |  |  |  |  |  |   |
| `/funding/report` |  |  |  |  |  |  |  |  |  |   |
| `/funding/reserved` |  |  |  |  |  |  |  |  |  |   |
| `/funding/statements` |  |  |  |  |  |  |  |  |  |   |
| `/funding/tax` |  |  |  |  |  |  |  |  |  |   |
| `/guide` |  |  |  |  |  |  |  |  |  |   |
| `/guide/[slug]` |  |  |  |  |  |  |  |  |  |   |
| `/guide/chairs` |  |  |  |  |  |  |  |  |  |   |
| `/guide/chairs/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/guide/gallery` |  |  |  |  |  |  |  |  |  |   |
| `/guide/help` |  |  |  |  |  |  |  |  |  |   |
| `/guide/help/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/guide/lexicon` |  |  |  |  |  |  |  |  |  |   |
| `/guide/public/[federation]/[slug]` |  |  |  |  |  |  |  |  |  |   |
| `/fundraising` |  |  |  |  |  |  |  |  |  |   |
| `/hall-of-fame-widget/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/incidents` |  |  |  |  |  |  |  |  |  |   |
| `/inscription/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/join` |  |  |  |  |  |  |  |  |  |   |
| `/licenses` |  |  |  |  |  |  |  |  |  |   |
| `/matches` |  |  |  |  |  |  |  |  |  |   |
| `/matches/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/matches/[id]/terrain` |  |  |  |  |  |  |  |  |  |   |
| `/messages` |  |  |  |  |  |  |  |  |  |   |
| `/notifications` |  |  |  |  |  |  |  |  |  |   |
| `/nouveautes` |  |  |  |  |  |  |  |  |  |   |
| `/partner-report/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/players` |  |  |  |  |  |  |  |  |  |   |
| `/players/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/players/[id]/payment/[receivable]` |  |  |  |  |  |  |  |  |  |   |
| `/players/former` |  |  |  |  |  |  |  |  |  |   |
| `/privacy` |  |  |  |  |  |  |  |  |  |   |
| `/recrutement` |  |  |  |  |  |  |  |  |  |   |
| `/referee` |  |  |  |  |  |  |  |  |  |   |
| `/registration-widget/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/registrations` |  |  |  |  |  |  |  |  |  |   |
| `/registrations/mine` |  |  |  |  |  |  |  |  |  |   |
| `/reminders` |  |  |  |  |  |  |  |  |  |   |
| `/settings` |  |  |  |  |  |  |  |  |  |   |
| `/settings/[category]` |  |  |  |  |  |  |  |  |  |   |
| `/signalements` |  |  |  |  |  |  |  |  |  |   |
| `/sondage/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/sondages` |  |  |  |  |  |  |  |  |  |   |
| `/statistics` |  |  |  |  |  |  |  |  |  |   |
| `/statistics/club` |  |  |  |  |  |  |  |  |  |   |
| `/statistics/game` |  |  |  |  |  |  |  |  |  |   |
| `/statistics/impact` |  |  |  |  |  |  |  |  |  |   |
| `/statistics/report` |  |  |  |  |  |  |  |  |  |   |
| `/t/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/tasks` |  |  |  |  |  |  |  |  |  |   |
| `/teams` |  |  |  |  |  |  |  |  |  |   |
| `/teams/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/tournaments` |  |  |  |  |  |  |  |  |  |   |
| `/tournaments/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/tournaments/trophies` |  |  |  |  |  |  |  |  |  |   |
| `/transfers` |  |  |  |  |  |  |  |  |  |   |
| `/trips` |  |  |  |  |  |  |  |  |  |   |
| `/trips/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/trips/[id]/roadsheet` |  |  |  |  |  |  |  |  |  |   |
| `/venues` |  |  |  |  |  |  |  |  |  |   |
| `/welcome/[token]` |  |  |  |  |  |  |  |  |  |   |
