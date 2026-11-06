# Sécurité : mauvaises configurations du cloud

Audit du 06/11/2026 : l'hébergement (Vercel), la base (Neon), le dépôt et ses workflows (GitHub) sont-ils réglés de façon à ne rien exposer, même sans faille dans le code ?

## Failles trouvées et corrigées

- **Fonctions aux États-Unis.** `vercel.json` ne fixait pas de région : Vercel exécute alors les fonctions à Washington (`iad1`). Chaque page lue ou écrite faisait l'aller-retour entre les États-Unis et la base de Francfort, avec des données de santé de mineurs, alors que la page de confidentialité annonce un hébergement dans l'UE (et chaque requête traversait l'Atlantique deux fois). Les fonctions tournent maintenant à Francfort (`"regions": ["fra1"]`), à côté de la base.
- **Base jointe en clair possible.** Rien n'empêchait une `DATABASE_URL` sans `sslmode`, ou avec `disable`, `allow`, `prefer` (qui retombent en clair). L'application refuse désormais de démarrer avec une base hors de la machine qui n'est pas jointe en chiffré (`require`, `verify-ca`, `verify-full`), et le build des aperçus s'arrête avant les migrations avec un message clair. Une base locale ou dans un conteneur voisin n'est pas concernée.
- **Requêtes et transactions abandonnées.** Le site arrêtait d'attendre une requête après 3 secondes, mais la base, elle, continuait de l'exécuter ; une transaction ouverte puis perdue gardait sa connexion. Sur une petite base gratuite (peu de connexions), quelques requêtes lentes suffisaient à bloquer le site. Chaque connexion demande maintenant à la base de couper une requête après 5 secondes et une transaction oubliée après 2 minutes. Le réglage est posé à l'ouverture de la connexion, pas comme paramètre de démarrage, que le regroupeur de connexions de Neon refuse.
- **Aperçus indexables.** Un aperçu (copie du site sur la démo, à une adresse publique de Vercel) ne demandait pas aux moteurs de recherche de l'ignorer : il ne l'était que si la *Deployment Protection* restait active. Tout aperçu envoie maintenant `X-Robots-Tag: noindex, nofollow`, et les réponses de l'API aussi, partout.
- **Actions de GitHub non figées.** Les workflows utilisaient `actions/checkout@v5` et consorts : une étiquette qui peut être déplacée vers un autre code. Chaque action est maintenant figée par l'empreinte de sa version (la version lisible en commentaire), y compris dans les modèles `docs/production/` (sauvegarde et planificateur), qui recevaient en plus un jeton aux droits par défaut : ils ont maintenant `permissions: contents: read`, comme la CI.

## Durcissements

- Pages : `Cross-Origin-Opener-Policy: same-origin` (une fenêtre ouverte par le site, ou qui l'ouvre, ne peut plus agir sur lui) ; `Permissions-Policy` ferme aussi le paiement par le navigateur, l'USB et les sujets publicitaires.
- `productionBrowserSourceMaps: false` écrit en clair dans `next.config.ts` : le navigateur reçoit les scripts, jamais leur code source.

## Vérifié sans faille

- Aucune route de l'API n'ouvre le CORS ; les réponses mises en cache public (logo, palmarès, agenda par jeton, cagnotte, match en direct) ne lisent aucune session.
- Le secret des tâches de fond est exigé (32 caractères au moins), comparé en temps constant ; sans lui, les tâches répondent 503.
- `/api/health` ne donne ni version ni donnée personnelle ; pas d'en-tête `X-Powered-By`.
- Les aperçus refusent une base qui contient autre chose que la démo ; la production est ignorée par Vercel tant qu'elle n'est pas prête ; les branches de base d'un aperçu sont supprimées à la fermeture de la pull request.
- Fichiers dans PostgreSQL (pas de stockage public), sauvegardes chiffrées en AES-256 avant de quitter la base.

## À régler à la main (réglages de compte)

Le code ne peut pas les poser ; ils sont listés dans `docs/PRODUCTION.md`, § 10 :
- **GitHub** : le dépôt est public, et aujourd'hui *Secret scanning*, *Push protection* et *Dependabot* sont désactivés, `main` n'est pas protégée. Les activer (gratuit sur un dépôt public) et protéger `main` (pull request obligatoire, contrôles de la CI requis, pas de force-push).
- **Vercel** : garder la *Deployment Protection* des aperçus et la *Git Fork Protection* ; aucun secret de production dans l'environnement *Preview*.
- **Neon** : poser les limites de temps sur le rôle de l'application (commande dans `docs/PRODUCTION.md`), rôle de sauvegarde en lecture seule.

## Garde-fous

- `tests/cloud-safety.test.ts` : région de Francfort ; base hors machine refusée sans chiffrement (et build arrêté avant les migrations) ; limites posées sur chaque connexion, jamais en paramètre de démarrage ; en-têtes des pages, `noindex` des aperçus et de l'API, pas de source maps ; pas de CORS ni de cache partagé sur une route qui lit une session ; chaque workflow et chaque modèle avec des actions figées et un jeton en lecture seule.
- `tests/integration/secu-cloud.integration.ts` : chaque nouvelle connexion reçoit ses limites, et la base coupe d'elle-même une requête trop longue.
- `tests/audit/access.spec.ts`, contre le serveur réel : en-têtes d'une page, pas de `X-Powered-By`, pas de source map servie, API non indexée, aucun CORS (ni à l'appel, ni au pré-vol), `/api/health` sans version.

## Vérification

```
npx vitest run tests/cloud-safety.test.ts tests/foundation.test.ts
npm run test:integration -- secu-cloud
npm run audit:access
```
