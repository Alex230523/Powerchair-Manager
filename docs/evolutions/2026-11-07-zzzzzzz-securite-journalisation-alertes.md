# Sécurité : absence de journalisation et d'alertes

Audit du 07/11/2026 : si quelqu'un attaque la plateforme, est-ce que ça laisse une trace durable, et est-ce que quelqu'un est prévenu à temps ?

## Ce qui existait déjà

- Le journal de chaque club (`audit_log`) : qui a fait quoi, avec les droits avant et après.
- Le journal des opérateurs (`platform_action`) et celui de leurs sessions de console.
- Le chien de garde : un e-mail quand une tâche de fond est en retard ; l'alerte quotidienne des opérateurs (factures, demandes RGPD, tickets…).

## Failles trouvées et corrigées

- **Les attaques ne laissaient aucune trace durable.** Une adresse bloquée après dix mots de passe faux, une inondation refusée, une clé d'API essayée, une requête venue d'un autre site, un mauvais secret du planificateur : rien n'était écrit, ou seulement dans les journaux de l'hébergeur, que l'offre gratuite de Vercel garde une heure. Ils vont maintenant dans un **journal de sécurité** (`security_event`, migration `0142`), avec une ligne JSON dans les journaux de l'hébergeur. La source est l'empreinte d'une adresse réseau (ou d'une adresse e-mail), jamais l'adresse.
- **Les actions qui donnent le plus de pouvoir n'étaient pas surveillées.** Un opérateur ajouté ou retiré, une clé MCP d'opérateur créée, un accès de support, la connexion d'un opérateur, un export de données : journalisés aussi.
- **Personne n'était prévenu à temps.** Une nouvelle tâche « security » (toutes les cinq minutes, ajoutée au modèle du planificateur) envoie un e-mail aux propriétaires de la plateforme (et à `OPS_ALERT_EMAIL`), au plus une fois par règle et par heure, directement par le transport et non par la file d'e-mails (qui pourrait être ce qui est bloqué) :
  - tout événement critique (mauvais secret du planificateur, opérateur ajouté) ;
  - 3 adresses bloquées en 15 minutes (attaque par identifiants) ;
  - 10 inondations refusées, 20 clés refusées, 20 requêtes d'un autre site en 15 minutes ;
  - tout accès de support ouvert.
- **Les journaux pouvaient être réécrits.** Rien n'empêchait de modifier ou d'effacer une ligne du journal d'un club ou des opérateurs. La base refuse désormais toute modification des trois journaux, et tout effacement avant douze mois (la plus courte durée de conservation qu'un club peut choisir), qui que ce soit qui le demande.
- **Rien à lire.** La console (onglet Supervision) montre le journal de sécurité : les comptes du jour par gravité, les alertes envoyées, chaque événement avec son compte ou son organisation et le début de l'empreinte de sa source.

## Choix

- Le journal de sécurité garde douze mois, puis la tâche efface ce qui est plus ancien. Il n'a pas de clé étrangère : il survit à ce dont il parle et ne peut pas être réécrit par une suppression en cascade.
- Une écriture du journal qui échoue ne fait jamais échouer la demande de la personne : elle laisse une ligne `security.journal_failed` dans les journaux de l'hébergeur.
- Une requête d'un autre site est journalisée une fois la réponse partie (`after` de Next), sans ralentir le refus.

## À faire par l'exploitant

- Mettre la tâche `security` dans le planificateur (le modèle `docs/production/scheduler.yml` l'appelle déjà) ; renseigner `OPS_ALERT_EMAIL` si personne n'est propriétaire de la console.
- Pour garder aussi les journaux techniques au-delà d'une heure : un *Log Drain* Vercel vers un service de journaux (offre payante de Vercel) ; le journal de sécurité, lui, est dans la base.

## Garde-fous

- `tests/logging-safety.test.ts` : gravités et règles, tâche toutes les cinq minutes, ligne JSON sans donnée personnelle, journal qui n'échoue jamais la demande, chaque événement écrit là où il arrive, journaux non modifiables et douze mois, écran et textes dans les trois langues.
- `tests/integration/secu-logging.integration.ts` (club A, club B) : un blocage et une inondation journalisés une fois, sans l'adresse ni l'e-mail ; un accès de support sur le club A, jamais le club B ; journaux ni modifiables ni effaçables avant douze mois ; alertes aux propriétaires (accès de support, opérateur ajouté, trois blocages), jamais deux fois la même heure ; purge après douze mois ; journal lu par la console.
- `tests/e2e/security-journal.spec.ts` (390 px, axe) : la connexion de la propriétaire journalisée, le journal de sécurité lu dans la console, l'empreinte jamais montrée en entier.

## Vérification

```
npx vitest run tests/logging-safety.test.ts tests/b2-production.test.ts
npm run test:integration -- secu-logging
npx playwright test tests/e2e/security-journal.spec.ts
```
