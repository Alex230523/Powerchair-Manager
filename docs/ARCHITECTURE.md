# Architecture

Ce document sert de carte à un développeur qui arrive sur le projet : où se trouve quoi, comment une action traverse l'application, et quelles règles ne pas casser.

## Vue d'ensemble

```text
Navigateur                     Serveur Next.js                                 PostgreSQL
──────────                     ───────────────                                 ──────────
src/app/[locale]/x/page.tsx ─► rend <X locale> (src/components/x.tsx)
<X> (client) ── fetch ───────► src/app/api/x/route.ts
                                 1. principal()  session Better Auth           session, "user"
                                 2. origin()     même origine (POST)
                                 3. bounded()    taille du corps limitée
                                 4. zod          commandSchema.parse()
                                 5. service      src/domains/x/service.ts ───► transaction
                                      scope(): contexte actif + verrou org     active_context, role_assignment
                                      access.ts: droit sur CHAQUE ligne        tables du module
                                      audit + notification en file             audit_log, mail_job
◄──────────── JSON ───────────── 6. failure()    erreurs → { error: CODE }
```

Il n'y a pas d'ORM ni de couche « repository » : chaque service écrit son SQL, dans une transaction, avec des paramètres liés (`$1`, `$2`…).

## Les couches

### `src/app/` : routes

- `[locale]/…/page.tsx` : composant serveur minimal. Il vérifie la langue (`isLocale`), puis rend le composant client du module. Aucune donnée n'est chargée ici.
- `api/…/route.ts` : point d'entrée HTTP. `GET` renvoie la « vue » du module, `POST` reçoit une commande `{ action: "...", ... }`. Les routes ne contiennent aucune règle métier.
- `(entry)/` : redirection de `/` vers `/fr`.

### `src/components/` : interfaces

- Un fichier par module (`dues.tsx`, `calendar.tsx`…), en composant client (`"use client"`).
- Les textes sont dans un objet `{ fr, nl, en }`, soit dans le même fichier, soit dans `x-copy.ts`. Les dictionnaires anglais volumineux sont dans `src/lib/english.ts`.
- `app-shell.tsx` : barre latérale, barre du haut, sélecteur de profil et thème. `shell-copy.ts` : ses libellés.
- `home.tsx` : page d'accueil (présentation ou tableau de bord).
- `icons.tsx` : icônes SVG. `ui.tsx` : `Button` et `Panel`.

### `src/domains/` : métier et autorisations

Un dossier par module, toujours selon le même découpage :

| Fichier      | Rôle                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `schema.ts`  | Schémas Zod des commandes (`commandSchema`) et fonctions pures (calculs, validation)                |
| `access.ts`  | Qui peut lire ou modifier quelle ligne (ex. `docAccess`, `canRead`, `mayRespond`)                   |
| `service.ts` | `xView(db, principal)` pour la lecture, `xExecute(db, principal, commande, org)` pour les écritures |

Modules : `access` (comptes, mandats, profils), `people` (personnes, familles, équipes), `notifications`, `registrations`, `documents`, `calendar`, `attendance`, `dues`, `communication`, `statistics`, `dashboard`, `equipment`, `player-profile`.

### `src/lib/` : socle

| Fichier                                       | Rôle                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `db.ts`                                       | Pools PostgreSQL (`getDb`, `getMailDb`), timeout de requête 3 s                             |
| `auth.ts`, `auth-server.ts`, `auth-client.ts` | Configuration Better Auth (serveur et navigateur)                                           |
| `http.ts`                                     | `principal`, `origin`, `bounded`, `failure`, `noStore` : utilisés par toutes les routes API |
| `security-policy.ts`                          | `mfaSatisfied()` : toujours satisfait (double authentification retirée le 21/10/2026)        |
| `locale.ts`, `english.ts`                     | Langues supportées et textes partagés                                                       |
| `env.ts`                                      | Validation des variables d'environnement                                                    |

## Modèle d'autorisation

C'est le cœur du projet. À lire avant toute modification.

1. **Une personne, plusieurs mandats.** Un mandat (`role_assignment`) relie un utilisateur à une organisation avec un rôle (`club_president`, `coach`, `player`, `guardian`, `federation_president`, `federation_worker`, `referee`), des permissions déléguées (`grants`) et des dates de validité.
2. **Un contexte actif par session.** L'utilisateur choisit un profil (`active_context`). Toutes les lectures et écritures sont bornées à l'organisation de ce mandat. Les droits de deux mandats ne se cumulent jamais.
3. **Permissions.** `src/domains/access/policy.ts` calcule les permissions d'un mandat (`permissions(role, grants)`). Les présidents ont les permissions de base de leur organisation ; les autres rôles reçoivent des permissions explicites (`documents.manage`, `dues.manage`…).
4. **Contrôle ligne par ligne.** Les fichiers `access.ts` vérifient chaque enregistrement : un parent ne voit que les enfants pour lesquels une relation vérifiée lui donne accès, un coach que ses équipes, les documents sensibles exigent `documents.sensitive`.
5. **Connexion.** Email et mot de passe uniquement : la double authentification a été retirée le 21/10/2026 à la demande du porteur du projet. `mfaSatisfied` reste l’unique point de cette règle et répond toujours oui ; les droits par rôle et par ressource sont inchangés.
6. **Côté serveur uniquement.** Masquer un bouton dans l'interface n'est jamais une protection. Chaque service revérifie.
7. **Concurrence.** Les commandes posent un verrou `FOR UPDATE` sur l'organisation et vérifient `expectedVersion` sur les lignes modifiées : deux personnes ne peuvent pas écraser la même donnée sans le savoir (`STALE_VERSION`).

Les erreurs métier sont des `AccessError(code, status)` (`FORBIDDEN`, `CONTEXT_REQUIRED`, `MFA_REQUIRED`, `STALE_VERSION`…). L'interface traduit le code ; aucun détail interne n'est renvoyé.

## Données

- **Migrations** : `db/migrations/NNNN_nom.sql`, appliquées dans l'ordre par `npm run db:migrate`. Une somme de contrôle empêche de modifier une migration déjà appliquée : toute évolution passe par un nouveau fichier.
- **Isolation** : presque toutes les tables portent `organization_id` et des clés étrangères composites `(id, organization_id)`, ce qui empêche de relier des données de deux clubs.
- **Montants** : entiers en centimes d'euro (`amount_cents`).
- **Dates** : fuseau `Europe/Brussels` ; les événements gardent aussi l'heure locale saisie (`local_start`).
- **Fichiers** : stockés chiffrés en base (`content_ciphertext`, clé dérivée de `BETTER_AUTH_SECRET`). Ne jamais régénérer ce secret sur une base existante.
- **Historique** : les modules écrivent un journal (`*_history`, `audit_log`) plutôt que d'effacer.

## Tâches de fond

| Script                         | Rôle                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| `scripts/mail-worker.ts`       | Envoie la file `mail_job` (en local : fichiers dans `.local/mail/`) |
| `scripts/documents-worker.ts`  | Passe en « expiré » les documents arrivés à échéance                |
| `scripts/attendance-worker.ts` | Relances avant l'échéance de réponse et alertes de seuil            |

Les services ne contactent jamais l'extérieur directement : ils publient un événement, le worker s'en charge.

## Interface

- **Design system** : tout est dans `src/app/globals.css`. Les couleurs sont des variables (`--accent`, `--surface`…) redéfinies pour le thème sombre. L'orange décoratif (`--brand-500`) n'est jamais utilisé pour du texte ; `--accent` est la variante contrastée (WCAG AA).
- **Classes partagées** : `.panel`, `.button`, `.button.secondary`, `.notice`, `.records`, `.grid`, `.actions`, `.table-scroll`. Une page de module est un `<main id="main" className="access nom-du-module">`.
- **Accessibilité** : cible WCAG 2.2 AA. Libellés explicites, focus visible, `role="alert"` / `role="status"` pour les messages, pas de défilement horizontal à 320 px. Les E2E passent axe sur les pages clés.
- **Langues** : toute chaîne visible existe en `fr`, `nl` et `en`. Les tests unitaires vérifient que les trois dictionnaires ont les mêmes clés.

## Ajouter un module

Le module `equipment/` (fauteuils) est un bon exemple récent et compact à suivre.

1. **Migration** `db/migrations/00NN_sujet.sql` : tables avec `organization_id`, clés composites, contraintes `CHECK`, ajout de la permission dans les contraintes `grants` si besoin.
2. **Permission** dans `src/domains/access/policy.ts` (`delegable`) si le module est délégable.
3. **Domaine** `src/domains/<module>/` : `schema.ts` (commandes Zod), règles d'accès, `service.ts` (`xView`, `xExecute` avec `scope()`).
4. **Route** `src/app/api/<module>/route.ts` : copier `api/equipment/route.ts` et remplacer le service.
5. **Interface** `src/components/<module>.tsx` + textes FR/NL/EN, page `src/app/[locale]/<module>/page.tsx`, lien dans le bon groupe de `menuGroups()` (`app-shell.tsx`).
6. **Tests** : unitaires pour les fonctions pures, intégration pour les droits (deux clubs, rôle autorisé, rôle refusé), E2E pour le parcours principal.
7. **Documentation** : une note dans `docs/evolutions/` et une ligne dans le README si une commande change.
