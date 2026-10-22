# Vague 17, G3 : menu et réglages (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point G3.

## Relances dans les réglages
- L'entrée « Relances » quitte le menu (groupe Plus et menu d'administration). La page vit dans Réglages › Notifications et résumé, sous-section « Relances » (`#settings-reminders`), pour les profils qui peuvent relancer ; elle se cache sinon.
- L'ancienne adresse `/[locale]/reminders` (avec `?kind=dues` ou `?kind=documents`) redirige vers cette sous-section. Les liens des pages Cotisations, Documents et Déplacement y mènent ; les relances de cotisation restent donc accessibles depuis Cotisations.
- La recherche des réglages trouve « Relances » (et « Hall of fame sur le site du club », ajouté en S1).

## Boîte « Rappel de cotisation »
La mise en page tient à toutes les tailles : étiquettes au-dessus des champs, champs et modèle d'email sur toute la largeur, adresses longues coupées au lieu de déborder, situation et badge « en retard » sur deux lignes si la place manque, actions qui passent à la ligne. Vérifié à 1440 et 390 px, en clair et en sombre, en texte « Très grand », avec captures.

## Carnet hors ligne supprimé
À la demande du porteur du projet, le carnet hors ligne disparaît complètement : entrée du menu, page `/offline-book`, préparation dans la fiche d'un déplacement, route `/api/trips/offline` et chiffrement local. À la déconnexion, un carnet encore présent sur un appareil est effacé. Les anciennes lectures déjà tracées gardent leur libellé dans le journal des données de santé.

## Droits « jusqu'à nouvel ordre »
- Invitation et fenêtre « Choisir ses droits » : « Jusqu'à nouvel ordre » est choisi par défaut ; « Jusqu'au… » fait apparaître la date de fin.
- La liste des membres, le tableau des droits des coachs et le journal des droits affichent toujours la durée : « Jusqu'à nouvel ordre » ou « Jusqu'au JJ/MM/AAAA », jamais vide. Le journal garde désormais la nouvelle fin d'un rôle prolongé.

## Tests
- Unitaires : `tests/wave17-menu-settings.test.ts`, `tests/wave14.test.ts` mis à jour.
- Intégration : `tests/integration/wave7.integration.ts` sans le carnet.
- Bout en bout : `tests/e2e/menu-settings.spec.ts` (menu, redirection, boîte de relance sans débordement à 1440 et 390 px en clair, sombre et très grand texte avec captures, droits par défaut et journal, axe) ; `new-pages.spec.ts` suit les adresses.
