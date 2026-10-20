# Vague 11 : finance du club, subsides et partenaires, carnet de contacts, réglages regroupés, photo de profil (20 octobre 2026)

Migration additive `0030_avatar_funding_contacts.sql` : photo de compte, règles de rappel des cotisations, journal des rappels sans expéditeur pour les envois automatiques, tables `contact`, `grant_application` et `partner`.

## Menu et navigation

- **Déplacements** et **Annuaire des salles** quittent le menu de gauche : deux boutons dans la page Calendrier y mènent (le bouton Salles pour qui organise, le bouton Déplacements pour tous sauf si le module est coupé).
- **Mon espace** s'ouvre en cliquant sur la photo ou le nom en bas à gauche du menu.
- **Financement** devient **Finance du club** (menu, page, onglet). Le groupe « Finance du club » contient Finance du club, Cotisations, Subsides, Sponsors et philanthropie, Levée de fonds.
- **Carnet de contacts** dans le groupe Gestion du club.
- **Notifications** quitte le menu : la rubrique vit dans Réglages (l'ancienne adresse fonctionne toujours).
- **Licences** devient **Transferts** (menu et titre de page ; le contenu reste celui des licences et classifications, à reprendre plus tard). La page Documents a un bouton « Licences et transferts ».

## Photo de profil

Dans Mon espace, rubrique **Photo de profil** : PNG, JPEG ou WebP de 256 Ko au plus, signature du fichier vérifiée côté serveur. La photo apparaît en bas du menu à côté du nom ; elle n'est servie qu'au compte lui-même (`/api/account/avatar`). Une photo par compte.

## Finance du club

- **Subsides** (`/funding/grants`) : une ligne par demande, de l'idée au versement. Organisme, appel ou programme, objet, saison, montant demandé, montant accordé, statut (idée, déposé, accordé, refusé, versé, clôturé), date limite de dépôt, dépôt, décision, versement, justificatif à rendre, contact lié, notes. Tuiles : dossiers en cours, demandé, accordé, reçu cette année (depuis le grand livre, catégorie subsides). La colonne « Prochaine étape » dit quoi faire : déposer le dossier (idée avec date limite) ou rendre le justificatif (accordé ou versé).
- **Sponsors et philanthropie** (`/funding/partners`) : sponsors, donateurs, mécènes, fondations. Montant par an, soutien en nature, contrepartie offerte par le club, début et fin de l'accord, prochaine relance (date et quoi faire), contact lié, statut (prospect, actif, terminé). Tuiles : partenaires actifs, engagements par an, reçu cette année (sponsors et dons du grand livre), à renouveler sous 60 jours.
- Les deux pages sont lues avec le droit « Argent : lecture » et modifiées avec « Argent : modification », comme la finance. Elles disparaissent avec le module Finances.
- **Accueil** : les dates à venir (dossier à déposer, justificatif à rendre, relance, renouvellement) rejoignent la liste des prochains événements pour les personnes qui gèrent ou lisent l'argent, dans les 30 jours.

## Carnet de contacts

Page `/contacts` : les personnes extérieures au club (sponsors, pouvoirs publics, fédération, salles, presse, fournisseurs, médecins, bénévoles). Nom, organisation, fonction, email, téléphone, étiquettes, notes, archivage. Recherche et filtre par étiquette. Chaque contact indique à combien de subsides et de partenaires il est lié. Lecture pour le président et les coachs ; édition pour le président et les personnes qui gèrent les joueurs ou les mails. Les joueurs et parents ne voient pas le carnet.

## Réglages

- **Notifications** : la rubrique complète (préférences, modèles, pause, test) est dans Réglages, pour tous les profils.
- **Cotisations** : les barèmes de chaque saison (catégorie, montant, nombre de versements, première échéance, réduction fratrie) se créent et se modifient ici, dans des fenêtres ; la page Cotisations garde un bouton « Réglages des cotisations » et ne fait plus que suivre les créances.
- **Alerte en cours de saison** : modifier un barème sur lequel des cotisations ont déjà été émises ouvre une fenêtre d'alerte (« La saison est lancée : N cotisations ont déjà été émises… »). Les cotisations émises gardent leur montant et leurs échéances ; seules les suivantes suivent le nouveau barème. Le serveur refuse le changement sans cette confirmation (`SEASON_STARTED`).
- **Rappels automatiques** : case « Envoyer les rappels de cotisation automatiquement », jours avant l'échéance (7 par défaut), jours de retard avant le premier rappel (7), répétition (14 jours). Le worker (`npm run attendance:worker`) envoie alors le même mail qu'un rappel manuel aux familles concernées, et le trace dans le journal des rappels sans expéditeur. Rien ne part si le module Cotisations ou Rappels est coupé.

## Tests

- Unitaires (`tests/wave11.test.ts`) : règles de rappel (avant, retard, répétition, défauts), prochaine étape d'un subside et d'un partenaire, signature des images, textes FR/NL/EN sans tiret long, libellés renommés.
- Intégration (`tests/integration/wave11.integration.ts`) : photo refusée puis acceptée et retirée ; carnet lu par un coach, refusé à un parent, édité par le président ; subside et partenaire avec contact lié, dates sur l'accueil du président seulement, passage à « accordé » et « terminé », suppression ; barème modifié sans question tant que rien n'est émis, puis refusé sans confirmation et accepté avec, la cotisation émise gardant son montant ; rappels automatiques envoyés une fois à la mère d'Emma.
- Bout en bout : barème créé dans Réglages, cotisation émise et encaissée, alerte de saison lancée confirmée, montant mis à jour ; pages contacts, subsides et partenaires sous axe ; menu sans Déplacements, Salles, Notifications ni Licences ; boutons du calendrier ; rubriques Notifications et Cotisations dans Réglages ; coin photo vers Mon espace ; contact puis subside lié.

## Limites

- Une seule photo par compte, pas par profil (un compte avec plusieurs profils garde la même).
- Les montants reçus des subsides et partenaires viennent du grand livre par catégorie, pas d'un lien ligne par ligne.
- Les rappels automatiques dépendent du worker : s'il ne tourne pas, rien ne part.
