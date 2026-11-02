# Aperçus en ligne (Vercel)

Chaque branche et chaque pull request reçoivent leur propre aperçu de l’application, mis à jour à chaque push. Vercel poste le lien dans la PR (« Visit Preview »).

## Réglages du projet Vercel

Tous les réglages ci-dessous concernent l’environnement **Preview** uniquement.

| Réglage | Valeur |
| --- | --- |
| Base de données | Neon, reliée au seul environnement Preview (`DATABASE_URL`, et `DATABASE_URL_UNPOOLED` si présent) |
| `BETTER_AUTH_SECRET` | Suite aléatoire de 32 caractères au moins (`openssl rand -base64 32`) |
| `PFM_DEMO_PASSWORD` | Mot de passe des comptes de démo en ligne, 12 caractères au moins, connu de toi seul |
| `MAIL_TRANSPORT` | `local` : aucun mail ne part |
| Deployment Protection | « Vercel Authentication » activé : seules les personnes connectées à l’équipe Vercel ouvrent un aperçu |

`BETTER_AUTH_URL` n’est pas à fixer : un aperçu prend l’adresse de sa branche (`src/lib/preview.ts`), et l’adresse propre à chaque déploiement renvoie vers elle.

Connexion par email et mot de passe uniquement : la double authentification a été retirée de l’application.

## Ce qui se passe à chaque déploiement

`vercel.json` lance `scripts/vercel-build.mjs` :

1. refus si l’environnement n’est pas un aperçu, ou s’il manque la base, le secret ou le mot de passe de démo ;
2. migrations (`scripts/migrate.mjs`, sous verrou) ;
3. club de démo créé une seule fois (`scripts/demo-seed.ts`, sous un second verrou), avec `PFM_DEMO_PASSWORD` : le mot de passe public écrit dans le dépôt ne sert jamais en ligne, et le mot de passe n’apparaît pas dans les journaux ;
4. vérification : la base ne doit contenir que des organisations de démo (`organization.is_demo`, posé par le script de démo). Une autre organisation (un vrai club saisi « pour tester », ou une base de production reliée par erreur) arrête le déploiement, avec son nom dans le journal ;
5. `next build`.

Comptes : `president@demo.pfm`, `coach@demo.pfm`, `joueur@demo.pfm`, `parent@demo.pfm`, `federation@demo.pfm`, `arbitre@demo.pfm`.

## Une base par aperçu

Avec une seule base pour tous les aperçus, une branche peut casser les données des autres. Chaque aperçu reçoit donc sa propre branche de base Neon, copiée d’une base qui ne contient que la démo.

Mise en place (une fois) :

1. Dans Neon, le projet des aperçus (jamais celui de la production) a pour branche par défaut une branche `demo` qui ne contient que le club de démo. Pour la repartir de zéro : créer la branche, y lancer `npm run db:migrate` puis le script de démo, et la définir comme branche par défaut.
2. Dans Vercel, intégration Neon gérée par Neon (« Neon-Managed ») : activer « Create a branch for each preview deployment ». L’intégration crée la branche `preview/<branche git>` au premier déploiement, la réutilise ensuite, et place `DATABASE_URL` sur cet aperçu.
3. Dans GitHub, Settings › General : cocher « Automatically delete head branches » (l’intégration supprime la base quand la branche Git disparaît).
4. Pour une PR fermée sans fusion, dont la branche reste : secrets du dépôt `NEON_API_KEY` (clé d’API Neon) et `NEON_PROJECT_ID`. Le workflow `.github/workflows/preview-db.yml` supprime alors la branche `preview/<branche>` à la fermeture de chaque PR. Sans ces secrets, il ne fait rien.

Quotas de l’offre gratuite de Neon (vérifiés le 2 novembre 2026) : 10 branches par projet, sans branche supplémentaire possible. `demo` en occupe une : il reste 9 aperçus ouverts en même temps. Au delà, l’intégration ne peut plus créer de branche et le déploiement échoue.

Solution de repli si ce quota ne suffit pas : garder une base partagée, sans l’option « branche par aperçu », et la réinitialiser à chaque déploiement de `main` (vider la base, migrations, script de démo). Les migrations n’étant qu’additives, une branche plus ancienne fonctionne sur une base plus récente.

## Limites

- Les tâches de fond (envoi des mails, relances, échéances de documents, résumé hebdomadaire) ne tournent pas : Vercel ne garde pas de programme actif en continu.
- La production n’est pas construite : `vercel.json` l’ignore tant qu’une vraie base de production et ses réglages n’existent pas. Il faudra alors retirer `ignoreCommand` et prévoir une commande de build de production, sans comptes de démo.
