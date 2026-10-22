# B2 : mise en production à coût zéro, prête mais non activée (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B2. Décision du propriétaire : code et documentation prêts, rien d'activé. La production reste ignorée par `vercel.json`, les workflows planifiés sont des modèles dans `docs/production/`.

## Ce qui est livré
- **Tâches de fond sans serveur permanent** : `src/domains/jobs/` (registre, exécution, santé, chien de garde). Cinq tâches idempotentes (`mail`, `attendance`, `reminders`, `documents`, `watchdog`) appelées par `/api/cron/<tâche>`, protégée par `CRON_SECRET` (32 caractères au moins, comparaison à temps constant ; sans secret, la route est fermée). Verrou `pg_try_advisory_lock` contre les doubles exécutions, une ligne par exécution dans `job_run` (migration `0067`). Les processus permanents de `scripts/` restent pour le local ; `scripts/run-job.ts` lance une tâche une fois.
- **Emails** : plafond quotidien `MAIL_DAILY_LIMIT` (heure de Bruxelles) et lot `MAIL_BATCH` ; le surplus reste en file et part le lendemain. `MAIL_ALLOW_EXTERNAL` reprend le garde-fou du worker. Lien de désinscription inchangé.
- **Fichiers** : `src/lib/storage-adapter.ts`, PostgreSQL par défaut ; les documents (chiffrés) passent par lui pour l'écriture et la lecture. Photos allégées dans le navigateur avant l'envoi (`src/lib/image-compress.ts`, 2 000 pixels, JPEG 82 %), branché sur l'envoi de documents.
- **Sauvegardes** : `scripts/backup.sh` (pg_dump compressé puis AES-256) et `scripts/restore-check.sh` (restauration dans une base jetable et comparaison des comptes de lignes), testés ici sur la base locale (et refus d'une mauvaise phrase de passe). La CI les exécute sur la base de démonstration ; le modèle `docs/production/backup.yml` les lance chaque nuit, artefact gardé 30 jours.
- **Observabilité** : journaux JSON sans donnée personnelle (`src/lib/log.ts`), `/api/health` enrichi (base, emails en retard, dernière exécution de chaque tâche), alerte email à l'opérateur au plus une fois par jour.
- **Sécurité** : en-têtes centralisés (`src/lib/security-headers.ts`) avec HSTS et une CSP prudente (cadre, plugins, cibles de formulaire, adresse de base) ; widgets toujours intégrables. Cookies : sécurisés dès que l'adresse est en HTTPS (comportement de better-auth, vérifié).
- **`docs/PRODUCTION.md`** : choix gratuits et quotas vérifiés, seuils qui obligent à payer, checklist pas à pas, variables, SPF, DKIM, DMARC, planification, sauvegardes, incident.

## Points d'attention relevés
- L'offre Hobby de Vercel est réservée à l'usage non commercial et cite « demander un paiement aux visiteurs » ; les cotisations (et B1) peuvent en relever. À faire confirmer par Vercel avant la mise en ligne, sinon offre Pro ou autre hébergeur.
- Vercel Cron en Hobby : une exécution par jour seulement ; d'où le planificateur GitHub (toutes les 30 minutes sur un dépôt privé pour rester sous 2 000 minutes) ou un service de cron gratuit.
- GitHub Actions est bloqué par la facturation du compte : à régler avant d'activer les modèles.

## Tests
- Unitaires (`tests/b2-production.test.ts`) : registre, budget d'emails, retard après deux cycles, secret, journaux sans donnée personnelle, taille des photos, stockage, en-têtes.
- Intégration (`tests/integration/b2-jobs.integration.ts`) : budget quotidien et report, une seule exécution à la fois, erreur écrite avec son code, santé des tâches, emails en retard, alerte une fois par jour sans donnée personnelle ; `documents.integration.ts` toujours au vert avec l'adaptateur.
