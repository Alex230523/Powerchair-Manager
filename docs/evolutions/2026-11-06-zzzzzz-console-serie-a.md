# Console, série A : relevés quotidiens, tendances, alerte des opérateurs, rapport mensuel

Suite des neuf améliorations demandées le 06/11/2026 pour la console (points 1, 2 et 8).

## Relevés et tendances

- `platform_metric_daily` : une ligne par clé et par jour (clubs, fédérations, comptes, joueurs, coachs, licences, actifs 7 et 30 jours, matchs 30 jours, stockage, revenu récurrent, à encaisser, en retard, abonnements, signalements, demandes RGPD, sans président, suspendues, tâches en retard, clubs par pays). La tâche `platform` (toutes les heures) réécrit la ligne du jour.
- Le tableau de bord lit la valeur d'il y a 30 jours (variation « sur 30 jours » sur les tuiles, verte ou rouge) et la dernière valeur de chacun des douze derniers mois (carte **Tendances sur douze mois** : clubs, joueurs, actifs 30 jours, revenu récurrent, à encaisser). Sans relevé ancien, la variation ne s'affiche pas ; la carte le dit.

## Alerte quotidienne des opérateurs

- Dans l'onglet Opérateurs, **Mes alertes** : e-mail oui ou non, heure (Bruxelles) à partir de laquelle il peut partir, règles cochées (tâches en retard, e-mails en attente, demandes RGPD hors délai, factures au dernier rappel, sans président, suspendues, signalements reçus depuis 24 h, fermetures sous 30 jours). Par défaut : tout, dès 7 h.
- La tâche `platform` envoie l'alerte une fois par jour par opérateur, seulement s'il y a quelque chose selon ses règles, directement par le transport (comme le chien de garde, pas par la file qui pourrait être bloquée) ; journal `platform_alert_log`. La carte montre ce que l'alerte contiendrait maintenant et la date de la dernière envoyée.

## Rapport mensuel

- Le premier du mois (à la première exécution de `platform` qui trouve des relevés du mois écoulé), un **rapport d'exploitation** PDF est généré et archivé (`platform_report`) : clients (avec variation sur le mois et par pays), personnes et usage, revenus (récurrent, facturé, encaissé, à encaisser, rappels), support et conformité, exploitation (interventions, accès de support, tâches en échec, stockage).
- Onglet Supervision, **Rapports mensuels** : liste, téléchargement du PDF, régénération par le propriétaire ou la finance (journalisée).

## Migrations

`0133_console_metrics.sql` (additive, idempotente).

## Permissions

- `console/alerts`, `console/reports` : opérateurs seulement (403 aux rôles de club et de fédération) ; régénérer un rapport : propriétaire et finance.

## Vérification

- `tests/integration/console-metrics.integration.ts` (relevés, écrasement du jour, tendances, alerte par règles et par heure, une par jour, transport local, rapport une fois puis régénération), `tests/international-console.test.ts` (lignes du rapport), e2e (réglage des alertes, carte des rapports), matrice.
