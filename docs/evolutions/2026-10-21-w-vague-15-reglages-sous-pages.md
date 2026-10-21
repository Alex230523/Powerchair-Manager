# Vague 15, observation C13 : réglages rangés en sous-pages (21 octobre 2026)

Aucune migration, aucun droit modifié. La longue page Réglages devient un accueil et sept sous-pages ; chaque panneau existant est déplacé tel quel.

## Accueil des réglages (`/[locale]/settings`)

`PageHeader` « Réglages », champ « Rechercher un réglage », puis une grille de cartes cliquables (3 colonnes, 2 sous 1100 px, 1 sous 640 px) : icône, titre serif, une phrase, et un `Badge` quand quelque chose attend une action (aujourd'hui : « 2 coachs sans droits » sur Membres et droits).

La recherche lit une liste statique des réglages (titre et mots-clés en fr, nl, en ; accents ignorés ; seulement les catégories visibles par le profil). Les résultats s'affichent sous le champ ; Entrée ouvre le premier à son ancre. Les mêmes entrées sont proposées par Ctrl+K (« Barèmes de cotisation · Réglages ») et chaque catégorie aussi (« Réglages · Argent »).

## Sous-pages (`/[locale]/settings/[category]`)

Fil d'Ariane « Réglages > Argent », titre et phrase de la catégorie. Sur grand écran, colonne de navigation de 220 px à gauche (style de la barre latérale, catégorie active en `--primary`, collante) ; sous 900 px, la colonne disparaît et un lien « Tous les réglages » ramène à la liste. Une catégorie que le profil ne voit pas affiche un état vide honnête ; les services refusent toujours ce qui n'est pas permis.

| Catégorie | Contenu | Visible pour |
| --- | --- | --- |
| Mon compte | Photo de profil, langue et notifications ordinaires (déplacées depuis Mon espace), thème clair ou sombre, « Je suis aussi coach » (président) | tous |
| Notifications et résumé | Boîte de réception, préférences, modèles, file d'envoi, message test | tous |
| Club | Identité du club (déplacée depuis Gestion du club, qui garde une carte avec un lien), modules activés | président (droit de gestion des mandats) |
| Membres et droits | Rôles et accès des coachs, profils de droits | droit de gestion des mandats |
| Activités | Effectif attendu aux séances | droit de gestion des mandats |
| Argent | Barèmes de cotisation, alerte de saison lancée, rappels automatiques | droit de gestion des mandats, module Cotisations allumé |
| Journaux et confidentialité | Journal des droits, journal des lectures de santé, lien vers Confidentialité | droit de lecture du journal ou de gestion des mandats |

Les règles de visibilité vivent dans `src/components/settings-nav.ts` (module pur et testé) et reprennent exactement les conditions des panneaux d'avant.

## Changements non enregistrés

Un champ modifié dans une sous-page marque la page comme modifiée ; un bouton pressé (Enregistrer, Annuler…) ou un formulaire envoyé la remet à zéro. Tant qu'elle est modifiée, un clic sur un lien de l'application ouvre la fenêtre « Changements non enregistrés » (« Quitter sans enregistrer » ou « Rester sur la page »). Les filtres d'affichage (« seulement les non lues », choix du modèle à modifier) et l'envoi de photo, enregistré tout de suite, ne comptent pas. La fermeture de l'onglet n'est pas interceptée.

## Anciennes adresses

- `/[locale]/notifications` redirige (côté serveur) vers `/settings/notifications` ; le lien du message test et « Tout voir » de la cloche y mènent directement.
- Les ancres de l'ancienne page (`#settings-dues-title`, `#settings-presence`, `#settings-access`…) ouvrent la bonne sous-page à la bonne section ; le bouton « Réglages des cotisations » de la page Cotisations pointe sur `/settings/money`.
- Mon espace garde une carte « Photo, langue et thème » avec un lien vers Mon compte.

## Menu

L'entrée « Réglages » du groupe Plus mène à l'accueil des réglages ; le menu du compte gagne « Mon compte » (sous-page) et « Réglages » (accueil), à côté de « Mon espace ».

## Tests

- Unitaires (`tests/wave15-settings.test.ts`) : catégories par rôle et par droit, module Cotisations coupé, fédération ; recherche (accents, plusieurs mots, catégories cachées exclues, nl et en) ; chaque ancre de recherche existe dans le code une seule fois ; anciennes ancres vers une catégorie réelle ; textes identiques en fr, nl, en, sans tiret long.
- Bout en bout (`tests/e2e/settings.spec.ts`) : sept cartes pour le président, recherche puis Entrée vers la bonne section, fil d'Ariane et catégorie active, fenêtre des changements non enregistrés (rester puis quitter), enregistrement sans question, ancienne ancre et `/notifications` redirigées, lien depuis Gestion du club, Ctrl+K, axe sur l'accueil et chaque sous-page, 390 px (liste, lien retour, pas de colonne, pas de débordement), coach sans droit (deux cartes, catégorie Argent indisponible).
- Parcours existants adaptés : seuils de présence dans Activités, barèmes dans Argent, langue dans Mon compte, lien de la cloche.

## Vérification

`npm run check`, `npm run test:e2e:db`.
