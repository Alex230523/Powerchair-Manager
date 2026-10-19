# `src/components` : interfaces

Composants client (`"use client"`). Un fichier par module, qui charge sa vue depuis `/api/<module>` et envoie des commandes en `POST`.

| Fichier                    | Rôle                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `app-shell.tsx`            | Barre latérale, barre du haut, choix du profil actif, thème clair/sombre  |
| `shell-copy.ts`            | Libellés de la navigation (FR/NL/EN)                                      |
| `home.tsx`, `home-copy.ts` | Accueil : présentation (visiteur) ou tableau de bord (connecté)           |
| `icons.tsx`                | Icônes SVG décoratives (`<Icon name="calendar" />`)                       |
| `ui.tsx`                   | `Button`, `Panel`                                                         |
| `modal.tsx`                | Fenêtre modale native (`<dialog>`) partagée                               |
| `settings.tsx`             | Réglages du président : droits des coachs, « Je suis aussi coach »        |
| `player-import.tsx`        | Import de joueurs depuis Excel/CSV avec aperçu (`src/lib/spreadsheet.ts`) |
| `<module>.tsx`             | Interface d'un module (`dues`, `calendar`, `documents`…)                  |
| `<module>-copy.ts`         | Textes du module en trois langues                                         |

Conventions :

- Racine d'une page : `<main id="main" className="access <module>">`, titre `<h1>`, messages en `role="alert"` (erreur) ou `role="status"` (confirmation).
- Aucune règle d'accès ici : l'interface affiche ce que le serveur renvoie. Masquer un bouton n'est qu'un confort.
- Pas de couleur en dur : utiliser les classes et variables de `src/app/globals.css`.
