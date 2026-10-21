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
4. `next build`.

Comptes : `president@demo.pfm`, `coach@demo.pfm`, `joueur@demo.pfm`, `parent@demo.pfm`, `federation@demo.pfm`, `arbitre@demo.pfm`.

Tous les aperçus partagent la même base : les migrations n’étant qu’additives, une branche plus ancienne fonctionne sur une base plus récente.

## Limites

- Les tâches de fond (envoi des mails, relances, échéances de documents, résumé hebdomadaire) ne tournent pas : Vercel ne garde pas de programme actif en continu.
- La production n’est pas construite : `vercel.json` l’ignore tant qu’une vraie base de production et ses réglages n’existent pas. Il faudra alors retirer `ignoreCommand` et prévoir une commande de build de production, sans comptes de démo.
