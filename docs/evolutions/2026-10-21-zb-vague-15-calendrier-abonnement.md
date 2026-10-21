# Vague 15, prompt 2.7 et observation C9 : calendrier et abonnement (21 octobre 2026)

Migration `0035_calendar_feed_mine.sql` (une colonne ajoutée). Gardés : couleurs et légende des équipes (vague 12), Déplacements et Salles dans l'en-tête (vague 11, désormais boutons de l'en-tête de page), `?event=ID` depuis l'accueil (vague 10), capsules de la semaine de l'accueil (vague 14), couche « Échéances » (C1, C2), copie de semaine (vague 9), lieux et répertoire commun.

## Barre de contrôle

- Le calendrier est une Card dont le titre est la période en serif (« Octobre 2026 », « 19 au 25 octobre 2026 »).
- À droite : Semaine / Mois / Liste en Segmented (remplace le `<select>`, flèches du clavier), précédent et suivant en boutons ronds de 32 px (44 px sur téléphone), « Aujourd'hui », « S'abonner », « Nouvel événement ».
- Filtres dans une Toolbar : date de référence, type d'événement, équipe (suit la capsule de la barre du haut, avec « Appliquer à toute la plateforme »), lieu, « Couleur par : équipe / type », couche « Échéances ».

## Vues

- **Semaine** : grille horaire de 7 colonnes, en-têtes « lun. 19 » sur `--surface-soft`, jour courant en pastille `--primary`, colonne des heures de 56 px, 7 h à 22 h (étendue si un événement dépasse), lignes de 1 px `--grid-line`. Chaque événement est placé selon son heure et sa durée (même capsule que l'accueil : fond pastel, bordure gauche de 3 px, titre 12 px 600, horaire et lieu 12 px) ; les chevauchements se rangent côte à côte. Ligne de l'heure actuelle en `--danger` sur le jour courant ; les événements de journée entière (et les échéances) dans une bande sous l'en-tête. Annulé : fond neutre, titre barré, Badge « Annulé ».
- **3 jours** : la même grille sur trois jours, proposée sous 760 px.
- **Mois** : trois capsules au plus par jour, puis « +2 » qui ouvre la liste du jour ; le « + » d'ajout n'apparaît qu'au survol ou au focus (toujours sur écran tactile).
- **Liste** : regroupée par jour ; chaque ligne avec l'heure, une pastille de couleur, le titre, le type, l'équipe, le lieu et les réponses (« 3 présents, 1 absent, 2 sans réponse ») ou « Annulé ». Vue par défaut sous 760 px.
- **Couleurs par type** (nouvelles variables, claires et sombres, comme la palette d'équipe) : entraînement bleu, match vert, tournoi violet, réunion gris, stage ambre, événement associatif sable, type personnalisé bleu pâle. La légende suit le choix.

## Fiche événement

Panneau latéral de 420 px (plein écran sur téléphone) : statut, type, équipe, début, fin, lieu, responsable, consignes, matériel ; convocations et réponses des coachs et des joueurs ; participants et documents ; pour qui peut modifier : Modifier, Dupliquer, Écrire aux participants, annulation avec son motif et historique. `?event=ID` l'ouvre directement. Après un enregistrement, le formulaire se ferme et la fiche reste fermée.

## Accessibilité

Chaque événement est un bouton au nom complet (« Entraînement Lions, lundi 26 octobre de 18 h à 20 h, Salle du Parc »), les flèches passent d'un événement au suivant dans la grille, le mois et la liste, et la couleur n'est jamais seule : type et équipe sont écrits dans la liste, la fiche et le nom des boutons.

## Abonnement (C9)

- Bouton « S'abonner » dans la barre de contrôle. La fenêtre propose ce qu'on suit : tout le club, une équipe, ou « Mes événements » (ceux où l'une de mes fiches, ou celle de mon enfant, est dans l'équipe, inscrite ou convoquée, et ceux dont je suis responsable).
- Puis trois boutons, chacun avec une phrase : Google Agenda (lien d'ajout par adresse), Apple Calendrier (`webcal://`), Outlook (ajout depuis le web) ; le lien à copier et un code QR à scanner avec le téléphone.
- « Vos liens » : chaque lien avec ce qu'il suit et sa validité, « Régénérer » (même choix, nouveau secret, l'ancien cesse aussitôt) et « Révoquer ».
- Le code QR est produit par `src/lib/qr.ts` (niveau M, sans dépendance, le registre npm n'étant pas joignable) ; il a été vérifié en décodant des images générées avec le détecteur QR d'OpenCV, de la version 1 à la version 15.
- Accueil des joueurs et des parents : une carte « Bien démarrer » propose « Ajoutez les entraînements à votre agenda » (lien vers `/calendar?subscribe=1`) tant qu'aucun lien actif n'existe. La carte « Bien démarrer » du président viendra avec C3.

## Tests

- Unitaires (`tests/wave15-calendar.test.ts`) : périodes, déplacements, journée entière, heures de la grille, chevauchements côte à côte, heures dites, réponses, liens Google, Apple et Outlook, code QR (version, motifs de repérage), textes fr/nl/en sans tiret long.
- Intégration (`tests/integration/calendar.integration.ts`) : lien par équipe, « Mes événements », lien régénéré qui coupe l'ancien, autre club refusé ; carte « Bien démarrer » d'un joueur tant qu'il n'a pas de lien.
- Bout en bout : `tests/e2e/calendar-planner.spec.ts` (18 h à 20 h à la bonne position, chevauchement, bande journée entière, vues et événements au clavier, couleurs par type, fiche et `?event=ID`, abonnement par équipe avec QR, régénération et révocation, carte du joueur, liste et « 3 jours » à 390 px, axe) ; `tests/e2e/calendar.spec.ts` adapté (vues en Segmented, boutons d'événement au nom complet, fiche en panneau, fenêtre d'abonnement).

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
