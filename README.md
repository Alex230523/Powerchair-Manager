# Powerchair Football Manager

[![CI](https://github.com/Alex230523/Powerchair-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/Alex230523/Powerchair-Manager/actions/workflows/ci.yml)

Plateforme de gestion du Powerchair Football (football en fauteuil électrique) pour les clubs puis les fédérations : joueurs et familles, inscriptions, documents, calendrier, présences, cotisations, messagerie et statistiques. Chaque club reste autonome, chaque personne ne voit que ce que son rôle autorise. Interface en français, néerlandais et anglais.

Le cahier des charges complet se trouve dans [docs/cahier-des-charges](docs/cahier-des-charges/Powerchair_Football_Manager_v2.pdf).

---

## Tester en direct (sans rien installer)

1. Sur GitHub, bouton vert **Code** › onglet **Codespaces** › **Create codespace** (ou [ce lien](https://codespaces.new/Alex230523/Powerchair-Manager)).
2. Patienter 3 à 5 minutes la première fois : installation, base PostgreSQL, données de démo et compilation se font seules.
3. L'application s'ouvre dans un nouvel onglet (sinon : onglet **Ports**, ligne 3000, icône globe).
4. Se connecter sur la page **Mon espace** avec un des comptes ci-dessous.

| Compte               | Rôle                | Ce qu'on y voit                                                          |
| -------------------- | ------------------- | ------------------------------------------------------------------------ |
| `president@demo.pfm` | Président de club   | Tableau de bord complet, inscriptions, documents à vérifier, cotisations |
| `coach@demo.pfm`     | Coach de l'Équipe A | Calendrier et présences de son équipe                                    |
| `joueur@demo.pfm`    | Joueuse adulte      | Ses convocations, ses documents, ses échéances                           |
| `parent@demo.pfm`    | Parent de Lucas     | Présences et documents de son enfant                                     |

Mot de passe commun : `Demo-Powerchair-2026`. Ces comptes sont fictifs et réservés à la démo.

> Le Codespace se met en veille après 30 minutes d'inactivité. Pour le relancer : ouvrir le Codespace, puis `npm run demo:start` dans le terminal.

---

## Démarrage local

Prérequis : Node 22 et npm, Docker (ou le PostgreSQL embarqué fourni).

```sh
npm ci
cp .env.example .env.local
# Ajouter un secret aléatoire (ne jamais le régénérer ensuite : il chiffre aussi des données)
node -e "console.log('BETTER_AUTH_SECRET='+require('node:crypto').randomBytes(48).toString('hex'))" >> .env.local

docker compose up -d --wait      # ou, sans Docker : npm run db:local (dans un terminal à part)
npm run db:migrate
npm run demo:seed                # facultatif : club et comptes de démo
npm run dev -- --hostname 127.0.0.1
```

Ouvrir http://127.0.0.1:3000/fr. Le détail (création d'un vrai club, workers, emails locaux, MFA) est dans le [guide local](docs/GUIDE-LOCAL.md).

---

## Pile technique

| Couche           | Choix                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Application      | [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript strict                        |
| Authentification | [Better Auth](https://www.better-auth.com) : email + mot de passe, double authentification (TOTP) |
| Base de données  | PostgreSQL 18, migrations SQL versionnées, requêtes `pg` sans ORM                                 |
| Validation       | Zod sur chaque entrée d'API                                                                       |
| Style            | Une feuille CSS unique à variables (`src/app/globals.css`), thème clair et sombre                 |
| Tests            | Vitest (unitaires et intégration sur une vraie base), Playwright + axe (E2E et accessibilité)     |

> **Attention :** cette version de Next.js a des API différentes de celles que beaucoup de développeurs (et d'assistants IA) connaissent. Lire [AGENTS.md](AGENTS.md) et la doc embarquée `node_modules/next/dist/docs/` avant de modifier le routage ou la configuration.

---

## Carte du dépôt

```text
.
├── src/
│   ├── app/                  Routes Next.js
│   │   ├── [locale]/         Pages (fr, nl, en) : une page = un composant de src/components
│   │   ├── api/              Routes HTTP JSON : une route = un service de src/domains
│   │   └── globals.css       Design system complet (couleurs, composants, responsive)
│   ├── components/           Interfaces client (React) et leurs textes *-copy.ts (FR/NL/EN)
│   ├── domains/              Logique métier et autorisations, un dossier par module
│   └── lib/                  Socle technique : base, auth, HTTP, langues, sécurité
├── db/migrations/            Schéma PostgreSQL, fichiers SQL numérotés, jamais modifiés après coup
├── scripts/                  Migrations, workers (emails, échéances, relances), démo, administration
├── tests/
│   ├── *.test.ts             Tests unitaires (sans base)
│   ├── integration/          Tests de services sur une vraie base (schéma temporaire)
│   └── e2e/                  Parcours navigateur Playwright et contrôles d'accessibilité
├── public/                   Manifest PWA et icônes
├── docs/                     Architecture, guides, notes de lots et de recette
├── .devcontainer/            Environnement Codespaces prêt à tester
└── .github/workflows/ci.yml  Vérifications automatiques à chaque pull request
```

Chaque dossier principal de `src/` a son propre README qui détaille son contenu. L'[architecture](docs/ARCHITECTURE.md) explique comment une requête traverse ces couches et comment ajouter un module.

---

## Commandes utiles

| Commande                                                    | Rôle                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                                               | Serveur de développement                                              |
| `npm run check`                                             | Lint + types + tests unitaires (à lancer avant chaque commit)         |
| `npm run test:integration`                                  | Tests de services sur PostgreSQL (schéma temporaire, supprimé après)  |
| `npm run test:e2e:db`                                       | Parcours Playwright sur une base dédiée créée puis supprimée          |
| `npm run db:migrate`                                        | Applique les nouvelles migrations (idempotent)                        |
| `npm run demo:seed`                                         | Crée le club de démo et ses quatre comptes                            |
| `npm run demo:start`                                        | Lance l'application compilée et les workers (utilisé par Codespaces)  |
| `npm run admin:bootstrap`                                   | Crée une vraie organisation et son président                          |
| `npm run mail:worker` / `docs:worker` / `attendance:worker` | Tâches de fond : emails, échéances de documents, relances de présence |

---

## Documentation

| Document                                     | Contenu                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Couches, modèle d'autorisation, conventions, ajout d'un module |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Règles de contribution et définition de « terminé »            |
| [docs/GUIDE-LOCAL.md](docs/GUIDE-LOCAL.md)   | Installation locale détaillée et usage de chaque module        |
| [docs/README.md](docs/README.md)             | Index : notes de lots, rapports de recette, évolutions         |

---

## Avancement

| Lot            | Contenu                                                                                | État                       |
| -------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| 00 à 02        | Socle, comptes, mandats multi-rôles, personnes, familles, équipes, saisons             | Validé                     |
| 03 à 05        | Notifications, inscriptions, documents                                                 | Validé                     |
| 06 à 08        | Calendrier, présences, cotisations, profils, langues                                   | Validé                     |
| Évolutions     | Annuaire joueurs/coachs, messagerie, statistiques, charte orange, tableau de bord, PWA | Livré, en recette          |
| 09             | Banque, QR et rapprochement                                                            | En cours, hors de ce dépôt |
| 10 et suivants | Dashboard complet, PWA hors ligne, multi-clubs, fédération, compétitions               | À venir                    |
