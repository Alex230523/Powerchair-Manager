# Changer de profil de démo, et des champs de recherche plus fins

Demande du 12/11/2026.

## Changer de profil de démo (aperçu seulement)

Sur un aperçu, le menu du compte propose « Profil de démo » : un choix ouvre directement un autre compte de démo (présidence du club, coach, joueuse, parent, fédération, arbitre), sans se déconnecter ni retaper de mot de passe. L'espace s'ouvre sur le premier profil du compte.

C'est une facilité de démonstration, encadrée :

- elle n'existe que sur un aperçu Vercel (`VERCEL_ENV=preview`) avec le mot de passe de démo du projet (`PFM_DEMO_PASSWORD`), ou en local si on la demande (`PFM_DEMO_SWITCH=true`) ; jamais en production, même si la variable y était mise par erreur ;
- elle ne part que d'un compte de démo, d'une organisation marquée « démo », et ne mène qu'aux six comptes de démo ;
- elle est comptée (30 changements par heure et par compte) ; la session précédente est fermée ;
- le mot de passe ne quitte jamais le serveur.

**Avant la vraie mise en ligne** : ne pas mettre `PFM_DEMO_PASSWORD` ni `PFM_DEMO_SWITCH` dans l'environnement Production (la commande de build de production refusera de toute façon les comptes de démo).

## Des champs de recherche plus fins

Les champs de recherche des pages (pas la recherche principale du haut) étaient de grosses boîtes. Ils deviennent une pilule avec une loupe, un fond discret et un texte plus petit ; les menus des barres de filtres prennent la même forme arrondie. La hauteur reste de 44 px (cible tactile) et la bordure reste lisible (3:1).

## Garde-fous

- `tests/demo-switch.test.ts` : activé seulement sur un aperçu avec le mot de passe, jamais en production ; les six comptes ; refus avant tout quand c'est éteint, compte de démo exigé, compteur.
- Matrice des droits : `demo/switch` répond 404 à tous hors aperçu.
