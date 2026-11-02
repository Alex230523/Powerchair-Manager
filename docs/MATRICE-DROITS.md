# Matrice des droits

Fichier généré par `npm run audit:access` depuis `tests/access-matrix.ts` : ne pas le modifier à la main.

Chaque route d'API est appelée pour de vrai par chaque rôle (`tests/audit/access.spec.ts`), sur le club de démo, un deuxième club, la fédération de démo et une deuxième fédération. Le test échoue si la réponse diffère de ce tableau, si une lecture montre des données de l'autre club ou de l'autre fédération, ou si une écriture au corps vide est acceptée.

Lecture (GET) : « oui » accès, « connexion » il faut se connecter, « refusé » le rôle n'y a pas droit, « introuvable » rien à son nom (ou un identifiant qui n'existe pas), « invalide » requête incomplète, « · » pas de lecture.

## Routes d'API

| Route | Visiteur | Président | Coach | Joueur | Parent | Fédération | Arbitre | Permanent fédéral | Président club B | Fédération B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/absences` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/account/avatar` | connexion | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/accounts` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/accounts/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/affiliations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/attendance` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/auth/[...all]` | · | · | · | · | · | · | · | · | · | · |
| `/api/authorizations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/automations` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/bank` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/calendar` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/calendar/feed/[token]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/calendar/season` (+ écriture) | connexion | oui | refusé | refusé | refusé | oui | refusé | refusé | oui | oui |
| `/api/calendar/types` | connexion | oui | refusé | refusé | refusé | oui | refusé | refusé | oui | oui |
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
| `/api/documents` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/documents/file/[id]` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/documents/sign/[id]` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/dues` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/dues/attestations` | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/dues/split` (+ écriture) | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/equipment` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
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
| `/api/finance` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/finance/operations` | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/finance/receipt/[id]` (+ écriture) | connexion | introuvable | refusé | refusé | refusé | refusé | refusé | refusé | introuvable | refusé |
| `/api/finance/report` | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/finance/statements` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/finance/statements/[id]` | connexion | introuvable | refusé | refusé | refusé | refusé | refusé | refusé | introuvable | refusé |
| `/api/funding` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/funding/deadlines` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/funding/grants/[id]/chairs` | connexion | introuvable | refusé | refusé | refusé | refusé | refusé | refusé | introuvable | refusé |
| `/api/funding/proof/[id]` (+ écriture) | connexion | introuvable | introuvable | introuvable | introuvable | refusé | refusé | refusé | introuvable | refusé |
| `/api/funding/report` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/funding/report/proof` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/funding/tasks` | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/fundraising` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/fundraising/public` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/governance` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/governance/journal` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
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
| `/api/notifications` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/notifications/preview` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/open-events` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/open-events/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/open-events/public` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/people` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/people/export` | connexion | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/player-profile` (+ écriture) | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/presidency` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/privacy` (+ écriture) | connexion | oui | refusé | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/privacy/export` | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide | invalide |
| `/api/privacy/mine` | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/public/club/[slug]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/public/ics/[token]` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |
| `/api/push` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/push/respond` (+ écriture) | · | · | · | · | · | · | · | · | · | · |
| `/api/referee` (+ écriture) | connexion | refusé | refusé | refusé | refusé | refusé | oui | refusé | refusé | refusé |
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
| `/api/statistics/awards` (+ écriture) | connexion | oui | oui | oui | oui | refusé | refusé | refusé | oui | refusé |
| `/api/statistics/awards/[id]/photo` | connexion | introuvable | introuvable | introuvable | introuvable | refusé | refusé | refusé | introuvable | refusé |
| `/api/statistics/club` | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
| `/api/statistics/game` | connexion | oui | oui | refusé | refusé | refusé | refusé | refusé | oui | refusé |
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
| `/api/welcome/[token]` (+ écriture) | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/api/workspace` (+ écriture) | connexion | oui | oui | oui | oui | oui | oui | oui | oui | oui |

Notes :

- `/api/auth/[...all]` : Better Auth (connexion, inscription sur invitation) : couvert par tests/e2e/access.spec.ts
- `/api/authorizations` : Autorisations parentales : textes du club (Réglages › Documents), demandes à toutes les familles, relances ; refus par un parent (point 28)
- `/api/calendar/season` : Planifier la saison : congés scolaires de référence, fermetures, créneaux de la saison (H9)
- `/api/cron/[job]` : Appelé par le planificateur avec CRON_SECRET seulement : 401 sans le secret, 503 tant qu'aucun secret n'est configuré (tests/b2-production.test.ts)
- `/api/dues/split` : Deux foyers : qui reçoit les cotisations et les attestations d'un enfant, répartition en % (point 29)
- `/api/family` : Ma famille : les enfants de tous les clubs, réponses, autorisations, part des cotisations ; ses propres coordonnées (points 27 à 29)
- `/api/keys` : Clés et badges d'un coach ou d'un membre du staff (H10)
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
| `/calendar/season` |  |  |  |  |  |  |  |  |  |   |
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
| `/trips/[id]/roadsheet` |  |  |  |  |  |  |  |  |  |   |
| `/venues` |  |  |  |  |  |  |  |  |  |   |
| `/welcome/[token]` |  |  |  |  |  |  |  |  |  |   |
