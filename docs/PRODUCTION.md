# Mise en production à coût zéro

Ce guide met Powerchair Manager en ligne pour un vrai club, uniquement avec des offres gratuites. Rien n'est activé tant que tu ne suis pas ces étapes : la production reste ignorée par `vercel.json`, les modèles de workflow sont dans `docs/production/` (hors de `.github/workflows/`) et aucun abonnement n'est souscrit.

Quotas vérifiés le 22 octobre 2026 sur les pages officielles (liens en fin de document). Ils changent : relis-les avant de te lancer.

## 1. Les choix, et ce qui obligerait à payer

| Besoin | Service gratuit proposé | Limite gratuite | Seuil qui oblige à payer |
|---|---|---|---|
| Hébergement de l'application | Vercel, offre Hobby | 1 000 000 d'appels de fonction, 4 h de CPU actif, 100 Go de transfert par mois ; fonctions de 300 s au plus | Dépassement mensuel (le service se met en pause 30 jours), ou **usage commercial** (voir l'encadré) |
| Base PostgreSQL en Europe | Neon, offre Free, région Francfort (`aws-eu-central-1`) | 1 Go par projet, 100 heures de calcul par mois, mise en veille après 5 minutes, 6 heures d'historique | Plus de 1 Go de données (fichiers compris), ou besoin d'un historique plus long |
| Tâches de fond fréquentes | GitHub Actions planifié, ou cron-job.org | 2 000 minutes par mois sur un dépôt privé (illimité sur un dépôt public) ; chaque exécution compte au moins 1 minute | Planification plus fréquente que toutes les 30 minutes sur un dépôt privé |
| Tâches quotidiennes | Vercel Cron (Hobby) | 1 exécution par jour et par tâche, à l'heure près | Besoin d'une fréquence plus élevée |
| Emails automatiques | Brevo, offre gratuite (SMTP) | 300 emails par jour | Plus de 300 emails un même jour (le reste part le lendemain, voir § 4) |
| Sauvegardes | Artefacts GitHub Actions | 500 Mo de stockage d'artefacts (dépôt privé), 30 jours de conservation | Base de plus d'environ 15 Mo compressés × 30 jours |

> **Usage commercial et Vercel Hobby.** Les conditions de Vercel réservent l'offre Hobby à un usage personnel et non commercial, et citent comme commercial « toute manière de demander ou de traiter un paiement des visiteurs du site ». Les dons ne sont pas concernés. Une ASBL qui fait payer ses cotisations depuis l'application (QR de virement, B1) peut tomber dans ce cas. Avant la mise en ligne, demande confirmation au support de Vercel. Sinon, deux voies : l'offre Pro de Vercel (payante), ou un autre hébergeur dont l'offre gratuite accepte l'usage commercial (à vérifier au cas par cas). Rien dans le code ne dépend de Vercel : la même application tourne derrière `npm run build && npm start`.

> **GitHub Actions est actuellement bloqué** sur le compte du dépôt par un problème de facturation. Il faut le régler avant d'activer les modèles de workflow (planificateur et sauvegardes), ou passer par cron-job.org pour le planificateur.

## 2. Checklist de mise en ligne

1. **Base** : créer un projet Neon en région Francfort ; noter l'adresse de connexion `DATABASE_URL` (avec `sslmode=require`). Créer aussi un rôle en lecture seule pour les sauvegardes.
2. **Migrations** : `DATABASE_URL=… npm run db:migrate` depuis ton poste (elles sont additives et idempotentes).
3. **Premier président** : `npm run admin:bootstrap` (création) puis `npm run admin:account` (vérification), comme décrit dans `docs/GUIDE-LOCAL.md`. Jamais de comptes de démonstration en production.
4. **Hébergeur** : dans Vercel, ajouter les variables du § 3 en environnement *Production* uniquement, puis retirer la ligne `ignoreCommand` de `vercel.json` (c'est elle qui saute la production aujourd'hui).
5. **Domaine** : brancher le domaine du club, attendre le certificat HTTPS, mettre `BETTER_AUTH_URL=https://le-domaine`.
6. **Emails** : créer le compte Brevo, authentifier le domaine (§ 5), renseigner les variables SMTP, `MAIL_TRANSPORT=smtp`, `MAIL_ALLOW_EXTERNAL=true`, `MAIL_DAILY_LIMIT=300`.
7. **Tâches de fond** : générer `CRON_SECRET` (`openssl rand -hex 32`), le mettre sur l'hébergeur, puis activer le planificateur (§ 6). Ensuite seulement : `PFM_JOBS_EXPECTED=true`.
8. **Alertes** : `OPS_ALERT_EMAIL` ; brancher un moniteur de disponibilité gratuit sur `https://le-domaine/api/health`.
9. **Sauvegardes** : secrets `PROD_DATABASE_URL` et `BACKUP_PASSPHRASE`, copier `docs/production/backup.yml` dans `.github/workflows/`, lancer une fois à la main et vérifier l'étape de restauration.
10. **Vérification finale** : se connecter, créer un événement, recevoir l'email d'invitation, ouvrir `/api/health` (tout à `ok`), consulter le premier artefact de sauvegarde.

## 3. Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Base PostgreSQL (TLS) |
| `BETTER_AUTH_URL` | oui | Adresse publique du site, en `https://` (cookies sécurisés) |
| `BETTER_AUTH_SECRET` | oui | Au moins 32 caractères aléatoires ; sert aussi à chiffrer les documents et les emails en file |
| `MAIL_TRANSPORT` | oui | `smtp` en production (`local` écrit les emails dans un dossier) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | oui | Fournisseur d'emails ; `SMTP_FROM` sur le domaine authentifié |
| `MAIL_ALLOW_EXTERNAL` | oui | `true` : autorise l'envoi vers l'extérieur (garde-fou contre un envoi accidentel) |
| `MAIL_DAILY_LIMIT` | conseillé | Plafond quotidien du fournisseur (300 chez Brevo) |
| `MAIL_BATCH` | non | Emails par exécution (50 par défaut) |
| `CRON_SECRET` | oui | Ouvre `/api/cron/<tâche>` au planificateur (32 caractères au moins) |
| `PFM_JOBS_EXPECTED` | oui | `true` une fois le planificateur actif : une tâche jamais lancée devient « en retard » |
| `OPS_ALERT_EMAIL` | conseillé | Reçoit l'alerte « tâche de fond en retard » |
| `STORAGE_DRIVER` | non | `postgres` (seule valeur aujourd'hui) |
| `PFM_CONTACT_EMAIL` | non | Adresse affichée aux fédérations |
| `PFM_LOCAL_MAIL` | **jamais** en production | Capture locale des emails |
| `PFM_VAPID_PUBLIC_KEY`, `PFM_VAPID_PRIVATE_KEY` | pour les notifications sur téléphone (B4) | Paire de clés VAPID, générée une fois avec `node scripts/vapid-keys.mjs` ; la clé privée reste secrète, la changer désabonne tous les appareils |
| `PFM_VAPID_SUBJECT` | avec les clés | `mailto:` ou `https://` de contact pour les services de notification |
| `PUSH_TRANSPORT` | non | `web` par défaut en production avec les clés ; `local` écrit les notifications dans `PFM_PUSH_DIR` |

Secrets de GitHub (modèles de workflow) : `PFM_URL`, `CRON_SECRET`, `PROD_DATABASE_URL`, `BACKUP_PASSPHRASE`.

## 4. Emails automatiques

- Tous les emails passent par la file `mail_job` : chiffrés, dédoublonnés, retentés avec un délai croissant, et jamais envoyés à une personne qui a quitté le club ou s'est désinscrite. Le lien de désinscription reste dans les emails du club.
- La tâche `mail` envoie au plus `MAIL_BATCH` emails par exécution et s'arrête au `MAIL_DAILY_LIMIT` du jour (heure de Bruxelles). Le surplus reste « en attente » et part dès le lendemain, rien n'est perdu. `/api/health` montre les emails en attente depuis plus de 30 minutes.
- Exemple Brevo : SMTP `smtp-relay.brevo.com`, port 587, identifiant et clé SMTP du compte.

## 5. Domaine d'envoi : SPF, DKIM, DMARC

À faire chez le gestionnaire du domaine du club, avec les valeurs exactes que donne le fournisseur d'emails :

1. **SPF** : un seul enregistrement TXT sur le domaine, par exemple `v=spf1 include:spf.brevo.com ~all`. S'il en existe déjà un (messagerie du club), ajouter l'`include` dans le même enregistrement.
2. **DKIM** : l'enregistrement (TXT ou CNAME) fourni par le fournisseur, du type `mail._domainkey`. Attendre que le fournisseur affiche le domaine comme « authentifié ».
3. **DMARC** : un TXT sur `_dmarc`, en commençant par `v=DMARC1; p=none; rua=mailto:adresse-du-club`. Après deux à quatre semaines sans anomalie dans les rapports, passer à `p=quarantine`.
4. `SMTP_FROM` utilise ce domaine (par exemple `club@le-domaine.be`) ; les réponses vont à l'adresse de contact choisie par le club.

## 6. Tâches de fond

Les anciens processus permanents (`scripts/mail-worker.ts`, `documents-worker.ts`, `attendance-worker.ts`) ne tournent pas sur un hébergement sans serveur. Ils restent pour le poste local ; en production, chaque tâche est une fonction idempotente appelée par une route protégée :

| Tâche | Route | Rythme attendu | Contenu |
|---|---|---|---|
| `mail` | `/api/cron/mail` | 5 min | File d'emails, résumé hebdomadaire |
| `attendance` | `/api/cron/attendance` | 5 min | Rappels de présence, emails d'événement programmés |
| `reminders` | `/api/cron/reminders` | 60 min | Tâches automatiques (A1), relances de cotisations, subsides et sponsors, affiliations, permis, prêts de fauteuils |
| `documents` | `/api/cron/documents` | 60 min | Documents expirés |
| `watchdog` | `/api/cron/watchdog` | 60 min | Alerte si une tâche n'a pas tourné depuis deux cycles |

- Appel : `POST` (ou `GET`, ce que fait Vercel Cron) avec l'en-tête `Authorization: Bearer <CRON_SECRET>`. Sans `CRON_SECRET`, les routes répondent 503.
- Un verrou PostgreSQL (`pg_try_advisory_lock`) empêche deux exécutions simultanées ; la seconde répond `locked`. Chaque exécution est écrite dans `job_run` (nom, durée, compteurs, code d'erreur), sans donnée personnelle.
- En ligne de commande : `npx tsx scripts/run-job.ts mail`.

**Planifier gratuitement.** Le plus simple : copier `docs/production/scheduler.yml` dans `.github/workflows/` (toutes les 30 minutes, environ 1 440 minutes par mois sur un dépôt privé). Pour des emails plus réactifs, utiliser un service de cron gratuit qui sait envoyer un en-tête (par exemple cron-job.org, à vérifier) pour `mail` et `attendance` toutes les 5 minutes, et garder GitHub pour le reste. Vercel Cron en Hobby ne permet qu'une exécution par jour : utile seulement en secours pour `reminders` et `documents`, en ajoutant dans `vercel.json` :

```json
"crons": [
  { "path": "/api/cron/reminders", "schedule": "0 6 * * *" },
  { "path": "/api/cron/documents", "schedule": "30 6 * * *" }
]
```

## 7. Fichiers

- Les fichiers restent dans PostgreSQL (aucun coût, sauvegardés avec la base), chiffrés pour les documents. Les documents passent par `src/lib/storage-adapter.ts` : un stockage externe compatible S3 pourra s'y brancher plus tard (`STORAGE_DRIVER`), sans toucher aux modules.
- Limites existantes : 2 Mo par document envoyé, quota de stockage par club (vague 16). Les photos sont allégées dans le navigateur avant l'envoi (2 000 pixels au plus, JPEG 82 %, `src/lib/image-compress.ts`).
- Surveiller la taille de la base dans Neon : au-delà d'environ 800 Mo, prévoir le stockage externe ou l'offre payante.

## 8. Sauvegardes

- `scripts/backup.sh` : `pg_dump` au format compressé, puis chiffrement AES-256 avec `BACKUP_PASSPHRASE` (au moins 24 caractères). La phrase de passe doit aussi être gardée **hors de GitHub** (coffre du président, gestionnaire de mots de passe) : sans elle, aucune copie n'est lisible.
- `docs/production/backup.yml` : chaque nuit, copie chiffrée conservée 30 jours comme artefact, puis restauration dans une base jetable et comparaison des comptes de lignes (`scripts/restore-check.sh`).
- La CI fait déjà ce test sur la base de démonstration à chaque modification (étape « Backup and restore »).
- **Restaurer en vrai** : télécharger l'artefact, créer une base neuve, `BACKUP_PASSPHRASE=… RESTORE_URL=… scripts/restore-check.sh fichier.dump.enc`, vérifier, puis faire pointer `DATABASE_URL` vers elle. Ne jamais restaurer par dessus la base en service.
- Neon garde en plus 6 heures d'historique : utile pour annuler une erreur récente.

## 9. Observabilité

- Journaux en JSON, une ligne par événement (`src/lib/log.ts`) ; les champs qui ressemblent à une donnée personnelle (email, nom, téléphone) sont retirés avant l'écriture.
- `/api/health` : base joignable, emails en retard, dernière exécution et dernière réussite de chaque tâche. Réponse 200 avec `status: "degraded"` si une tâche est en retard, 503 si la base est injoignable. Aucune donnée personnelle.
- La tâche `watchdog` envoie un email à `OPS_ALERT_EMAIL` (au plus un par jour) quand une tâche a manqué deux cycles ou que des emails attendent depuis plus de 30 minutes.

## 10. Sécurité

- En-têtes sur toutes les pages (`src/lib/security-headers.ts`) : HSTS deux ans, CSP qui interdit l'intégration dans un cadre, les plugins et l'envoi de formulaires ailleurs, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Les widgets (inscription, palmarès) restent intégrables par les sites des clubs.
- Cookies de session : `Secure`, `HttpOnly` et `SameSite=Lax` dès que `BETTER_AUTH_URL` est en `https://`. Ne jamais mettre une adresse `http://` en production.
- Domaine : une seule adresse canonique (rediriger `www` vers le domaine nu ou l'inverse dans l'hébergeur), sinon les cookies et les liens des emails divergent.
- Secrets uniquement dans l'hébergeur et dans GitHub ; `CRON_SECRET` et `BACKUP_PASSPHRASE` changés si une personne quitte le comité.

## 11. En cas d'incident

1. **Ouvrir `/api/health`.** Base injoignable : vérifier l'état de Neon (quota de calcul épuisé, maintenance) ; le site revient seul quand la base répond.
2. **Une tâche en retard** : relancer à la main (`workflow_dispatch` du planificateur, ou `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://le-domaine/api/cron/<tâche>`). Lire `job_run` : `SELECT job,started_at,ok,error_code FROM job_run ORDER BY started_at DESC LIMIT 20`.
3. **Emails qui ne partent plus** : plafond du jour atteint (normal, ils partent demain), identifiants SMTP expirés (`error_code` dans `mail_job`), domaine désauthentifié chez le fournisseur.
4. **Données perdues ou abîmées** : arrêter les écritures si possible, restaurer dans une base neuve (historique Neon de 6 heures, ou dernière sauvegarde), comparer, basculer.
5. **Fuite suspectée** (données de santé de mineurs) : changer `BETTER_AUTH_SECRET` (toutes les sessions tombent), `CRON_SECRET` et les mots de passe de la base ; documenter ; si des données personnelles sont touchées, notifier l'Autorité de protection des données dans les 72 heures (RGPD, article 33) et prévenir les familles concernées.
6. Noter chaque incident (date, cause, durée, action) dans `docs/` pour la suite.

## Sources

- [Vercel, limites des cron jobs par offre](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel, offre Hobby](https://vercel.com/docs/plans/hobby)
- [Vercel, usage équitable et usage commercial](https://vercel.com/docs/limits/fair-use-guidelines)
- [Neon, offres et limites](https://neon.com/docs/introduction/plans)
- [Neon, régions](https://neon.com/docs/introduction/regions)
- [Brevo, serveur SMTP gratuit](https://www.brevo.com/free-smtp-server)
- [GitHub, facturation d'Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
