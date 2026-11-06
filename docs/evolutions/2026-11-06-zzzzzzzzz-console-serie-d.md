# Console, série D : fiche enrichie et sécurité des opérateurs

Suite des neuf améliorations demandées le 06/11/2026 pour la console (points 7 et 9).

## La fiche d'une organisation, enrichie

- **Premiers pas** : la liste de ce qu'une organisation a fait sur la plateforme, coché ou non (club : présidence active, accord de traitement, numéro d'entreprise et adresse, saison, équipe, joueurs, match, abonnement, facture payée ; fédération : présidence, identité, clubs affiliés, barème, saison, compétition, abonnement, facture payée), avec le compte « n sur total ». L'opérateur voit où en est un nouveau venu sans lire ses données.
- **Frise** : les soixante derniers événements de l'organisation sur la plateforme, du plus récent au plus ancien : création, présidences, accord signé, abonnements, factures envoyées et payées, interventions des opérateurs (suspension, accès de support, rappels, réponses du support), demandes RGPD reçues et traitées, tickets, fermeture demandée, saisons. Pas de donnée personnelle hors les noms des responsables.
- **Doublons probables** : les fiches actives qui existent probablement dans un autre club sous une autre identité (même nom, même date de naissance, personnes différentes). La console compte et ne nomme pas ; **Signaler à la présidence** envoie une notification sans nom (journalisée dans `platform_action` et dans le journal du club, `platform.duplicates_notify`). Relevé quotidien `duplicates`.
- Côté club, dans **Sécurité et données**, la carte **Doublons probables** liste les fiches concernées ; la présidence demande à la personne le code d'identité imprimé sur sa fiche et la **rattache** (`linkIdentity`) : la fiche rejoint cette identité, l'ancienne disparaît si plus rien ne la porte (ni compte, ni autre fiche, ni registre, ni dossier international) ; journal `privacy.identity_link`. La plateforme ne fusionne jamais elle-même.

## La sécurité des opérateurs

- **Sessions courtes** : la console demande une session de moins de `PFM_OPERATOR_SESSION_HOURS` heures (12 par défaut) ; passé ce délai, `OPERATOR_SESSION_EXPIRED` renvoie l'opérateur à la connexion (l'application elle-même reste ouverte). Une clé du serveur MCP n'a pas de session et n'est pas concernée.
- **Journal des connexions** : chaque session utilisée sur la console est consignée (`operator_session_log` : début, premier et dernier appel, adresse, navigateur et système sans plus de détail, nombre d'appels), conservée après la fin de la session. Onglet Opérateurs, carte **Connexions à la console** : les miennes ; le propriétaire lit celles de tous.
- **Revue des clés MCP** : chaque clé active porte ce qui mérite une revue : jamais utilisée après 30 jours, inactive depuis 60 jours, de plus de 180 jours. Carte **Revue des clés MCP** (le propriétaire voit toutes les clés et peut révoquer n'importe laquelle, journal `mcp.key.revoke` avec son propriétaire) ; badge sur ses propres clés ; règle d'alerte **Clés MCP à revoir**.
- Pas de WebAuthn : la décision de retirer l'authentification à deux facteurs reste.

## Migrations

`0136_console_security.sql` (additive, idempotente) : `operator_session_log`.

## Vérification

- `tests/integration/console-d.integration.ts` (deux clubs, trois opérateurs : premiers pas, frise, doublons comptés et signalés sans nom, rattachement par le club avec ses refus, session journalisée, session trop vieille refusée, clés à revoir et révocation par le propriétaire), `tests/international-console.test.ts` (durée de session, règles de revue, étapes, commandes, navigateur), e2e (fiche à 390 px, signalement, rattachement côté club, connexions et clés), matrice inchangée (mêmes routes).
