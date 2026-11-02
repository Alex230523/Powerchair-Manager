# Matrice des droits

Fichier généré par `npm run audit:access` depuis `tests/access-matrix.ts` : ne pas le modifier à la main.

Chaque route d'API est appelée pour de vrai par chaque rôle (`tests/audit/access.spec.ts`), sur le club de démo, un deuxième club, la fédération de démo et une deuxième fédération. Le test échoue si la réponse diffère de ce tableau, si une lecture montre des données de l'autre club ou de l'autre fédération, ou si une écriture au corps vide est acceptée.

Lecture (GET) : « oui » accès, « connexion » il faut se connecter, « refusé » le rôle n'y a pas droit, « introuvable » rien à son nom (ou un identifiant qui n'existe pas), « invalide » requête incomplète, « · » pas de lecture.

## Routes d'API

| Route | Visiteur | Président | Coach | Joueur | Parent | Fédération | Arbitre | Permanent fédéral | Président club B | Fédération B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/absences` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/account/avatar` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/accounts` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/accounts/export` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/affiliations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/attendance` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/auth/[...all]` | · | · | · | · | · | · | · | · | · | · |
| `/api/authorizations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/automations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/bank` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/calendar` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/calendar/feed/[token]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/calendar/types` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/classification` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/classification/texts` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/club` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/club/logo` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/club/obligations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/coach-profile` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/communication` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/contacts` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/courses` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/courses/proof` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/cron/[job]` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/dashboard` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/designations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/documents` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/documents/file/[id]` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/documents/sign/[id]` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/dues` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/dues/attestations` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/dues/split` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/equipment` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/equipment/workshop` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/equipment/workshop/report` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/exercises` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/exercises/[id]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/exercises/[id]/diagram` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/exercises/program/[eventId]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/exports` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/family` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/federal-calendar` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/federation/affiliations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/federation/clubs` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/federation/licenses` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/federation/referees` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/federation/teams` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/operations` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/receipt/[id]` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/report` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/statements` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/finance/statements/[id]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/deadlines` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/grants/[id]/chairs` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/proof/[id]` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/report` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/report/proof` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/funding/tasks` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/fundraising` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/fundraising/public` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/governance` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/governance/journal` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/hall-of-fame/[widget]/[id]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/health` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/incidents` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/incidents/care` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/incidents/file` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/incidents/pdf` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/integrations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/licences` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/licences/copy` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/licenses` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/matches` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/matches/journey` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/matches/journey/sheet` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/notifications` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/notifications/preview` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/open-events` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/open-events/export` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/open-events/public` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/people` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/people/export` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/player-profile` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/presidency` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/privacy` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/privacy/export` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/privacy/mine` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/public/club/[slug]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/public/ics/[token]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/push` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/push/respond` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/referee` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/registrations` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/registrations/file/[id]` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/registrations/guest` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/registrations/public/[id]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/reminders` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/search` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/season-check` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/seasons/plan` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/seasons/rollover` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/setup` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/awards` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/awards/[id]/photo` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/club` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/game` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/statistics/report` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tasks` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tax` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tax/export` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tax/identity` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tax/receipt/[token]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tax/receipts/[id]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/teams` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tournaments` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tournaments/[id]` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tournaments/days` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tournaments/trophies` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tournaments/trophies/[id]/photo` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/transfers` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/transfers/threads` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/trips` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/tutorial` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/undo` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/unsubscribe` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/v1/events` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/v1/matches` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/v1/openapi.json` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/v1/teams` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/v1/tournaments` | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/venues` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/welcome/[token]` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| `/api/workspace` (+ écriture) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |

Notes :

- `/api/auth/[...all]` : Better Auth (connexion, inscription sur invitation) : couvert par tests/e2e/access.spec.ts
- `/api/authorizations` : Autorisations parentales : textes du club (Réglages › Documents), demandes à toutes les familles, relances ; refus par un parent (point 28)
- `/api/dues/split` : Deux foyers : qui reçoit les cotisations et les attestations d'un enfant, répartition en % (point 29)
- `/api/family` : Ma famille : les enfants de tous les clubs, réponses, autorisations, part des cotisations ; ses propres coordonnées (points 27 à 29)
- `/api/privacy/mine` : « Mes données » : ce que la plateforme garde sur la personne connectée (point 12)
- `/api/season-check` : Vérification de début de saison : ce que la personne connectée doit relire ; ?view=club pour le suivi du club (point 8)
- `/api/seasons/plan` : Préparer la saison suivante : l'assistant annuel, réservé à la présidence du club (point 16)

## Pages

Une page se charge pour toute personne connectée ; ce qu'elle montre dépend de l'API qu'elle lit. « menu » : la page figure dans le menu du rôle.

| Page | Président | Coach | Joueur | Parent | Fédération | Arbitre | Permanent fédéral | Président club B | Fédération B | API |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` |  |  |  |  |  |  |  |  |  |   |
| `/access` |  |  |  |  |  |  |  |  |  |   |
| `/attendance` |  |  |  |  |  |  |  |  |  |   |
| `/c/[slug]` |  |  |  |  |  |  |  |  |  |   |
| `/classification` |  |  |  |  |  |  |  |  |  |   |
| `/c/[slug]/widget/[kind]` |  |  |  |  |  |  |  |  |  |   |
| `/cagnotte/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/calendar` |  |  |  |  |  |  |  |  |  |   |
| `/club` |  |  |  |  |  |  |  |  |  |   |
| `/club/manage` |  |  |  |  |  |  |  |  |  |   |
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
| `/federation/licenses` |  |  |  |  |  |  |  |  |  |   |
| `/federation/referees` |  |  |  |  |  |  |  |  |  |   |
| `/federation/teams` |  |  |  |  |  |  |  |  |  |   |
| `/funding` |  |  |  |  |  |  |  |  |  |   |
| `/funding/affiliations` |  |  |  |  |  |  |  |  |  |   |
| `/funding/annual-accounts` |  |  |  |  |  |  |  |  |  |   |
| `/funding/budget` |  |  |  |  |  |  |  |  |  |   |
| `/funding/grants` |  |  |  |  |  |  |  |  |  |   |
| `/funding/grants-sponsors` |  |  |  |  |  |  |  |  |  |   |
| `/funding/operations` |  |  |  |  |  |  |  |  |  |   |
| `/funding/partners` |  |  |  |  |  |  |  |  |  |   |
| `/funding/partners/[id]/agreement` |  |  |  |  |  |  |  |  |  |   |
| `/funding/report` |  |  |  |  |  |  |  |  |  |   |
| `/funding/statements` |  |  |  |  |  |  |  |  |  |   |
| `/funding/tax` |  |  |  |  |  |  |  |  |  |   |
| `/fundraising` |  |  |  |  |  |  |  |  |  |   |
| `/hall-of-fame-widget/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/incidents` |  |  |  |  |  |  |  |  |  |   |
| `/inscription/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/join` |  |  |  |  |  |  |  |  |  |   |
| `/licenses` |  |  |  |  |  |  |  |  |  |   |
| `/matches` |  |  |  |  |  |  |  |  |  |   |
| `/matches/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/messages` |  |  |  |  |  |  |  |  |  |   |
| `/notifications` |  |  |  |  |  |  |  |  |  |   |
| `/partner-report/[token]` |  |  |  |  |  |  |  |  |  |   |
| `/players` |  |  |  |  |  |  |  |  |  |   |
| `/players/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/players/[id]/payment/[receivable]` |  |  |  |  |  |  |  |  |  |   |
| `/players/former` |  |  |  |  |  |  |  |  |  |   |
| `/privacy` |  |  |  |  |  |  |  |  |  |   |
| `/referee` |  |  |  |  |  |  |  |  |  |   |
| `/registration-widget/[id]` |  |  |  |  |  |  |  |  |  |   |
| `/registrations` |  |  |  |  |  |  |  |  |  |   |
| `/registrations/mine` |  |  |  |  |  |  |  |  |  |   |
| `/reminders` |  |  |  |  |  |  |  |  |  |   |
| `/settings` |  |  |  |  |  |  |  |  |  |   |
| `/settings/[category]` |  |  |  |  |  |  |  |  |  |   |
| `/statistics` |  |  |  |  |  |  |  |  |  |   |
| `/statistics/club` |  |  |  |  |  |  |  |  |  |   |
| `/statistics/game` |  |  |  |  |  |  |  |  |  |   |
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
| `/venues` |  |  |  |  |  |  |  |  |  |   |
| `/welcome/[token]` |  |  |  |  |  |  |  |  |  |   |
