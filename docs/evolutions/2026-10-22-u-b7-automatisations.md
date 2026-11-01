# B7 : automatisation des emails et des rappels (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B7 (module 17 du cahier des charges). Catalogue prédéfini, sans constructeur libre ni SMS.

## Décisions
- **Dix règles** dans `src/domains/automations/catalog.ts` : relance de cotisation, pièce qui expire, inscription à vérifier, convocation sans réponse, permis qui expire, révision de fauteuil, ouverture et échéance de subside, renouvellement de sponsor, sponsor sans contact, tâche en retard.
- **Règles intégrées** : les rappels automatiques qui existaient déjà (cotisations, présences, permis, subsides, renouvellements) passent par le moteur **sans changer** : même texte (modèles de messages), même rythme, même destinataires. Ils gagnent la pause, l'arrêt global, la simulation et le journal. La relance de cotisation garde son interrupteur et ses délais dans Réglages › Relances.
- **Règles nouvelles** (désactivées par défaut) : déclencheur et conditions fixés par le catalogue, délai réglable dans des bornes, destinataires parmi ceux permis (la personne et sa famille, la présidence, le responsable), actions (notification dans l'application, email, tâche dans la to-do A1), message fr/nl/en modifiable avec `{person}`, `{about}`, `{date}`, `{organization}`.
- **Simulation = exécution** : le même `plan` liste qui recevrait quoi aujourd'hui (sans écrire) et sert à l'exécution réelle ; chaque ligne déjà faite est signalée.
- **Pas de double envoi** : clé d'idempotence (règle, entité, échéance, destinataire) unique dans `automation_run`, écrite avant l'envoi ; les règles intégrées gardent leurs propres garde-fous (relances espacées, `reminded_on`, clés d'événement).
- **Pas de boucle** : les règles ne lisent que les données métier ; « tâche en retard » ignore les tâches créées par une automatisation et ne crée jamais de tâche.
- **Une règle en panne n'empêche rien** : chaque règle tourne dans sa propre transaction, l'erreur est écrite au journal avec son code et les autres continuent ; rien ne tourne dans une requête d'utilisateur.
- **Plafond d'emails** : les emails passent par la file de B2, qui respecte `MAIL_DAILY_LIMIT` et reporte le reste au lendemain.
- **Exécution** : tâches planifiées de B2 (`attendance` toutes les 5 minutes pour les convocations, `reminders` toutes les heures pour le reste) et worker local.
- **Droits** : présidence et `notifications.manage`. Chaque requête nomme le club.

## Écran
Réglages › Notifications › Automatisations : arrêt global immédiat et reprise, une carte par règle (activée, en pause, délai, destinataires, actions, message par langue), « Simuler aujourd'hui », journal d'exécution (quand, règle, objet, destinataire, résultat, erreur).

## Code
- Migration `0068` : `automation_rule`, `organization.automations_stopped`, `automation_run` (clé unique), type de ressource `automation` dans la file d'emails.
- `src/domains/automations/` : catalogue, moteur (`plan`, `runAutomations`), service et schéma ; route `/api/automations` (`?simulate=1`).
- Relances existantes découpées pour la simulation : `duesReminderPlan`/`duesReminderDeliver`, `attendancePlan`, `licencePlan`, et `fundingTaskTick` par parties.
- Nouveau type de message `automation` (texte de la règle) et option `skipEmail` (notification seule).

## Données de démonstration
Le club démo active « Pièce qui expire » (30 jours) et « Sponsor sans contact » (90 jours).

## Tests
- Unitaires (`tests/b7-automations.test.ts`) : catalogue cohérent, règles intégrées actives par défaut, pas de tâche pour « tâche en retard », messages, commandes, textes.
- Intégration (`tests/integration/b7-automations.integration.ts`) : droits, règle lancée deux fois sans double envoi, simulation identique à l'exécution, pause et arrêt global immédiats (règle intégrée comprise), plafond d'emails atteint puis reprise le lendemain, passage de saison sans renvoi, pas de boucle entre règles, deux clubs ; tests voisins (présences, subsides, sponsors, tâches, B2) au vert.
- Bout en bout (`tests/e2e/automations.spec.ts`), axe et 390 px.
