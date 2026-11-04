# Page « Nouveautés » (02/11/2026)

Point 20 de l'avis. Les notes de `docs/evolutions` sont écrites pour des développeurs ; les utilisateurs ont maintenant leur version courte, par rôle. Migration `0099_news.sql` (additive).

## Ce qui change

- **Source** : un fichier par livraison dans `content/changelog/AAAA-MM-JJ-sujet.json` (titre, deux ou trois phrases simples, image facultative, lien vers la page, rôles : joueur, parent, coach, président, fédération ou tous), en français, néerlandais et anglais. L'index `src/domains/news/entries.ts` est produit par `scripts/changelog-index.ts`.
- **Entrées rédigées** : les vagues 16 et 17, les points A1 à B9, et les livraisons du 2 novembre (arbitrage, discipline, fédération comme ASBL, signalements, cette page).
- **Page /nouveautes** (menu du compte et Ctrl+K) : liste chronologique, filtrée d'office sur le rôle du profil utilisé, « Voir aussi les nouveautés des autres rôles » sur demande. Ouvrir la page marque comme lu ce qu'elle montre.
- **Pastille « Nouveau »** sur l'entrée de menu concernée pendant 14 jours, ou jusqu'à la lecture.
- **Petite fenêtre** sur l'accueil après une nouveauté qui concerne ce rôle : une seule fois, fermable, jamais bloquante ; « Ne plus afficher cette fenêtre », et le même réglage dans Réglages › Mon compte.
- **Lu / non lu** gardé par compte (`user_news_read`), réglage de la fenêtre par compte (`user_news_setting`).
- **CONTRIBUTING.md** : toute livraison visible ajoute son entrée dans les trois langues ; `tests/news.test.ts` refuse un fichier incomplet ou absent de l'index.

## Limites

- La pastille porte sur l'entrée de menu, pas sur un bouton à l'intérieur d'une page.
- La fenêtre s'affiche sur l'accueil (la première page après la connexion), pas sur les autres pages.

## Vérification

- `npx vitest run tests/news.test.ts` (fichiers complets et indexés, filtre par rôle, 14 jours, fenêtre une fois).
- `npm run test:integration` (`tests/integration/news.integration.ts`) : filtre par rôle, lu par compte, fenêtre une fois, désactivée par le réglage.
- `tests/e2e/news.spec.ts` à 390 px avec axe.
