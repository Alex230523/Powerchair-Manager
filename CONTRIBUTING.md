# Contribuer

## Flux de travail

1. Créer une branche depuis `main` (`feature/…`, `fix/…`).
2. Développer avec `npm run dev`, une base locale et `npm run demo:seed` pour avoir des données.
3. Avant de pousser : `npm run check`, puis `npm run test:integration` si un service ou une migration change.
4. Ouvrir une pull request. La CI (`.github/workflows/ci.yml`) relance tout : lint, types, tests unitaires, migrations, intégration, données de démo, build, E2E.
5. Fusionner seulement quand la CI est verte et que la note de livraison est écrite.

## Règles du projet

- **Autorisation côté serveur, toujours.** Toute lecture ou écriture passe par un service de `src/domains/` qui vérifie le contexte actif et le droit sur chaque ligne. Une route API ne contient pas de règle métier.
- **Aucune fuite entre organisations.** Chaque requête SQL filtre par `organization_id`. Un test d'intégration avec deux clubs accompagne tout nouvel accès aux données.
- **Données sensibles minimales.** Le médical et l'aptitude sont séparés du sportif et exigent `documents.sensitive`. Ne pas ajouter de champ « handicap » générique.
- **Migrations en ajout seulement.** Ne jamais modifier une migration existante : en créer une nouvelle (`NNNN_sujet.sql`).
- **Trois langues.** Toute chaîne visible existe en `fr`, `nl` et `en`. Pas de texte en dur dans le JSX.
- **Accessibilité WCAG 2.2 AA.** Libellés de formulaire, focus visible, contraste, utilisable au clavier et à 320 px de large.
- **Couleurs via les variables CSS** de `src/app/globals.css`, jamais de code couleur dans un composant.
- **Pas de fausses données dans l'interface.** États vides honnêtes ; un bouton visible doit fonctionner.
- **Next.js 16** : lire [AGENTS.md](AGENTS.md) ; certaines API diffèrent des versions précédentes.
- **Nouveautés pour les utilisateurs.** Toute livraison visible ajoute son entrée dans `content/changelog/AAAA-MM-JJ-sujet.json` : titre et texte de deux ou trois phrases simples, sans jargon, en `fr`, `nl` et `en`, lien vers la page concernée, rôles concernés (`player`, `parent`, `coach`, `president`, `federation` ou `all`). Puis `npx tsx scripts/changelog-index.ts`. Le test `tests/news.test.ts` refuse un fichier incomplet ou absent de l'index.

## Style de code

- TypeScript strict, Prettier par défaut (`npx prettier --write`), ESLint (`npm run lint`).
- Noms de fichiers en anglais, textes d'interface et documentation en français.
- Commentaires : expliquer le « pourquoi » (règle métier, sécurité), pas le « quoi ».

## Définition de « terminé »

Reprise du cahier des charges : un changement est terminé quand les parcours fonctionnent, les données persistent, les calculs sont justes, les droits sont vérifiés, les erreurs sont gérées, les tests passent et les limites restantes sont documentées. Un bouton visible sans fonctionnement réel ne satisfait pas cette définition.

## Où documenter

- Nouvelle livraison : `docs/evolutions/AAAA-MM-JJ-sujet.md` ou `docs/lots/LOT-NN.md`.
- Nouvelle commande ou variable d'environnement : `README.md` et `.env.example`.
- Changement de structure ou de règle d'autorisation : `docs/ARCHITECTURE.md`.
