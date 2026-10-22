# A2 : « Subsides & sponsors », une entrée de menu, deux vues (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point A2.

## Décisions
- **Une page, deux vues dans l'adresse** : `/funding/grants-sponsors?vue=subsides` et `?vue=sponsoring`. Les anciennes adresses `/funding/grants` et `/funding/partners` redirigent vers la bonne vue en gardant leurs paramètres (`?grant=`, `?funder=`, `?partner=`, `?new=1`, `?tab=packages`). La convention de partenariat garde son adresse.
- **Une entrée dans le menu**, groupe Finances (« Argent ») : « Subsides & sponsors », pour `dues.read` ou `dues.manage`. Dans Finances › Rentrées, « Sponsors » et « Subsides » deviennent une seule entrée.
- **Données gardées telles quelles** (`grant_application`, `grant_funder`, `partner`, `partner_package`, `partner_package_condition`, `funding_task`), complétées par la migration additive `0065` :
  - subside : `opens_on` (ouverture de l'appel), `starts_on` (début de la période couverte, la fin existait) ;
  - table `grant_payment` : une ligne par tranche reçue ;
  - sponsor : `responsible_id` (personne du club) et `last_contact_on`.
- **Dernier contact** : saisi à la main ou par « Contact pris aujourd'hui » en attendant le journal d'échanges du CRM (A4), qui écrira la même colonne. Recommandation : garder cette colonne comme résumé même après A4, pour trier et filtrer vite.
- **Montant reçu** : la somme des tranches. Un subside accordé et entièrement reçu passe tout seul à « Versé », avec la date de la dernière tranche ; il reste un seul financement.
- **Alertes sans doublon**, toutes dans la to-do (A1) :
  - avant l'ouverture de l'appel, rien ; à l'ouverture, la tâche de dépôt apparaît (ou « L'appel est ouvert » sans échéance) et le président reçoit un message ;
  - rappels au président à J-30, J-7 et J-1 avant l'échéance (au lieu de J-14) ;
  - rapport justificatif (existant) ;
  - sponsor actif qui se termine dans les 60 jours : tâche « Renouveler le sponsoring », donnée au responsable ;
  - sponsor actif sans contact depuis 90 jours : tâche « Reprendre contact », fermée dès qu'un contact est noté.
- Les tâches automatiques restent dans la to-do ; la fiche d'un subside ou d'un sponsor garde sa check-list et ses contreparties.

## Vue Subsides
- Liste triable (DataGrid) : subside et organisme, période couverte, ouverture de l'appel, échéance avec badge, lien « Voir l'appel », contact, statut, « Déjà introduit », demandé, reçu sur accordé, dossier de l'année précédente, bouton « Tâches (n) » vers la to-do filtrée sur ce subside (`/tasks?grant=`).
- Totaux en tête qui suivent les filtres (statut, saison, organisme) : demandé, accordé, reçu.
- Formulaire : ouverture de l'appel et début de période en plus.
- Fiche : « Montants reçus », une ligne par tranche (date, montant, note), ajout et suppression ; « Préparer l'année prochaine » décale aussi l'ouverture et la période d'un an.

## Vue Sponsoring
- Liste triable : sponsor, pack, montant, statut et paiement, période, dernier contact (badge « Sans contact depuis 90 jours »), responsable, prochaine action, contreparties et bouton « Tâches (n) » (`/tasks?partner=`).
- Filtres statut et saison (saison du pack, ou période qui la chevauche) ; totaux : sponsoring signé et encaissé.
- Packs : panneau existant (création, modification, archivage, places restantes).
- Formulaire : responsable au club et dernier contact ; fiche : « Contact pris aujourd'hui ».

## Exports
Les exports Excel existants gardent leurs colonnes et reçoivent les nouvelles (période, ouverture, appel, introduit, reçu ; dernier contact, responsable, prochaine action).

## Données de démonstration
Un subside régional accordé avec une première tranche, un appel communal qui ouvre dans 10 jours, un sponsor à renouveler et à recontacter.

## Tests
- Unitaires (`tests/a2-grants-sponsors.test.ts`) : une entrée de menu selon les droits, rentrées regroupées, commandes, textes.
- Intégration (`tests/integration/a2-grants-sponsors.integration.ts`) : ouverture de l'appel puis tâche unique, tranches et passage à « Versé », année suivante, responsable et dernier contact, tâches de renouvellement et de silence, rappels J-30, J-7, J-1 et ouverture, droits et deux clubs.
- Bout en bout (`tests/e2e/grants-sponsors.spec.ts`), axe et 390 px ; `grants.spec.ts` mis à jour.
