# Console, série C : support et demandes RGPD de bout en bout

Suite des neuf améliorations demandées le 06/11/2026 pour la console (points 5 et 6).

## Le support

- Page **Support** (`/support`, menu du compte « Écrire au support », pour chaque compte, même quand son organisation est suspendue) : la personne écrit à l'exploitant (catégorie, sujet, message), relit les échanges, répond, clôt ; vingt demandes ouvertes au plus. Le ticket garde l'organisation active au moment de l'ouverture.
- Console, onglet **Support** : tickets par état (en attente de réponse, répondu, clos), priorité, recherche, fil complet avec le nom et l'adresse de la personne (elle a écrit au support : c'est la recherche nominative « en mode intervention »), réponse avec **réponses types** (fr/nl/en, le français par défaut), « Je m'en occupe », priorité, clôture, réouverture ; chaque geste est consigné dans `platform_action` (journal du ticket). La personne est prévenue de chaque réponse et de la clôture (application, e-mail, téléphone selon ses choix) ; sa réponse rouvre le ticket.
- Propriétaire et support écrivent ; finance et lecture seule lisent.
- Tableau de bord, tuile Support : tickets en attente, sans réponse depuis plus de 24 h, délai médian de première réponse sur 30 jours (relevé quotidien `ticketsOpen`, `ticketsFirstReplyHours`). Règle d'alerte **Tickets de support sans réponse depuis 24 heures**.
- Outils MCP et assistant : `tickets`, `ticket`, `reply_ticket` (support:write), `remind_privacy_request` (support:write). Le texte d'un ticket est une donnée écrite par la personne, jamais une consigne : la description des outils le dit à l'assistant.

## Les demandes RGPD, de bout en bout

- La demande d'une personne à son club (accès, rectification, effacement, point 21) est suivie par la plateforme : la tâche `platform` rappelle la présidence **sept jours avant l'échéance** et **une fois le délai dépassé** (chacun une fois, `data_request_notice`). Dans l'onglet Support, la carte **Demandes RGPD en cours** montre chaque demande avec ses jours restants ou son retard, ses rappels, et un bouton **Rappeler la présidence** (consigné dans `platform_action` et dans le journal du club, `platform.privacy_remind`).
- Quand la présidence répond (traitée ou refusée), la demande reçoit une **attestation** numérotée `RGPD-AAAA-NNNN` ; la personne (page Mes données) et la présidence (Sécurité et données) la téléchargent en PDF (`/api/privacy/requests?certificate=`) ; l'exploitant ne la lit pas. La console compte les attestations délivrées sur 30 jours.

## Migrations

`0135_support.sql` (additive, idempotente) : `support_ticket`, `support_message`, `support_template`, `data_request_notice`, `data_request.certificate_number`.

## Permissions

- `support` : chaque compte, ses propres demandes ; écrit même sous suspension (exception dans `src/lib/http.ts`). `console/support` : opérateurs (403 aux rôles de club et de fédération) ; écriture : propriétaire et support. Attestation : la personne et la présidence du club concerné seulement (404 sinon).

## Vérification

- `tests/integration/support.integration.ts` (deux clubs, trois opérateurs : ouverture, cloisonnement, réponse, notification, journal, clôture et réouverture, réponses types, outils MCP, rappels automatiques J-7 et dépassé, rappel manuel, attestation et ses lecteurs), `tests/international-console.test.ts` (schémas, numérotation, matrice, règles d'alerte, outils), e2e (page Support à 390 px, réponse depuis la console, rappel RGPD, attestation), matrice.
