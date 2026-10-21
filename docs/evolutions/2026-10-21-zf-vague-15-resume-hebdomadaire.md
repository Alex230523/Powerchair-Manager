# Vague 15, observation C7 : résumé hebdomadaire par email (21 octobre 2026)

Migration `0038_weekly_digest.sql` (ajouts) :

- `organization.digest_day` et `organization.digest_minute` : moment par défaut du club, mercredi 7 h 30 (jour 1 = lundi à 7 = dimanche ; minutes après minuit, de 6 h à 20 h par demi-heure).
- Préférences de notification existantes : nouvelle catégorie `digest` (la case « Recevoir le résumé hebdomadaire » est `email_enabled`) et colonnes `digest_day`, `digest_minute` (vides : le moment du club), `digest_sections`.
- `digest_send` : un résumé par personne, club et semaine ISO (index unique), aperçus à part. Les semaines vides y sont notées aussi, sans email.
- `mail_job` : catégorie `digest` et type de ressource `digest`.

## Réglages (« Notifications et résumé »)

Bloc « Résumé hebdomadaire » pour les présidents et les coachs d’un club :

- case « Recevoir le résumé hebdomadaire » (cochée par défaut pour un président, décochée pour un coach) ;
- jour d’envoi et heure (heure de Bruxelles), « Jour du club » et « Heure du club » par défaut ;
- rubriques à inclure : tâches à traiter, événements des 7 prochains jours, nouvelles inscriptions, documents qui expirent sous 30 jours, cotisations en retard, séances avec effectif insuffisant, dates des subsides, sponsors et comptes à 30 jours, conditions de sponsors et tâches de subsides à 7 jours, solde de trésorerie ;
- date du prochain envoi ;
- « Recevoir un aperçu maintenant » : part tout de suite avec les chiffres du jour, même si le résumé est désactivé (une fois par minute au plus) ;
- pour le président : « Moment par défaut du club ».

Le réglage est aussi trouvable par la recherche des Réglages (« Résumé hebdomadaire »).

## Contenu

Le tableau de bord est calculé pour le mandat de la personne (même fonction que l’accueil, `computeFor`, avec les mêmes droits et les modules désactivés exclus), puis :

- tâches à traiter avec leur nombre (sans répéter celles qui ont leur propre rubrique) ;
- événements des 7 prochains jours visibles par la personne, hors annulés ;
- inscriptions à examiner, documents qui expirent sous 30 jours (gestionnaires des documents), cotisations en retard en nombre de joueurs et en montant (droit Argent) ;
- séances des 7 prochains jours à pastille rouge (effectif sous le seuil du club) ;
- dates des subsides, des partenaires et des comptes annuels à 30 jours (droit Argent) ;
- conditions de sponsors et tâches de subsides dues sous 7 jours ou en retard, avec le nom du responsable : toutes pour le président avec le droit Argent, les siennes pour les autres ;
- solde de trésorerie (droit Argent, module Finances actif). Le solde seul ne fait pas un résumé.

Aucune donnée médicale ni nom de joueur : des nombres, des titres d’événements, des dates de dossiers et le nom des responsables de tâches.

## Email

Sobre, au style de la plateforme : logo du club (sinon son nom), titre serif « Votre semaine », blocs blancs sur fond très clair, bouton « Ouvrir le tableau de bord », version texte brut, langue du destinataire (fr, nl, en). En pied : « Changer le jour, l’heure ou les rubriques » et « Ne plus recevoir ce résumé ». Ce lien ouvre la page de désinscription existante (`/desinscription/[id]`), qui reconnaît maintenant un résumé et coupe la case du résumé.

## Envoi

- Le worker mail (`scripts/mail-worker.ts`) appelle `digestTick` environ une fois par minute : jour et heure lus à Bruxelles (heure d’été comprise), envoi dès que l’heure est atteinte le bon jour, une seule fois par semaine et par personne (ligne `digest_send` prise avant l’email, deux workers ne doublent pas).
- File existante : `publish` avec le type `weekly_digest`, sans notification dans l’application. Au moment de l’envoi, l’email part seulement si la personne a encore son mandat de président ou de coach dans le club et n’a pas coupé toutes ses notifications.
- Rien ne part si toutes les rubriques sont vides.

## Correction en passant

Les rappels de tâches de sponsors et de subsides (vague 15, C1 et C2) étaient annulés par le worker au moment de l’envoi (type de ressource `funding` non reconnu par le contrôle d’éligibilité). Ils partent maintenant vers les comptes qui ont un mandat en cours dans le club.

## Tests

- Unitaires (`tests/wave15-digest.test.ts`) : horloge de Bruxelles (été, hiver, dimanche soir), semaines ISO, moment atteint, prochain envoi, heures proposées, validation, rien pour une semaine vide, rubriques choisies, email texte et HTML échappé dans les trois langues, logo, textes fr/nl/en sans tirets.
- Intégration (`tests/integration/wave15-digest.integration.ts`, deux clubs) : contenu filtré selon les droits (président et coach), une seule fois par semaine, rien pour un club vide, coach activé, contrôle d’éligibilité et mandat révoqué, ni avant l’heure ni un autre jour, moment du club réservé au président, aperçu, lien de désinscription.
- Bout en bout (`tests/e2e/weekly-digest.spec.ts`) : réglages, moment du club, aperçu vide puis envoyé, 320 px, page de désinscription, axe.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
