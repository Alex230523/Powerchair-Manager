# Sécurité : autorisations mal définies

Audit du 07/11/2026 : les droits sont-ils bien découpés ? Chaque rôle ne tient-il que ce dont il a besoin, personne ne peut-il donner plus qu'il n'a, et un accès ou une clé s'arrête-t-il quand la raison de l'avoir s'arrête ? (L'accès d'un club aux données d'un autre a fait l'objet de l'audit BOLA du 06/11/2026.)

## Ce qui tenait déjà

- Gérer les mandats (`mandates.manage`) n'appartient qu'aux présidences et ne se délègue jamais.
- Une présidence de club ne tient aucune compétence de la fédération ; une présidence de fédération ne tient ni les personnes, ni l'argent, ni les fichiers d'un club.
- Les autres rôles tiennent exactement ce qui leur a été donné, rien d'inconnu.
- Personne ne donne plus qu'il ne tient, ni ne se donne de droits, ni ne touche une présidence, et une invitation est relue à son acceptation : si celui qui l'a envoyée n'a plus ses droits, elle ne vaut plus.
- Un lien parent seulement déclaré ne donne rien à voir (contrainte en base).

## Failles trouvées et corrigées

- **Accès de support trop large.** « Ouvrir comme président (support) » donne à un opérateur de la plateforme une présidence de 5 à 120 minutes. Rien ne la distinguait d'une vraie : pendant ce temps, l'opérateur pouvait inviter un nouveau président et transmettre la présidence, se donner ou donner des droits, révoquer un mandat ou désactiver un membre, modifier les rôles d'équipe, créer une clé d'API, une clé pour Claude ou un webhook qui lui survivaient, et changer l'IBAN du club ou du compte des cotisations. Il ne peut plus rien de cela (`SUPPORT_LIMITED`, avec une phrase claire), et la fenêtre d'ouverture le lui dit d'avance. Il garde ce pour quoi il vient : regarder, corriger une fiche, un nom, un calendrier.
- **Clés et webhooks orphelins.** Une clé d'API publique et un webhook continuaient de parler pour le club après le départ du président qui les avait créés (fin de mandat, membre désactivé, compte désactivé), et la clé marchait encore pour un club suspendu. Ils ne valent plus que tant que leur créateur préside, est membre actif et a un compte actif (comme les clés pour Claude, dont la vérification oubliait le membre et le compte : corrigé). Un webhook n'envoie plus rien, même un envoi déjà en attente. À la passation de présidence, les clés et webhooks du président sortant sont révoqués, et l'écran les montre comme tels ; le nouveau président crée les siens (l'aide de l'écran le dit).
- **Registre fédéral lu par tous les délégués.** Le registre des classifications (chaque joueur de la fédération, son club, sa classe) était lisible par tout délégué fédéral, communication, trésorerie ou formations comprises. Il est réservé aux compétences qui s'en servent : licences, classification, compétitions, discipline ; le menu suit.

## Durcissement

- **Rôles d'équipe à l'invitation.** Un délégué qui peut inviter pouvait joindre à son invitation un rôle d'équipe portant des droits qu'il n'a pas (le trésorier, par exemple). L'acceptation ne les donnait pas (la grille de l'invitation les retirait), mais la personne apparaissait avec ce rôle. Désormais refusé à l'envoi, et revérifié à l'acceptation : les droits des rôles joints comptent comme ceux de l'invitation.

## Garde-fous

- `tests/authz-safety.test.ts` : ce que tient chaque rôle par lui-même, les délégations plafonnées (rôles d'équipe compris), les sept portes fermées à l'accès de support, la condition de présidence des clés et des webhooks (envoi en attente compris), la révocation à la passation, le registre et son menu, les textes dans les trois langues.
- `tests/integration/secu-authz.integration.ts` (club A, club B, fédération) : invitation avec un rôle trop riche refusée, invitation écrite plus tôt refusée à l'acceptation, la même par la présidence acceptée ; accès de support refusé partout où il ne doit pas aller, nom corrigé, rien laissé derrière ; clés, clé Claude et webhook arrêtés au départ de la présidente, revenus à son retour, révoqués à la passation, ceux du club B intacts ; registre refusé à la communication et à la trésorerie, ouvert à la classification et à la présidence.
- `tests/e2e/support-limits.spec.ts` (390 px, axe) : l'opérateur en accès de support voit le changement d'IBAN refusé avec la raison, corrige le nom du club ; l'IBAN reste le même.

## Vérification

```
npx vitest run tests/authz-safety.test.ts
npm run test:integration -- secu-authz
npx playwright test tests/e2e/support-limits.spec.ts
npm run audit:access
```
