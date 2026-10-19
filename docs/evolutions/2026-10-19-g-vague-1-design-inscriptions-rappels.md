# Vague 1 : design plus fin, vrai formulaire Tigerstorm, BPCF, relances (19 octobre 2026)

## Design

L'interface est plus compacte : taille de base 15 px au lieu de 17 px, titres, boutons, champs, cartes et marges réduits, barre latérale plus étroite. Sur écran tactile, les boutons et champs gardent 44 px de hauteur.

## Formulaire d'inscription Tigerstorm

Le bouton « Partir du modèle Tigerstorm » reprend le formulaire du club, question par question : genre, numéro de registre national, adresse, code postal, e-mail, téléphone, contact d'urgence, comment nous avez-vous connus, pathologie, taille de maillot, numéro de joueur, joystick (2 au maximum), droit à l'image, paiement en 1 à 4 fois avec le compte BE41 3632 6208 1310. Nom, prénom et date de naissance sont déjà demandés par chaque candidature.

Ajout d'un consentement au traitement des données (dont les données de santé), requis par le RGPD pour la pathologie.

Nouveaux réglages de question dans l'éditeur :

| Réglage                      | Effet                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Type « Choix multiples »     | cases à cocher, avec un maximum facultatif (ex. joystick : 2)                                                                       |
| Type « E-mail »              | adresse vérifiée                                                                                                                    |
| Aide sous la question        | texte d'explication (FR/NL)                                                                                                         |
| Réponse confidentielle       | chiffrée en base, visible seulement par le candidat et le personnel ayant l'habilitation données sensibles                          |
| À l'admission, recopier dans | téléphone, e-mail, contact d'urgence, pathologie (fiche confidentielle), joystick, taille et numéro de maillot, nombre de paiements |

À l'admission, ces réponses remplissent la fiche du joueur (sans écraser ce qui existe déjà). Le nombre de paiements choisi est proposé d'office dans Cotisations, « Admissions à traiter ».

Numéro de registre national : facultatif, chiffré, avec une mention dans le formulaire. Son usage est encadré par la loi belge ; à retirer si la BPCF ne l'exige pas.

## BPCF et affiliation

- Dans Gestion du club, le club choisit sa fédération (en Belgique : la BPCF).
- Un club ne voit que les formations de sa fédération ; une demande vers une autre fédération est refusée.
- Nouvelle page fédération « Clubs affiliés » : clubs, contact, nombre de joueurs, coachs et équipes.
- Notifications : la fédération est prévenue d'une nouvelle demande de formation, le club de la décision.
- Tableau de bord : « Demandes de formation » (fédération) et « Formations à renouveler » sous 60 jours (club).

## Relances (`/reminders`)

- Deux listes : cotisations (échéances passées ou dans les 14 jours) et documents (à fournir, refusés, expirés).
- On coche les personnes qui ne sont pas en ordre et on envoie : e-mail et notification à la personne et à ses représentants, ou à l'e-mail de la fiche si personne n'a de compte.
- Modèles éditables en FR, NL et EN (variables `{person}`, `{amount}`, `{due}`, `{details}`…), aussi visibles dans Notifications.
- Un même rappel part au plus une fois par jour ; la date du dernier rappel est affichée.
- Droits : `dues.manage` pour les cotisations, `documents.manage` pour les documents, double authentification.
- Les paiements seront reconnus automatiquement avec le lot 09 ; en attendant, le trésorier décoche ceux qui ont payé.

## Trésorier

- Préréglage « Trésorier » dans Réglages (cotisations et finances, joueurs et documents en lecture, membres).
- Nouveau chiffre clé « Trésorerie » sur l'accueil de ceux qui gèrent les finances.

## Données

Migration `0021_registrations_affiliation_reminders.sql` : réponses confidentielles chiffrées, taille de maillot, affiliation des clubs, journal des relances, nouveaux types de notification.

## Démo

- La fédération de démo s'appelle « BPCF (démo) » et le club démo y est affilié.
- Le formulaire de démo est le formulaire Tigerstorm, avec une demande remplie (pathologie chiffrée).

## Tests

- Unitaires : réponses à choix multiples, e-mail, séparation des réponses confidentielles, joystick et nombre de paiements, échéances à relancer, modèles de rappel.
- Intégration (`tests/integration/wave1.integration.ts`) : chiffrement et masquage des réponses confidentielles, recopie dans la fiche à l'admission, nombre de paiements proposé, relances et anti-doublon journalier ; formations limitées à la fédération du club et notification à la fédération.
